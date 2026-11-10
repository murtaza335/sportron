-- 093_add_tournament_formats_schema.sql
-- Tournaments v2 (formats): round-robin, groups + knockout, double elimination — SCHEMA ONLY.
-- Existing rows default to bracket_side 'main', stage 1 = exactly the v1 meaning, so v1 single
-- elimination is unchanged. The engine arrives in 094–097. See docs/tournaments/PLAN-v2.md §3.2.
-- Also extends update_tournament_module_settings (091) with the format keys.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Widen the module format check (auto-named constraint → look it up)
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare v_name text;
begin
  for v_name in
    select c.conname from pg_constraint c
    where c.conrelid = 'public.tournament_modules'::regclass and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%single_elimination%'
  loop
    execute format('alter table public.tournament_modules drop constraint %I', v_name);
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'tm_format_check') then
    alter table public.tournament_modules
      add constraint tm_format_check check (format in
        ('single_elimination','round_robin','groups_knockout','double_elimination'));
  end if;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Module settings columns
-- ───────────────────────────────────────────────────────────────────────────
alter table public.tournament_modules
  add column if not exists allow_draws boolean not null default false,
  add column if not exists points_win  int not null default 3 check (points_win  between 0 and 10),
  add column if not exists points_draw int not null default 1 check (points_draw between 0 and 10),
  add column if not exists points_loss int not null default 0 check (points_loss between 0 and 10),
  add column if not exists rr_legs int not null default 1 check (rr_legs in (1,2)),
  add column if not exists group_count int check (group_count between 2 and 16),
  add column if not exists advance_per_group int check (advance_per_group between 1 and 4),
  add column if not exists grand_final_reset boolean not null default true,
  add column if not exists current_stage int not null default 1 check (current_stage in (1,2));

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Groups
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.tournament_groups (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.tournament_modules(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 20),
  letter text not null check (letter ~ '^[A-P]$'),
  sort_order int not null default 0,
  unique (module_id, letter)
);
create index if not exists idx_tournament_groups_module on public.tournament_groups (module_id, sort_order);

