-- 090_add_tournament_rosters.sql
-- Tournaments v2 (rosters): a module is either 'individual' (v1) or 'team'. Team entries own
-- member rows in tournament_entry_members. ADDITIVE ONLY — v1 behaviour is unchanged
-- (every existing module defaults to participant_type = 'individual').
-- See docs/tournaments/PLAN-v2.md §3.1.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Module columns
-- ───────────────────────────────────────────────────────────────────────────
alter table public.tournament_modules
  add column if not exists participant_type text not null default 'individual'
    check (participant_type in ('individual','team')),
  add column if not exists roster_min int check (roster_min between 1 and 40),
  add column if not exists roster_max int check (roster_max between 1 and 40),
  add column if not exists lineup_size int check (lineup_size between 1 and 40);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tm_roster_range') then
    alter table public.tournament_modules
      add constraint tm_roster_range check (
        participant_type = 'individual'
        or (roster_min is not null and roster_max is not null and roster_min <= roster_max));
  end if;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Members table
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.tournament_entry_members (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.tournament_entries(id) on delete cascade,
  module_id uuid not null references public.tournament_modules(id) on delete cascade,     -- denormalised
  tournament_id uuid not null references public.tournaments(id) on delete cascade,        -- denormalised
  name text not null check (char_length(btrim(name)) between 1 and 60),
  profile_id uuid references public.profiles(id) on delete set null,
  field_values jsonb not null default '{}'::jsonb,
  is_captain boolean not null default false,
  squad_number int check (squad_number between 0 and 99),
  sort_order int not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_tem_entry on public.tournament_entry_members (entry_id, sort_order);
create index if not exists idx_tem_profile on public.tournament_entry_members (profile_id)
  where profile_id is not null;
-- B4: one team per person per module
create unique index if not exists tem_cms_unique on public.tournament_entry_members
  (module_id, lower(field_values->>'cms_id')) where coalesce(field_values->>'cms_id','') <> '';
create unique index if not exists tem_profile_unique on public.tournament_entry_members
  (module_id, profile_id) where profile_id is not null;
-- B7
create unique index if not exists tem_one_captain on public.tournament_entry_members (entry_id)
  where is_captain;
create unique index if not exists tem_squad_number on public.tournament_entry_members
  (entry_id, squad_number) where squad_number is not null;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. RLS: SELECT only (admins + the linked member). Writes via SECURITY DEFINER RPCs (091).
-- ───────────────────────────────────────────────────────────────────────────
alter table public.tournament_entry_members enable row level security;

drop policy if exists "tournament_entry_members_select" on public.tournament_entry_members;
create policy "tournament_entry_members_select" on public.tournament_entry_members
  for select to authenticated
  using (public.is_module_admin(module_id) or profile_id = auth.uid());

revoke insert, update, delete, truncate on public.tournament_entry_members from anon, authenticated;
revoke all on public.tournament_entry_members from anon;

drop trigger if exists trg_tournament_entry_members_updated_at on public.tournament_entry_members;
create trigger trg_tournament_entry_members_updated_at before update on public.tournament_entry_members
  for each row execute function public.tournament_set_updated_at();

drop trigger if exists trg_audit_tournament_entry_members on public.tournament_entry_members;
create trigger trg_audit_tournament_entry_members
  after insert or update or delete on public.tournament_entry_members
  for each row execute function public.audit_tournament_table();

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Helpers
-- ───────────────────────────────────────────────────────────────────────────

-- distinct non-null profile ids for an entry: the entry's own profile ∪ its members' profiles
create or replace function public._entry_profile_ids(p_entry uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct pid), '{}'::uuid[])
  from (
    select e.profile_id as pid from public.tournament_entries e where e.id = p_entry
    union all
    select m.profile_id from public.tournament_entry_members m where m.entry_id = p_entry
  ) s
  where pid is not null;
$$;

create or replace function public.is_entry_participant(p_entry uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and auth.uid() = any (public._entry_profile_ids(p_entry));
$$;

create or replace function public.is_module_participant(p_module uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.tournament_entries e
    where e.module_id = p_module
      and (
        e.profile_id = auth.uid()
        or exists (
          select 1 from public.tournament_entry_members m
          where m.entry_id = e.id and m.profile_id = auth.uid()
        )
      )
  );
$$;

revoke all on function public._entry_profile_ids(uuid) from public, anon, authenticated;
revoke all on function public.is_entry_participant(uuid) from public, anon;
revoke all on function public.is_module_participant(uuid) from public, anon;
grant execute on function public.is_entry_participant(uuid) to authenticated;
grant execute on function public.is_module_participant(uuid) to authenticated;
