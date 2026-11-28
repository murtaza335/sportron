-- 144_flexible_core_entry_fields.sql
-- Organizations Phase 1, step D (docs/organizations/PLAN.md §6): CMS ID, School, Phone and Email can
-- be Required, Optional or Off per tournament. Name stays required, and which fields are public or
-- private stays locked. New organization tournaments start from the organization's defaults.
--
-- Backward compatible: upsert_tournament_entry_field is NOT changed (installed builds always send
-- is_required = true when renaming a core field, and that keeps being ignored). Entry validation
-- already reads is_required / archived_at from the field rows. Existing entries are untouched.

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
       or NEW.is_public is distinct from OLD.is_public
       or NEW.options is distinct from OLD.options
       or NEW.tournament_id is distinct from OLD.tournament_id
       or (OLD.key = 'name' and (NEW.is_required is distinct from OLD.is_required or NEW.archived_at is not null)) then
      raise exception 'CORE_FIELD_LOCKED';
    end if;
  elsif NEW.is_core then
    raise exception 'CORE_FIELD_LOCKED';  -- cannot promote a custom field to core
  end if;
  return NEW;
end;
$$;

-- Required / Optional / Off for one core field (tournament admins).
create or replace function public.set_core_field_mode(p_field uuid, p_mode text)
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
  if not v_f.is_core or v_f.key = 'name' then
    raise exception 'CORE_FIELD_LOCKED';
  end if;
  if p_mode is null or p_mode not in ('required', 'optional', 'off') then
    raise exception 'FIELD_INVALID:mode';
  end if;
  update public.tournament_entry_fields
     set is_required = (p_mode = 'required'),
         archived_at = case when p_mode = 'off' then coalesce(archived_at, now()) end
   where id = p_field;
end;
$$;
revoke all on function public.set_core_field_mode(uuid, text) from public, anon;
grant execute on function public.set_core_field_mode(uuid, text) to authenticated;

-- Core fields for a new tournament; organization tournaments take the organization's defaults.
create or replace function public.seed_tournament_core_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_modes jsonb := '{}'::jsonb;
begin
  if NEW.organization_id is not null then
    select coalesce(public._org_settings_clean(o.settings, null) -> 'entry_fields', '{}'::jsonb)
      into v_modes
    from public.organizations o where o.id = NEW.organization_id;
  end if;

  insert into public.tournament_entry_fields
    (tournament_id, key, label, field_type, is_required, is_public, is_core, sort_order, archived_at)
  select NEW.id, x.key, x.label, x.field_type,
         coalesce(v_modes ->> x.key, 'required') = 'required',
         x.is_public, true, x.sort_order,
         case when v_modes ->> x.key = 'off' then now() end
  from (values
    ('name',   'Name',   'text',  true,  10),
    ('cms_id', 'CMS ID', 'text',  false, 20),
    ('school', 'School', 'text',  true,  30),
    ('phone',  'Phone',  'phone', false, 40),
    ('email',  'Email',  'email', false, 50)
  ) as x(key, label, field_type, is_public, sort_order)
  on conflict (tournament_id, key) do nothing;
  return NEW;
end;
$$;