create table if not exists public.tournament_group_entries (
  group_id uuid not null references public.tournament_groups(id) on delete cascade,
  entry_id uuid not null references public.tournament_entries(id) on delete cascade,
  module_id uuid not null references public.tournament_modules(id) on delete cascade,
  final_position int,
  qualified boolean,
  primary key (group_id, entry_id),
  unique (module_id, entry_id)
);
create index if not exists idx_tournament_group_entries_module on public.tournament_group_entries (module_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Rounds / matches / entries: structure columns
-- ───────────────────────────────────────────────────────────────────────────
alter table public.tournament_rounds
  add column if not exists bracket_side text not null default 'main'
    check (bracket_side in ('main','winners','losers','grand_final','league','group'));

alter table public.tournament_matches
  add column if not exists bracket_side text not null default 'main'
    check (bracket_side in ('main','winners','losers','grand_final','league','group')),
  add column if not exists group_id uuid references public.tournament_groups(id) on delete cascade,
  add column if not exists code text check (char_length(code) <= 12),
  add column if not exists entry_a_label text check (char_length(entry_a_label) <= 24),
  add column if not exists entry_b_label text check (char_length(entry_b_label) <= 24),
  add column if not exists is_draw boolean not null default false,
  add column if not exists auto_bye boolean not null default false;

alter table public.tournament_entries
  add column if not exists eliminated_side text
    check (eliminated_side in ('main','winners','losers','grand_final','league','group'));

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Unique keys must now include bracket_side (winners/losers/groups share numbers).
--    The v1 constraints were auto-named: look them up, never hard-code.
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare v_name text;
begin
  for v_name in
    select c.conname from pg_constraint c
    where c.conrelid = 'public.tournament_rounds'::regclass and c.contype = 'u'
  loop
    execute format('alter table public.tournament_rounds drop constraint %I', v_name);
  end loop;
  for v_name in
    select c.conname from pg_constraint c
    where c.conrelid = 'public.tournament_matches'::regclass and c.contype = 'u'
  loop
    execute format('alter table public.tournament_matches drop constraint %I', v_name);
  end loop;
end $$;

create unique index if not exists tr_unique_v2 on public.tournament_rounds
  (module_id, stage_number, bracket_side, round_number, is_third_place);
create unique index if not exists tmatch_unique_v2 on public.tournament_matches
  (module_id, stage_number, bracket_side, round_number, match_number, is_third_place);

-- ───────────────────────────────────────────────────────────────────────────
-- 6. RLS: SELECT only
-- ───────────────────────────────────────────────────────────────────────────
alter table public.tournament_groups enable row level security;
alter table public.tournament_group_entries enable row level security;

drop policy if exists "tournament_groups_select" on public.tournament_groups;
create policy "tournament_groups_select" on public.tournament_groups
  for select to authenticated using (public.can_view_module(module_id));

drop policy if exists "tournament_group_entries_select" on public.tournament_group_entries;
create policy "tournament_group_entries_select" on public.tournament_group_entries
  for select to authenticated using (public.can_view_module(module_id));

revoke insert, update, delete, truncate on
  public.tournament_groups, public.tournament_group_entries from anon, authenticated;
revoke all on public.tournament_groups, public.tournament_group_entries from anon;

-- Audit: tournament_groups has an id. tournament_group_entries has a composite key (no id column), so the
-- generic audit_tournament_table() (NEW.id) cannot be attached to it — see PROGRESS "Plan deviations".
drop trigger if exists trg_audit_tournament_groups on public.tournament_groups;
create trigger trg_audit_tournament_groups
  after insert or update or delete on public.tournament_groups
  for each row execute function public.audit_tournament_table();

-- ───────────────────────────────────────────────────────────────────────────
-- 7. update_tournament_module_settings: roster keys (091) + format keys
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.update_tournament_module_settings(p_module uuid, p_set jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m public.tournament_modules;
  v_key text;
  v_ptype text;
  v_rmin int;
  v_rmax int;
  v_lineup int;
  v_max_members int;
  v_entries int;
  v_format text;
  v_draws boolean;
  v_pw int; v_pd int; v_pl int;
  v_legs int;
  v_gcount int;
  v_adv int;
  v_reset boolean;
  v_structure boolean;   -- fixtures/bracket already generated
  v_racket boolean;
begin
  if auth.uid() is null or not public.is_module_admin(p_module) then
    raise exception 'NOT_ALLOWED';
  end if;
  select * into v_m from public.tournament_modules where id = p_module for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  perform public._tournament_assert_writable(v_m.tournament_id);
  if v_m.status in ('completed','cancelled') then
    raise exception 'INVALID_STATUS';
  end if;
  if p_set is null or jsonb_typeof(p_set) <> 'object' then
    raise exception 'FIELD_INVALID:settings';
  end if;

  for v_key in select jsonb_object_keys(p_set) loop
    if v_key not in ('participant_type','roster_min','roster_max','lineup_size',
                     'format','allow_draws','points_win','points_draw','points_loss',
                     'rr_legs','group_count','advance_per_group','grand_final_reset') then
      raise exception 'FIELD_INVALID:%', v_key;
    end if;
  end loop;

  v_structure := v_m.bracket_generated_at is not null
    or exists (select 1 from public.tournament_matches tm where tm.module_id = p_module);
  v_racket := v_m.sport in ('table_tennis','badminton','tennis','squash','pickleball');

  -- ── roster keys (unchanged from 091) ──
  v_ptype := v_m.participant_type;
  v_rmin := v_m.roster_min;
  v_rmax := v_m.roster_max;
  v_lineup := v_m.lineup_size;

  if p_set ? 'participant_type' then
    if jsonb_typeof(p_set -> 'participant_type') <> 'string'
       or (p_set ->> 'participant_type') not in ('individual','team') then
      raise exception 'FIELD_INVALID:participant_type';
    end if;
    v_ptype := p_set ->> 'participant_type';
    if v_ptype is distinct from v_m.participant_type then
      if v_m.status not in ('draft','open') then
        raise exception 'INVALID_STATUS';
      end if;
      select count(*) into v_entries from public.tournament_entries e where e.module_id = p_module;
      if v_entries > 0 then
        raise exception 'INVALID_STATUS';
      end if;
      if v_ptype = 'individual'
         and v_m.sport in ('football','cricket','volleyball','handball','basketball') then
        raise exception 'FIELD_INVALID:participant_type';
      end if;
    end if;
  end if;

  if v_ptype = 'individual' then
    v_rmin := null; v_rmax := null; v_lineup := null;
  else
    if p_set ? 'roster_min' then
      if jsonb_typeof(p_set -> 'roster_min') <> 'number' then raise exception 'FIELD_INVALID:roster_min'; end if;
      v_rmin := (p_set ->> 'roster_min')::numeric::int;
    end if;
    if p_set ? 'roster_max' then
      if jsonb_typeof(p_set -> 'roster_max') <> 'number' then raise exception 'FIELD_INVALID:roster_max'; end if;
      v_rmax := (p_set ->> 'roster_max')::numeric::int;
    end if;
    if p_set ? 'lineup_size' then
      if jsonb_typeof(p_set -> 'lineup_size') = 'null' then
        v_lineup := null;
      elsif jsonb_typeof(p_set -> 'lineup_size') <> 'number' then
        raise exception 'FIELD_INVALID:lineup_size';
      else
        v_lineup := (p_set ->> 'lineup_size')::numeric::int;
      end if;
    end if;
    if v_rmin is null then raise exception 'FIELD_REQUIRED:roster_min'; end if;
    if v_rmax is null then raise exception 'FIELD_REQUIRED:roster_max'; end if;
    if v_rmin not between 1 and 40 then raise exception 'FIELD_INVALID:roster_min'; end if;
    if v_rmax not between 1 and 40 or v_rmax < v_rmin then raise exception 'FIELD_INVALID:roster_max'; end if;
    if v_lineup is not null and v_lineup not between 1 and 40 then raise exception 'FIELD_INVALID:lineup_size'; end if;

    select coalesce(max(c), 0) into v_max_members from (
      select count(*) as c from public.tournament_entry_members tem
      where tem.module_id = p_module group by tem.entry_id) s;
    if v_rmax < v_max_members then
      raise exception 'ROSTER_TOO_LARGE';
    end if;
    if v_m.participant_type = 'team' and v_rmin is distinct from v_m.roster_min
       and v_m.status not in ('draft','open') then
      raise exception 'INVALID_STATUS';
    end if;
  end if;

  -- ── format keys ──
  v_format := v_m.format;
  v_draws := v_m.allow_draws;
  v_pw := v_m.points_win; v_pd := v_m.points_draw; v_pl := v_m.points_loss;
  v_legs := v_m.rr_legs;
  v_gcount := v_m.group_count;
  v_adv := v_m.advance_per_group;
  v_reset := v_m.grand_final_reset;

  if p_set ? 'format' then
    if jsonb_typeof(p_set -> 'format') <> 'string'
       or (p_set ->> 'format') not in ('single_elimination','round_robin','groups_knockout','double_elimination') then
      raise exception 'FIELD_INVALID:format';
    end if;
    v_format := p_set ->> 'format';
    if v_format is distinct from v_m.format and (v_m.status not in ('draft','open') or v_structure) then
      raise exception 'INVALID_STATUS';
    end if;
  end if;

  if p_set ? 'allow_draws' then
    if jsonb_typeof(p_set -> 'allow_draws') <> 'boolean' then raise exception 'FIELD_INVALID:allow_draws'; end if;
    v_draws := (p_set ->> 'allow_draws')::boolean;
    if v_draws is distinct from v_m.allow_draws and v_m.status in ('in_progress') then
      raise exception 'INVALID_STATUS';
    end if;
  end if;
  if v_draws and (v_format not in ('round_robin','groups_knockout') or v_racket) then
    raise exception 'FIELD_INVALID:allow_draws';
  end if;

  if p_set ? 'points_win' or p_set ? 'points_draw' or p_set ? 'points_loss' then
    if p_set ? 'points_win' then
      if jsonb_typeof(p_set -> 'points_win') <> 'number' then raise exception 'FIELD_INVALID:points'; end if;
      v_pw := (p_set ->> 'points_win')::numeric::int;
    end if;
    if p_set ? 'points_draw' then
      if jsonb_typeof(p_set -> 'points_draw') <> 'number' then raise exception 'FIELD_INVALID:points'; end if;
      v_pd := (p_set ->> 'points_draw')::numeric::int;
    end if;
    if p_set ? 'points_loss' then
      if jsonb_typeof(p_set -> 'points_loss') <> 'number' then raise exception 'FIELD_INVALID:points'; end if;
      v_pl := (p_set ->> 'points_loss')::numeric::int;
    end if;
    if v_pw not between 0 and 10 or v_pd not between 0 and 10 or v_pl not between 0 and 10
       or not (v_pw > v_pd and v_pd >= v_pl) then
      raise exception 'FIELD_INVALID:points';
    end if;
    if (v_pw, v_pd, v_pl) is distinct from (v_m.points_win, v_m.points_draw, v_m.points_loss)
       and v_m.status = 'in_progress' then
      raise exception 'INVALID_STATUS';
    end if;
  end if;

  if p_set ? 'rr_legs' then
    if jsonb_typeof(p_set -> 'rr_legs') <> 'number' or (p_set ->> 'rr_legs')::numeric not in (1, 2) then
      raise exception 'FIELD_INVALID:rr_legs';
    end if;
    v_legs := (p_set ->> 'rr_legs')::numeric::int;
    if v_format not in ('round_robin','groups_knockout') then raise exception 'FIELD_INVALID:rr_legs'; end if;
    if v_legs is distinct from v_m.rr_legs and v_structure then raise exception 'INVALID_STATUS'; end if;
  end if;

  if p_set ? 'group_count' then
    if v_format <> 'groups_knockout' then raise exception 'FIELD_INVALID:group_count'; end if;
    if jsonb_typeof(p_set -> 'group_count') = 'null' then
      v_gcount := null;
    elsif jsonb_typeof(p_set -> 'group_count') <> 'number'
          or (p_set ->> 'group_count')::numeric not between 2 and 16 then
      raise exception 'FIELD_INVALID:group_count';
    else
      v_gcount := (p_set ->> 'group_count')::numeric::int;
    end if;
    if v_gcount is distinct from v_m.group_count and v_structure then raise exception 'INVALID_STATUS'; end if;
  end if;

  if p_set ? 'advance_per_group' then
    if v_format <> 'groups_knockout' then raise exception 'FIELD_INVALID:advance_per_group'; end if;
    if jsonb_typeof(p_set -> 'advance_per_group') = 'null' then
      v_adv := null;
    elsif jsonb_typeof(p_set -> 'advance_per_group') <> 'number'
          or (p_set ->> 'advance_per_group')::numeric not between 1 and 4 then
      raise exception 'FIELD_INVALID:advance_per_group';
    else
      v_adv := (p_set ->> 'advance_per_group')::numeric::int;
    end if;
    if v_adv is distinct from v_m.advance_per_group and v_structure then raise exception 'INVALID_STATUS'; end if;
  end if;

  if p_set ? 'grand_final_reset' then
    if jsonb_typeof(p_set -> 'grand_final_reset') <> 'boolean' or v_format <> 'double_elimination' then
      raise exception 'FIELD_INVALID:grand_final_reset';
    end if;
    v_reset := (p_set ->> 'grand_final_reset')::boolean;
    if v_reset is distinct from v_m.grand_final_reset and v_m.status = 'in_progress' then
      raise exception 'INVALID_STATUS';
    end if;
  end if;

  update public.tournament_modules set
    participant_type = v_ptype,
    roster_min = v_rmin,
    roster_max = v_rmax,
    lineup_size = v_lineup,
    format = v_format,
    allow_draws = v_draws,
    points_win = v_pw, points_draw = v_pd, points_loss = v_pl,
    rr_legs = v_legs,
    group_count = v_gcount,
    advance_per_group = v_adv,
    grand_final_reset = v_reset
  where id = p_module;
end;
$$;

revoke all on function public.update_tournament_module_settings(uuid, jsonb) from public, anon;
grant execute on function public.update_tournament_module_settings(uuid, jsonb) to authenticated;
