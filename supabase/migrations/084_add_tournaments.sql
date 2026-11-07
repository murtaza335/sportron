-- 084_add_tournaments.sql
-- Tournament management: schema, permission helpers, RLS (read-only for clients),
-- core entry-field seeding/locking, updated_at + audit triggers, realtime on matches.
-- ADDITIVE ONLY: new tables/functions. Nothing existing is altered.
-- All writes happen through SECURITY DEFINER RPCs (migrations 086/087) or service_role (owner SQL).
-- See docs/tournaments/PLAN.md §2, §3, §4.

-- ───────────────────────────────────────────────────────────────────────────
-- 0. updated_at trigger function (no shared one exists in earlier migrations)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.tournament_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Tables
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 3 and 80),
  description text check (char_length(description) <= 2000),
  organization text check (char_length(organization) <= 80),
  location text check (char_length(location) <= 120),
  image_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft','published','completed','cancelled')),
  community_id uuid references public.communities(id) on delete set null,  -- FUTURE, unused in v1
  created_by uuid references public.profiles(id) on delete set null,       -- null when created via SQL
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_tournaments_status on public.tournaments (status, starts_at);

create table if not exists public.tournament_admins (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (tournament_id, profile_id)
);
create index if not exists idx_tournament_admins_profile on public.tournament_admins (profile_id);

create table if not exists public.tournament_entry_fields (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  label text not null check (char_length(btrim(label)) between 1 and 40),
  field_type text not null default 'text'
    check (field_type in ('text','email','phone','number','select')),
  options jsonb,
  placeholder text check (char_length(placeholder) <= 60),
  is_required boolean not null default false,
  is_public boolean not null default false,
  is_core boolean not null default false,
  sort_order int not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, key),
  constraint tef_options_is_array check (
    options is null or (jsonb_typeof(options) = 'array' and jsonb_array_length(options) <= 20)
  )
);

create table if not exists public.tournament_modules (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 60),
  sport text not null check (sport in (
    'table_tennis','badminton','tennis','squash','pickleball',
    'football','cricket','volleyball','handball','basketball','other'
  )),
  description text check (char_length(description) <= 1000),
  rules_text text check (char_length(rules_text) <= 2000),
  venue text check (char_length(venue) <= 120),
  starts_at timestamptz,
  format text not null default 'single_elimination' check (format in ('single_elimination')),
  status text not null default 'draft'
    check (status in ('draft','open','seeding','in_progress','completed','cancelled')),
  third_place_match boolean not null default false,
  seeding_method text not null default 'manual' check (seeding_method in ('manual','random')),
  max_entries int check (max_entries between 2 and 128),
  bracket_generated_at timestamptz,
  champion_entry_id uuid,       -- FKs added below, after tournament_entries exists
  runner_up_entry_id uuid,
  third_place_entry_id uuid,
  sort_order int not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_tournament_modules_tournament
  on public.tournament_modules (tournament_id, sort_order);

