-- 086_add_tournament_admin_rpcs.sql
-- Admin write RPCs for tournaments (PLAN §6.2, §5.7, §3.2). SECURITY DEFINER, search_path = public,
-- auth + permission guard first, short error codes the client maps to friendly copy
-- (NOT_ALLOWED, NOT_FOUND, INVALID_STATUS, FIELD_REQUIRED:<key>, FIELD_INVALID:<key>,
--  DUPLICATE_CMS_ID, DUPLICATE_PROFILE, DUPLICATE_FIELD_KEY, MAX_ENTRIES, NOT_ENOUGH_ENTRIES,
--  CORE_FIELD_LOCKED). ADDITIVE ONLY. The bracket engine (generate/results/walkover/reset/schedule)
-- is migration 087.

-- ───────────────────────────────────────────────────────────────────────────
-- Internal helper: finished tournaments are read-only for everyone except the owner (SQL).
-- Not granted to any client role.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public._tournament_assert_writable(p_tournament uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select t.status into v_status from public.tournaments t where t.id = p_tournament;
  if v_status is null then
    raise exception 'NOT_FOUND';
  end if;
  if v_status in ('completed','cancelled') then
    raise exception 'INVALID_STATUS';
  end if;
end;
$$;
revoke all on function public._tournament_assert_writable(uuid) from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- Tournament-level
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.rename_tournament(p_tournament uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
begin
  if auth.uid() is null or not public.is_tournament_admin(p_tournament) then
    raise exception 'NOT_ALLOWED';
  end if;
  perform public._tournament_assert_writable(p_tournament);
  if char_length(v_name) < 3 or char_length(v_name) > 80 then
    raise exception 'FIELD_INVALID:name';
  end if;
  update public.tournaments set name = v_name where id = p_tournament;
end;
$$;

-- Create (p_id null) or edit an entry-form field. Core fields: only label / placeholder / sort.
create or replace function public.upsert_tournament_entry_field(
  p_tournament uuid,
  p_id uuid,
  p_key text,
  p_label text,
  p_type text,
  p_options jsonb,
  p_placeholder text,
  p_required boolean,
  p_public boolean,
  p_sort int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text := btrim(coalesce(p_label, ''));
  v_ph text := nullif(btrim(coalesce(p_placeholder, '')), '');
  v_type text := coalesce(p_type, 'text');
  v_f public.tournament_entry_fields;
  v_sort int;
begin
  if auth.uid() is null or not public.is_tournament_admin(p_tournament) then
    raise exception 'NOT_ALLOWED';
  end if;
  perform public._tournament_assert_writable(p_tournament);

  if char_length(v_label) < 1 or char_length(v_label) > 40 then
    raise exception 'FIELD_INVALID:label';
  end if;
  if v_ph is not null and char_length(v_ph) > 60 then
    raise exception 'FIELD_INVALID:placeholder';
  end if;

  if p_id is null then
    -- ── create custom field
    if v_type not in ('text','email','phone','number','select') then
      raise exception 'FIELD_INVALID:field_type';
    end if;
    if p_key is null or p_key !~ '^[a-z][a-z0-9_]{1,39}$' then
      raise exception 'FIELD_INVALID:key';
    end if;
    if v_type = 'select' then
      if p_options is null or jsonb_typeof(p_options) <> 'array'
         or jsonb_array_length(p_options) < 1 or jsonb_array_length(p_options) > 20
         or exists (select 1 from jsonb_array_elements(p_options) o
                    where jsonb_typeof(o) <> 'string' or btrim(o #>> '{}') = '') then
        raise exception 'FIELD_INVALID:options';
      end if;
    else
      p_options := null;
    end if;
    v_sort := coalesce(p_sort,
      (select coalesce(max(f.sort_order), 0) + 10 from public.tournament_entry_fields f
       where f.tournament_id = p_tournament));
    begin
      insert into public.tournament_entry_fields
        (tournament_id, key, label, field_type, options, placeholder,
         is_required, is_public, is_core, sort_order)
      values
        (p_tournament, p_key, v_label, v_type, p_options, v_ph,
         coalesce(p_required, false), coalesce(p_public, false), false, v_sort)
      returning * into v_f;
    exception when unique_violation then
      raise exception 'DUPLICATE_FIELD_KEY';
    end;
  else
    -- ── edit
    select * into v_f from public.tournament_entry_fields f
    where f.id = p_id and f.tournament_id = p_tournament;
    if not found then
      raise exception 'NOT_FOUND';
    end if;
    if v_f.archived_at is not null then
      raise exception 'INVALID_STATUS';
    end if;

    if v_f.is_core then
      update public.tournament_entry_fields
      set label = v_label, placeholder = v_ph, sort_order = coalesce(p_sort, sort_order)
      where id = p_id returning * into v_f;
    else
      if v_type not in ('text','email','phone','number','select') then
        raise exception 'FIELD_INVALID:field_type';
      end if;
      if v_type = 'select' then
        if p_options is null or jsonb_typeof(p_options) <> 'array'
           or jsonb_array_length(p_options) < 1 or jsonb_array_length(p_options) > 20
           or exists (select 1 from jsonb_array_elements(p_options) o
                      where jsonb_typeof(o) <> 'string' or btrim(o #>> '{}') = '') then
          raise exception 'FIELD_INVALID:options';
        end if;
      else
        p_options := null;
      end if;
      -- key is immutable after create
      update public.tournament_entry_fields
      set label = v_label, field_type = v_type, options = p_options, placeholder = v_ph,
          is_required = coalesce(p_required, is_required),
          is_public = coalesce(p_public, is_public),
          sort_order = coalesce(p_sort, sort_order)
      where id = p_id returning * into v_f;
    end if;
  end if;

  return to_jsonb(v_f);
end;
$$;

-- "Remove" = archive: answers already collected are kept but hidden.
create or replace function public.archive_tournament_entry_field(p_field uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_f public.tournament_entry_fields;
begin
  select * into v_f from public.tournament_entry_fields f where f.id = p_field;
  if not found or auth.uid() is null or not public.is_tournament_admin(v_f.tournament_id) then
    raise exception 'NOT_ALLOWED';
  end if;
  perform public._tournament_assert_writable(v_f.tournament_id);
  if v_f.is_core then
    raise exception 'CORE_FIELD_LOCKED';
  end if;
  update public.tournament_entry_fields set archived_at = coalesce(archived_at, now())
  where id = p_field;
end;
$$;

create or replace function public.reorder_tournament_entry_fields(p_tournament uuid, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_tournament_admin(p_tournament) then
    raise exception 'NOT_ALLOWED';
  end if;
  perform public._tournament_assert_writable(p_tournament);
  if p_ids is null or array_length(p_ids, 1) is null then
    raise exception 'FIELD_INVALID:ids';
  end if;
  if (select count(distinct x) from unnest(p_ids) x) <> array_length(p_ids, 1)
     or exists (
       select 1 from unnest(p_ids) x
       where not exists (select 1 from public.tournament_entry_fields f
                         where f.id = x and f.tournament_id = p_tournament)
     ) then
    raise exception 'FIELD_INVALID:ids';
  end if;

  update public.tournament_entry_fields f
  set sort_order = o.ord * 10
  from unnest(p_ids) with ordinality as o(id, ord)
  where f.id = o.id and f.tournament_id = p_tournament;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Modules
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.create_tournament_module(
  p_tournament uuid,
  p_name text,
  p_sport text,
  p_description text,
  p_rules_text text,
  p_venue text,
  p_starts_at timestamptz,
  p_max_entries int,
  p_third_place boolean,
  p_seeding_method text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if auth.uid() is null or not public.is_tournament_admin(p_tournament) then
    raise exception 'NOT_ALLOWED';
  end if;
  perform public._tournament_assert_writable(p_tournament);
  if char_length(v_name) < 2 or char_length(v_name) > 60 then
    raise exception 'FIELD_INVALID:name';
  end if;
  if p_sport is null or p_sport not in ('table_tennis','badminton','tennis','squash','pickleball',
       'football','cricket','volleyball','handball','basketball','other') then
    raise exception 'FIELD_INVALID:sport';
  end if;
  if p_max_entries is not null and (p_max_entries < 2 or p_max_entries > 128) then
    raise exception 'FIELD_INVALID:max_entries';
  end if;
  if coalesce(p_seeding_method, 'manual') not in ('manual','random') then
    raise exception 'FIELD_INVALID:seeding_method';
  end if;

  insert into public.tournament_modules
    (tournament_id, name, sport, description, rules_text, venue, starts_at, max_entries,
     third_place_match, seeding_method, status, sort_order, created_by)
  values
    (p_tournament, v_name, p_sport,
     nullif(btrim(coalesce(p_description, '')), ''),
     nullif(btrim(coalesce(p_rules_text, '')), ''),
     nullif(btrim(coalesce(p_venue, '')), ''),
     p_starts_at, p_max_entries,
     coalesce(p_third_place, false), coalesce(p_seeding_method, 'manual'), 'draft',
     (select coalesce(max(m.sort_order), 0) + 10 from public.tournament_modules m
      where m.tournament_id = p_tournament),
     auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

-- Full-replace update of the editable module fields.
create or replace function public.update_tournament_module(
  p_module uuid,
  p_name text,
  p_sport text,
  p_description text,
  p_rules_text text,
  p_venue text,
  p_starts_at timestamptz,
  p_max_entries int,
  p_third_place boolean,
  p_seeding_method text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m public.tournament_modules;
  v_name text := btrim(coalesce(p_name, ''));
  v_third boolean;
  v_seeding text;
begin
  if auth.uid() is null or not public.is_module_admin(p_module) then
    raise exception 'NOT_ALLOWED';
  end if;
  select * into v_m from public.tournament_modules where id = p_module;
  perform public._tournament_assert_writable(v_m.tournament_id);
  if v_m.status in ('completed','cancelled') then
    raise exception 'INVALID_STATUS';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 60 then
    raise exception 'FIELD_INVALID:name';
  end if;
  if p_max_entries is not null and (p_max_entries < 2 or p_max_entries > 128) then
    raise exception 'FIELD_INVALID:max_entries';
  end if;
  if p_max_entries is not null
     and (select count(*) from public.tournament_entries e
          where e.module_id = p_module and e.status = 'active') > p_max_entries then
    raise exception 'MAX_ENTRIES';
  end if;

  -- sport: only draft/open and no bracket yet
  if p_sport is distinct from v_m.sport then
    if p_sport is null or p_sport not in ('table_tennis','badminton','tennis','squash','pickleball',
         'football','cricket','volleyball','handball','basketball','other') then
      raise exception 'FIELD_INVALID:sport';
    end if;
    if v_m.status not in ('draft','open')
       or exists (select 1 from public.tournament_matches tm where tm.module_id = p_module) then
      raise exception 'INVALID_STATUS';
    end if;
  end if;

  v_third := coalesce(p_third_place, v_m.third_place_match);
  v_seeding := coalesce(p_seeding_method, v_m.seeding_method);
  if v_seeding not in ('manual','random') then
    raise exception 'FIELD_INVALID:seeding_method';
  end if;
  -- 3rd-place / seeding method: only before play starts; 3rd-place also needs no generated bracket
  if v_third is distinct from v_m.third_place_match then
    if v_m.status not in ('draft','open','seeding') or v_m.bracket_generated_at is not null then
      raise exception 'INVALID_STATUS';
    end if;
  end if;
  if v_seeding is distinct from v_m.seeding_method and v_m.status not in ('draft','open','seeding') then
    raise exception 'INVALID_STATUS';
  end if;

  update public.tournament_modules set
    name = v_name,
    sport = coalesce(p_sport, sport),
    description = nullif(btrim(coalesce(p_description, '')), ''),
    rules_text = nullif(btrim(coalesce(p_rules_text, '')), ''),
    venue = nullif(btrim(coalesce(p_venue, '')), ''),
    starts_at = p_starts_at,
    max_entries = p_max_entries,
    third_place_match = v_third,
    seeding_method = v_seeding
  where id = p_module;
end;
$$;

create or replace function public.delete_tournament_module(p_module uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m public.tournament_modules;
begin
  select * into v_m from public.tournament_modules where id = p_module;
  if not found or auth.uid() is null or not public.is_tournament_admin(v_m.tournament_id) then
    raise exception 'NOT_ALLOWED';
  end if;
  perform public._tournament_assert_writable(v_m.tournament_id);
  if v_m.status not in ('draft','open','cancelled') then
    raise exception 'INVALID_STATUS';
  end if;
  delete from public.tournament_modules where id = p_module;
end;
$$;

create or replace function public.add_module_admin(p_module uuid, p_profile uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m public.tournament_modules;
begin
  select * into v_m from public.tournament_modules where id = p_module;
  if not found or auth.uid() is null or not public.is_tournament_admin(v_m.tournament_id) then
    raise exception 'NOT_ALLOWED';
  end if;
  perform public._tournament_assert_writable(v_m.tournament_id);
  if not exists (select 1 from public.public_profiles p
                 where p.id = p_profile and p.deleted_at is null) then
    raise exception 'NOT_FOUND';
  end if;
  insert into public.tournament_module_admins (module_id, profile_id, added_by)
  values (p_module, p_profile, auth.uid())
  on conflict (module_id, profile_id) do nothing;
end;
$$;

create or replace function public.remove_module_admin(p_module uuid, p_profile uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m public.tournament_modules;
begin
  select * into v_m from public.tournament_modules where id = p_module;
  if not found or auth.uid() is null or not public.is_tournament_admin(v_m.tournament_id) then
    raise exception 'NOT_ALLOWED';
  end if;
  perform public._tournament_assert_writable(v_m.tournament_id);
  delete from public.tournament_module_admins
  where module_id = p_module and profile_id = p_profile;
end;
$$;

-- Lifecycle (PLAN §3.2). `completed` is automatic (engine, 087), never set here.
create or replace function public.set_module_status(p_module uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m public.tournament_modules;
  v_active int;
begin
  if auth.uid() is null or not public.is_module_admin(p_module) then
    raise exception 'NOT_ALLOWED';
  end if;
  select * into v_m from public.tournament_modules where id = p_module for update;
  perform public._tournament_assert_writable(v_m.tournament_id);

  if p_status is null or p_status not in ('draft','open','seeding','in_progress','cancelled') then
    raise exception 'INVALID_STATUS';
  end if;
  if v_m.status in ('completed','cancelled') then
    raise exception 'INVALID_STATUS';
  end if;

  select count(*) into v_active from public.tournament_entries e
  where e.module_id = p_module and e.status = 'active';

  if v_m.status = 'draft' and p_status = 'open' then
    null;
  elsif v_m.status = 'open' and p_status = 'draft' then
    null;
  elsif v_m.status = 'open' and p_status = 'seeding' then
    if v_active < 2 then
      raise exception 'NOT_ENOUGH_ENTRIES';
    end if;
  elsif v_m.status = 'seeding' and p_status = 'in_progress' then
    if v_m.bracket_generated_at is null
       or not exists (select 1 from public.tournament_matches tm where tm.module_id = p_module) then
      raise exception 'INVALID_STATUS';
    end if;
  elsif v_m.status = 'seeding' and p_status = 'open' then
    -- deletes the generated bracket (rounds cascade to matches)
    delete from public.tournament_rounds where module_id = p_module;
    update public.tournament_entries
      set eliminated_round = null, final_rank = null
      where module_id = p_module;
    update public.tournament_modules
      set bracket_generated_at = null,
          champion_entry_id = null, runner_up_entry_id = null, third_place_entry_id = null
      where id = p_module;
  elsif p_status = 'cancelled' then
    null;
  else
    raise exception 'INVALID_STATUS';
  end if;

  update public.tournament_modules set status = p_status where id = p_module;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Entries
-- ───────────────────────────────────────────────────────────────────────────

-- Create (p_entry null) or edit an entry. Validates against the tournament's non-archived fields.
-- `name` is the core "Name" field and lives in tournament_entries.name; everything else in field_values.
create or replace function public.upsert_tournament_entry(
  p_module uuid,
  p_entry uuid,
  p_name text,
  p_profile uuid,
  p_field_values jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m public.tournament_modules;
  v_name text := btrim(coalesce(p_name, ''));
  v_in jsonb := coalesce(p_field_values, '{}'::jsonb);
  v_clean jsonb := '{}'::jsonb;
  v_old public.tournament_entries;
  v_f record;
  v_raw text;
  v_id uuid;
  v_constraint text;
begin
  if auth.uid() is null or not public.is_module_admin(p_module) then
    raise exception 'NOT_ALLOWED';
  end if;
  select * into v_m from public.tournament_modules where id = p_module;
  perform public._tournament_assert_writable(v_m.tournament_id);
  if v_m.status not in ('draft','open') then
    raise exception 'INVALID_STATUS';
  end if;

  if jsonb_typeof(v_in) <> 'object' then
    raise exception 'FIELD_INVALID:field_values';
  end if;
  if v_name = '' then
    raise exception 'FIELD_REQUIRED:name';
  end if;
  if char_length(v_name) > 60 then
    raise exception 'FIELD_INVALID:name';
  end if;

  if p_profile is not null and not exists (
       select 1 from public.public_profiles p where p.id = p_profile and p.deleted_at is null) then
    raise exception 'NOT_FOUND';
  end if;

  if p_entry is not null then
    select * into v_old from public.tournament_entries e
    where e.id = p_entry and e.module_id = p_module;
    if not found then
      raise exception 'NOT_FOUND';
    end if;
    if v_old.status <> 'active' then
      raise exception 'INVALID_STATUS';
    end if;
    -- keep answers for archived (hidden) fields
    v_clean := coalesce((
      select jsonb_object_agg(kv.key, kv.value)
      from jsonb_each(v_old.field_values) kv
      where exists (select 1 from public.tournament_entry_fields f
                    where f.tournament_id = v_m.tournament_id and f.key = kv.key
                      and f.archived_at is not null)
    ), '{}'::jsonb);
  else
    if v_m.max_entries is not null
       and (select count(*) from public.tournament_entries e
            where e.module_id = p_module and e.status = 'active') >= v_m.max_entries then
      raise exception 'MAX_ENTRIES';
    end if;
  end if;

  for v_f in
    select f.* from public.tournament_entry_fields f
    where f.tournament_id = v_m.tournament_id and f.archived_at is null and f.key <> 'name'
    order by f.sort_order, f.created_at
  loop
    v_raw := case when jsonb_typeof(v_in -> v_f.key) in ('string','number')
                  then btrim(v_in ->> v_f.key) else null end;
    if v_raw is null or v_raw = '' then
      if v_f.is_required then
        raise exception 'FIELD_REQUIRED:%', v_f.key;
      end if;
      continue;
    end if;
    if char_length(v_raw) > 200 then
      raise exception 'FIELD_INVALID:%', v_f.key;
    end if;
    if v_f.field_type = 'email' and v_raw !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'FIELD_INVALID:%', v_f.key;
    elsif v_f.field_type = 'phone' and v_raw !~ '^\+?[0-9\s-]{7,20}$' then
      raise exception 'FIELD_INVALID:%', v_f.key;
    elsif v_f.field_type = 'number' and v_raw !~ '^-?[0-9]+(\.[0-9]+)?$' then
      raise exception 'FIELD_INVALID:%', v_f.key;
    elsif v_f.field_type = 'select' and not exists (
        select 1 from jsonb_array_elements_text(coalesce(v_f.options, '[]'::jsonb)) o
        where o = v_raw) then
      raise exception 'FIELD_INVALID:%', v_f.key;
    end if;
    v_clean := v_clean || jsonb_build_object(v_f.key, v_raw);
  end loop;

  begin
    if p_entry is null then
      insert into public.tournament_entries
        (module_id, tournament_id, name, profile_id, field_values, created_by)
      values (p_module, v_m.tournament_id, v_name, p_profile, v_clean, auth.uid())
      returning id into v_id;
    else
      update public.tournament_entries
      set name = v_name, profile_id = p_profile, field_values = v_clean
      where id = p_entry
      returning id into v_id;
    end if;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'tournament_entries_cms_unique' then
      raise exception 'DUPLICATE_CMS_ID';
    elsif v_constraint = 'tournament_entries_profile_unique' then
      raise exception 'DUPLICATE_PROFILE';
    end if;
    raise;
  end;

  return v_id;
end;
$$;

-- Hard delete: only while entries are still being collected.
create or replace function public.delete_tournament_entry(p_entry uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_e public.tournament_entries;
  v_m public.tournament_modules;
begin
  select * into v_e from public.tournament_entries where id = p_entry;
  if not found or auth.uid() is null or not public.is_module_admin(v_e.module_id) then
    raise exception 'NOT_ALLOWED';
  end if;
  select * into v_m from public.tournament_modules where id = v_e.module_id;
  perform public._tournament_assert_writable(v_m.tournament_id);
  if v_m.status not in ('draft','open') then
    raise exception 'INVALID_STATUS';
  end if;
  delete from public.tournament_entries where id = p_entry;
end;
$$;

-- Withdraw (PLAN §5.7): `open` or `in_progress`. Does NOT auto-resolve matches — the UI then
-- prompts the admin to record a walkover for that entry's pending match.
create or replace function public.withdraw_tournament_entry(p_entry uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_e public.tournament_entries;
  v_m public.tournament_modules;
begin
  select * into v_e from public.tournament_entries where id = p_entry;
  if not found or auth.uid() is null or not public.is_module_admin(v_e.module_id) then
    raise exception 'NOT_ALLOWED';
  end if;
  select * into v_m from public.tournament_modules where id = v_e.module_id;
  perform public._tournament_assert_writable(v_m.tournament_id);
  if v_m.status not in ('open','in_progress') or v_e.status <> 'active' then
    raise exception 'INVALID_STATUS';
  end if;

  update public.tournament_entries set status = 'withdrawn' where id = p_entry;
  perform public.log_audit_event(
    'WITHDRAW', 'tournament_entries', p_entry, null, null,
    jsonb_build_object('reason', nullif(btrim(coalesce(p_reason, '')), ''),
                       'module_id', v_e.module_id));
end;
$$;

-- Seeds 1..n in the given order. Must list every active entry exactly once.
create or replace function public.set_module_seeds(p_module uuid, p_entry_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m public.tournament_modules;
  v_active int;
begin
  if auth.uid() is null or not public.is_module_admin(p_module) then
    raise exception 'NOT_ALLOWED';
  end if;
  select * into v_m from public.tournament_modules where id = p_module;
  perform public._tournament_assert_writable(v_m.tournament_id);
  if v_m.status not in ('open','seeding') then
    raise exception 'INVALID_STATUS';
  end if;

  select count(*) into v_active from public.tournament_entries e
  where e.module_id = p_module and e.status = 'active';

  if p_entry_ids is null
     or coalesce(array_length(p_entry_ids, 1), 0) <> v_active
     or (select count(distinct x) from unnest(p_entry_ids) x) <> v_active
     or exists (
       select 1 from unnest(p_entry_ids) x
       where not exists (select 1 from public.tournament_entries e
                         where e.id = x and e.module_id = p_module and e.status = 'active')
     ) then
    raise exception 'FIELD_INVALID:entry_ids';
  end if;

  update public.tournament_entries e
  set seed = o.ord
  from unnest(p_entry_ids) with ordinality as o(id, ord)
  where e.id = o.id and e.module_id = p_module;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Rounds
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.update_tournament_round(
  p_round uuid,
  p_name text,
  p_best_of int,
  p_rules_text text,
  p_scheduled_start timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r public.tournament_rounds;
  v_m public.tournament_modules;
  v_name text := btrim(coalesce(p_name, ''));
begin
  select * into v_r from public.tournament_rounds where id = p_round;
  if not found or auth.uid() is null or not public.is_module_admin(v_r.module_id) then
    raise exception 'NOT_ALLOWED';
  end if;
  select * into v_m from public.tournament_modules where id = v_r.module_id;
  perform public._tournament_assert_writable(v_m.tournament_id);
  if v_m.status in ('completed','cancelled') then
    raise exception 'INVALID_STATUS';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 40 then
    raise exception 'FIELD_INVALID:name';
  end if;
  if p_best_of is null or p_best_of not in (1,3,5,7) then
    raise exception 'FIELD_INVALID:best_of';
  end if;
  if p_rules_text is not null and char_length(p_rules_text) > 500 then
    raise exception 'FIELD_INVALID:rules_text';
  end if;

  update public.tournament_rounds
  set name = v_name, best_of = p_best_of,
      rules_text = nullif(btrim(coalesce(p_rules_text, '')), ''),
      scheduled_start = p_scheduled_start
  where id = p_round
  returning * into v_r;

  return to_jsonb(v_r);
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Grants (authenticated only; the guard inside each function does the real check)
-- ───────────────────────────────────────────────────────────────────────────
revoke all on function public.rename_tournament(uuid, text) from public, anon;
revoke all on function public.upsert_tournament_entry_field(uuid, uuid, text, text, text, jsonb, text, boolean, boolean, int) from public, anon;
revoke all on function public.archive_tournament_entry_field(uuid) from public, anon;
revoke all on function public.reorder_tournament_entry_fields(uuid, uuid[]) from public, anon;
revoke all on function public.create_tournament_module(uuid, text, text, text, text, text, timestamptz, int, boolean, text) from public, anon;
revoke all on function public.update_tournament_module(uuid, text, text, text, text, text, timestamptz, int, boolean, text) from public, anon;
revoke all on function public.delete_tournament_module(uuid) from public, anon;
revoke all on function public.add_module_admin(uuid, uuid) from public, anon;
revoke all on function public.remove_module_admin(uuid, uuid) from public, anon;
revoke all on function public.set_module_status(uuid, text) from public, anon;
revoke all on function public.upsert_tournament_entry(uuid, uuid, text, uuid, jsonb) from public, anon;
revoke all on function public.delete_tournament_entry(uuid) from public, anon;
revoke all on function public.withdraw_tournament_entry(uuid, text) from public, anon;
revoke all on function public.set_module_seeds(uuid, uuid[]) from public, anon;
revoke all on function public.update_tournament_round(uuid, text, int, text, timestamptz) from public, anon;

grant execute on function public.rename_tournament(uuid, text) to authenticated;
grant execute on function public.upsert_tournament_entry_field(uuid, uuid, text, text, text, jsonb, text, boolean, boolean, int) to authenticated;
grant execute on function public.archive_tournament_entry_field(uuid) to authenticated;
grant execute on function public.reorder_tournament_entry_fields(uuid, uuid[]) to authenticated;
grant execute on function public.create_tournament_module(uuid, text, text, text, text, text, timestamptz, int, boolean, text) to authenticated;
grant execute on function public.update_tournament_module(uuid, text, text, text, text, text, timestamptz, int, boolean, text) to authenticated;
grant execute on function public.delete_tournament_module(uuid) to authenticated;
grant execute on function public.add_module_admin(uuid, uuid) to authenticated;
grant execute on function public.remove_module_admin(uuid, uuid) to authenticated;
grant execute on function public.set_module_status(uuid, text) to authenticated;
grant execute on function public.upsert_tournament_entry(uuid, uuid, text, uuid, jsonb) to authenticated;
grant execute on function public.delete_tournament_entry(uuid) to authenticated;
grant execute on function public.withdraw_tournament_entry(uuid, text) to authenticated;
grant execute on function public.set_module_seeds(uuid, uuid[]) to authenticated;
grant execute on function public.update_tournament_round(uuid, text, int, text, timestamptz) to authenticated;