create table if not exists public.tournament_module_admins (
  module_id uuid not null references public.tournament_modules(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (module_id, profile_id)
);
create index if not exists idx_tournament_module_admins_profile
  on public.tournament_module_admins (profile_id);

create table if not exists public.tournament_entries (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.tournament_modules(id) on delete cascade,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,  -- denormalised
  name text not null check (char_length(btrim(name)) between 1 and 60),
  profile_id uuid references public.profiles(id) on delete set null,
  field_values jsonb not null default '{}'::jsonb,
  seed int check (seed >= 1),
  status text not null default 'active' check (status in ('active','withdrawn')),
  eliminated_round int,
  final_rank int,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_tournament_entries_module on public.tournament_entries (module_id, status);
create index if not exists idx_tournament_entries_profile
  on public.tournament_entries (profile_id) where profile_id is not null;
-- A4: CMS ID unique per module (active entries only)
create unique index if not exists tournament_entries_cms_unique
  on public.tournament_entries (module_id, lower(field_values->>'cms_id'))
  where status = 'active' and coalesce(field_values->>'cms_id','') <> '';
create unique index if not exists tournament_entries_profile_unique
  on public.tournament_entries (module_id, profile_id)
  where profile_id is not null and status = 'active';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tm_champion_fk') then
    alter table public.tournament_modules
      add constraint tm_champion_fk foreign key (champion_entry_id)
        references public.tournament_entries(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tm_runner_fk') then
    alter table public.tournament_modules
      add constraint tm_runner_fk foreign key (runner_up_entry_id)
        references public.tournament_entries(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tm_third_fk') then
    alter table public.tournament_modules
      add constraint tm_third_fk foreign key (third_place_entry_id)
        references public.tournament_entries(id) on delete set null;
  end if;
end $$;

create table if not exists public.tournament_rounds (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.tournament_modules(id) on delete cascade,
  stage_number int not null default 1,
  round_number int not null,
  is_third_place boolean not null default false,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  best_of int not null default 1 check (best_of in (1,3,5,7)),
  rules_text text check (char_length(rules_text) <= 500),
  scheduled_start timestamptz,
  unique (module_id, stage_number, round_number, is_third_place)
);

create table if not exists public.tournament_matches (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.tournament_modules(id) on delete cascade,
  round_id uuid not null references public.tournament_rounds(id) on delete cascade,
  stage_number int not null default 1,
  round_number int not null,
  match_number int not null,
  is_third_place boolean not null default false,
  entry_a_id uuid references public.tournament_entries(id) on delete set null,
  entry_b_id uuid references public.tournament_entries(id) on delete set null,
  next_match_id uuid references public.tournament_matches(id) on delete set null,
  next_slot text check (next_slot in ('a','b')),
  loser_next_match_id uuid references public.tournament_matches(id) on delete set null,
  loser_next_slot text check (loser_next_slot in ('a','b')),
  status text not null default 'pending'
    check (status in ('pending','scheduled','completed','walkover','bye','cancelled')),
  scheduled_at timestamptz,
  venue text check (char_length(venue) <= 120),
  court text check (char_length(court) <= 40),
  score_a int check (score_a >= 0),
  score_b int check (score_b >= 0),
  score_detail jsonb,
  winner_entry_id uuid references public.tournament_entries(id) on delete set null,
  result_note text check (char_length(result_note) <= 200),
  recorded_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (module_id, stage_number, round_number, match_number, is_third_place)
);
create index if not exists idx_tournament_matches_module
  on public.tournament_matches (module_id, round_number, match_number);
create index if not exists idx_tournament_rounds_module on public.tournament_rounds (module_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Permission helpers (PLAN §2). STABLE SECURITY DEFINER so RLS policies can
--    consult the admin tables without recursive policy evaluation.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.is_tournament_admin(p_tournament uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.tournament_admins ta
    where ta.tournament_id = p_tournament and ta.profile_id = auth.uid()
  );
$$;

-- A2: tournament admins have module-admin powers in every module of their tournament
create or replace function public.is_module_admin(p_module uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    exists (
      select 1 from public.tournament_module_admins tma
      where tma.module_id = p_module and tma.profile_id = auth.uid()
    )
    or exists (
      select 1
      from public.tournament_modules m
      join public.tournament_admins ta on ta.tournament_id = m.tournament_id
      where m.id = p_module and ta.profile_id = auth.uid()
    )
  );
$$;

create or replace function public.can_view_tournament(p_tournament uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.tournaments t
    where t.id = p_tournament
      and (
        t.status <> 'draft'
        or exists (
          select 1 from public.tournament_admins ta
          where ta.tournament_id = t.id and ta.profile_id = auth.uid()
        )
        or exists (
          select 1
          from public.tournament_modules m
          join public.tournament_module_admins tma on tma.module_id = m.id
          where m.tournament_id = t.id and tma.profile_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.can_view_module(p_module uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.tournament_modules m
    where m.id = p_module
      and public.can_view_tournament(m.tournament_id)
      and (m.status <> 'draft' or public.is_module_admin(m.id))
  );
$$;

revoke all on function public.is_tournament_admin(uuid) from public, anon;
revoke all on function public.is_module_admin(uuid) from public, anon;
revoke all on function public.can_view_tournament(uuid) from public, anon;
revoke all on function public.can_view_module(uuid) from public, anon;
grant execute on function public.is_tournament_admin(uuid) to authenticated;
grant execute on function public.is_module_admin(uuid) to authenticated;
grant execute on function public.can_view_tournament(uuid) to authenticated;
grant execute on function public.can_view_module(uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. RLS: SELECT only. No INSERT/UPDATE/DELETE policies for clients — writes go
--    through SECURITY DEFINER RPCs or service_role (which bypasses RLS).
-- ───────────────────────────────────────────────────────────────────────────

alter table public.tournaments enable row level security;
alter table public.tournament_admins enable row level security;
alter table public.tournament_entry_fields enable row level security;
alter table public.tournament_modules enable row level security;
alter table public.tournament_module_admins enable row level security;
alter table public.tournament_entries enable row level security;
alter table public.tournament_rounds enable row level security;
alter table public.tournament_matches enable row level security;

drop policy if exists "tournaments_select" on public.tournaments;
create policy "tournaments_select" on public.tournaments
  for select to authenticated using (public.can_view_tournament(id));

drop policy if exists "tournament_admins_select" on public.tournament_admins;
create policy "tournament_admins_select" on public.tournament_admins
  for select to authenticated using (public.can_view_tournament(tournament_id));

drop policy if exists "tournament_entry_fields_select" on public.tournament_entry_fields;
create policy "tournament_entry_fields_select" on public.tournament_entry_fields
  for select to authenticated using (public.can_view_tournament(tournament_id));

drop policy if exists "tournament_modules_select" on public.tournament_modules;
create policy "tournament_modules_select" on public.tournament_modules
  for select to authenticated using (public.can_view_module(id));

drop policy if exists "tournament_module_admins_select" on public.tournament_module_admins;
create policy "tournament_module_admins_select" on public.tournament_module_admins
  for select to authenticated using (public.can_view_module(module_id));

-- Entries hold private PII (CMS ID, phone, email): direct SELECT only for admins and the
-- linked entrant. Public reads go through get_module_entries / get_module_bracket (085).
drop policy if exists "tournament_entries_select" on public.tournament_entries;
create policy "tournament_entries_select" on public.tournament_entries
  for select to authenticated
  using (public.is_module_admin(module_id) or profile_id = auth.uid());

drop policy if exists "tournament_rounds_select" on public.tournament_rounds;
create policy "tournament_rounds_select" on public.tournament_rounds
  for select to authenticated using (public.can_view_module(module_id));

drop policy if exists "tournament_matches_select" on public.tournament_matches;
create policy "tournament_matches_select" on public.tournament_matches
  for select to authenticated using (public.can_view_module(module_id));

-- Defence in depth: strip write privileges from client roles entirely.
revoke insert, update, delete, truncate on
  public.tournaments, public.tournament_admins, public.tournament_entry_fields,
  public.tournament_modules, public.tournament_module_admins, public.tournament_entries,
  public.tournament_rounds, public.tournament_matches
from anon, authenticated;
revoke all on
  public.tournaments, public.tournament_admins, public.tournament_entry_fields,
  public.tournament_modules, public.tournament_module_admins, public.tournament_entries,
  public.tournament_rounds, public.tournament_matches
from anon;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Core entry fields: seeded on tournament insert, locked afterwards (PLAN §4)
--    `name` is stored in tournament_entries.name, the others in field_values.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.seed_tournament_core_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.tournament_entry_fields
    (tournament_id, key, label, field_type, is_required, is_public, is_core, sort_order)
  values
    (NEW.id, 'name',   'Name',   'text',  true, true,  true, 10),
    (NEW.id, 'cms_id', 'CMS ID', 'text',  true, false, true, 20),
    (NEW.id, 'school', 'School', 'text',  true, true,  true, 30),
    (NEW.id, 'phone',  'Phone',  'phone', true, false, true, 40),
    (NEW.id, 'email',  'Email',  'email', true, false, true, 50)
  on conflict (tournament_id, key) do nothing;
  return NEW;
end;
$$;

drop trigger if exists trg_seed_tournament_core_fields on public.tournaments;
create trigger trg_seed_tournament_core_fields
  after insert on public.tournaments
  for each row execute function public.seed_tournament_core_fields();

-- Core rows: label / placeholder / sort_order stay editable; everything else is locked and
-- they can never be deleted or archived. Cascade deletes of the parent tournament still work.
create or replace function public.guard_tournament_core_fields()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if OLD.is_core and exists (select 1 from public.tournaments t where t.id = OLD.tournament_id) then
      raise exception 'CORE_FIELD_LOCKED';
    end if;
    return OLD;
  end if;

  -- UPDATE
  if OLD.is_core then
    if NEW.is_core is distinct from OLD.is_core
       or NEW.key is distinct from OLD.key
       or NEW.field_type is distinct from OLD.field_type
       or NEW.is_required is distinct from OLD.is_required
       or NEW.is_public is distinct from OLD.is_public
       or NEW.options is distinct from OLD.options
       or NEW.tournament_id is distinct from OLD.tournament_id
       or NEW.archived_at is not null then
      raise exception 'CORE_FIELD_LOCKED';
    end if;
  elsif NEW.is_core then
    raise exception 'CORE_FIELD_LOCKED';  -- cannot promote a custom field to core
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_guard_tournament_core_fields on public.tournament_entry_fields;
create trigger trg_guard_tournament_core_fields
  before update or delete on public.tournament_entry_fields
  for each row execute function public.guard_tournament_core_fields();

-- ───────────────────────────────────────────────────────────────────────────
-- 5. updated_at triggers
-- ───────────────────────────────────────────────────────────────────────────

drop trigger if exists trg_tournaments_updated_at on public.tournaments;
create trigger trg_tournaments_updated_at before update on public.tournaments
  for each row execute function public.tournament_set_updated_at();

drop trigger if exists trg_tournament_entry_fields_updated_at on public.tournament_entry_fields;
create trigger trg_tournament_entry_fields_updated_at before update on public.tournament_entry_fields
  for each row execute function public.tournament_set_updated_at();

drop trigger if exists trg_tournament_modules_updated_at on public.tournament_modules;
create trigger trg_tournament_modules_updated_at before update on public.tournament_modules
  for each row execute function public.tournament_set_updated_at();

drop trigger if exists trg_tournament_entries_updated_at on public.tournament_entries;
create trigger trg_tournament_entries_updated_at before update on public.tournament_entries
  for each row execute function public.tournament_set_updated_at();

drop trigger if exists trg_tournament_matches_updated_at on public.tournament_matches;
create trigger trg_tournament_matches_updated_at before update on public.tournament_matches
  for each row execute function public.tournament_set_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Audit triggers (reuse log_audit_event from migration 045)
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.audit_tournament_table()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_audit_event('INSERT', tg_table_name, NEW.id, null, to_jsonb(NEW));
    return NEW;
  elsif tg_op = 'UPDATE' then
    perform public.log_audit_event('UPDATE', tg_table_name, NEW.id, to_jsonb(OLD), to_jsonb(NEW));
    return NEW;
  elsif tg_op = 'DELETE' then
    perform public.log_audit_event('DELETE', tg_table_name, OLD.id, to_jsonb(OLD), null);
    return OLD;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_audit_tournaments on public.tournaments;
create trigger trg_audit_tournaments
  after insert or update or delete on public.tournaments
  for each row execute function public.audit_tournament_table();

drop trigger if exists trg_audit_tournament_modules on public.tournament_modules;
create trigger trg_audit_tournament_modules
  after insert or update or delete on public.tournament_modules
  for each row execute function public.audit_tournament_table();

drop trigger if exists trg_audit_tournament_entries on public.tournament_entries;
create trigger trg_audit_tournament_entries
  after insert or update or delete on public.tournament_entries
  for each row execute function public.audit_tournament_table();

drop trigger if exists trg_audit_tournament_matches on public.tournament_matches;
create trigger trg_audit_tournament_matches
  after insert or update or delete on public.tournament_matches
  for each row execute function public.audit_tournament_table();

-- ───────────────────────────────────────────────────────────────────────────
-- 7. Realtime: live bracket updates
-- ───────────────────────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tournament_matches'
  ) then
    alter publication supabase_realtime add table public.tournament_matches;
  end if;
end $$;
