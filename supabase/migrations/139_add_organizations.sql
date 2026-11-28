-- 139_add_organizations.sql
-- Organizations Phase 1, step B1 (docs/organizations/PLAN.md §4): tables, new tournament columns and
-- helper functions. Nothing uses them yet (permissions change in 140).
--
-- ADDITIVE ONLY: new tables, new nullable columns, new functions. Existing tournaments keep
-- organization_id = null ("Sportron-run") and behave exactly as before.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Tables (no client access: everything goes through SECURITY DEFINER functions)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 3 and 80),
  short_name text check (char_length(btrim(short_name)) between 1 and 20),
  status text not null default 'active' check (status in ('active', 'suspended')),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  suspended_at timestamptz,
  suspended_reason text check (char_length(suspended_reason) <= 200),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists organizations_name_unique on public.organizations (lower(name));

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('admin', 'organizer')),
  added_by uuid references public.profiles(id) on delete set null,
  added_at timestamptz not null default now(),
  removed_at timestamptz,                       -- soft removal keeps the history
  removed_by uuid references public.profiles(id) on delete set null
);
create unique index if not exists organization_members_active_unique
  on public.organization_members (organization_id, profile_id) where removed_at is null;
create index if not exists idx_organization_members_profile
  on public.organization_members (profile_id) where removed_at is null;

-- Plain-language history for the organization's admins. Never contains player contact details.
create table if not exists public.organization_activity (
  id bigserial primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (char_length(action) <= 40),
  tournament_id uuid references public.tournaments(id) on delete set null,
  summary text not null check (char_length(summary) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists idx_organization_activity_org
  on public.organization_activity (organization_id, created_at desc);

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_activity enable row level security;
revoke all on public.organizations, public.organization_members, public.organization_activity
  from anon, authenticated;
revoke all on sequence public.organization_activity_id_seq from anon, authenticated;

drop trigger if exists trg_organizations_updated_at on public.organizations;
create trigger trg_organizations_updated_at
  before update on public.organizations
  for each row execute function public.tournament_set_updated_at();

drop trigger if exists trg_audit_organizations on public.organizations;
create trigger trg_audit_organizations
  after insert or update or delete on public.organizations
  for each row execute function public.audit_tournament_table();

drop trigger if exists trg_audit_organization_members on public.organization_members;
create trigger trg_audit_organization_members
  after insert or update or delete on public.organization_members
  for each row execute function public.audit_tournament_table();

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Tournament columns (nullable; old rows untouched)
-- ───────────────────────────────────────────────────────────────────────────
alter table public.tournaments
  add column if not exists organization_id uuid references public.organizations(id) on delete set null;
alter table public.tournaments add column if not exists hidden_at timestamptz;
alter table public.tournaments
  add column if not exists hidden_by uuid references public.profiles(id) on delete set null;
create index if not exists idx_tournaments_organization
  on public.tournaments (organization_id) where organization_id is not null;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Settings
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public._org_default_settings()
returns jsonb
language sql
immutable
as $$
  select '{
    "promos_enabled": false,
    "brand_locked": true,
    "entry_fields": {"cms_id": "required", "school": "required", "phone": "required", "email": "required"}
  }'::jsonb;
$$;

-- Defaults + current + patch, validated. Unknown keys and values are refused.
create or replace function public._org_settings_clean(p_current jsonb, p_patch jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_out jsonb := public._org_default_settings() || coalesce(p_current, '{}'::jsonb);
  v_key text;
  v_val jsonb;
  v_field text;
  v_mode jsonb;
begin
  if p_patch is null then
    return v_out;
  end if;
  if jsonb_typeof(p_patch) <> 'object' then
    raise exception 'FIELD_INVALID:settings';
  end if;
  for v_key, v_val in select * from jsonb_each(p_patch) loop
    if v_key in ('promos_enabled', 'brand_locked') then
      if jsonb_typeof(v_val) <> 'boolean' then
        raise exception 'FIELD_INVALID:%', v_key;
      end if;
      v_out := jsonb_set(v_out, array[v_key], v_val);
    elsif v_key = 'entry_fields' then
      if jsonb_typeof(v_val) <> 'object' then
        raise exception 'FIELD_INVALID:entry_fields';
      end if;
      for v_field, v_mode in select * from jsonb_each(v_val) loop
        if v_field not in ('cms_id', 'school', 'phone', 'email')
           or jsonb_typeof(v_mode) <> 'string'
           or (v_mode #>> '{}') not in ('required', 'optional', 'off') then
          raise exception 'FIELD_INVALID:entry_fields';
        end if;
        v_out := jsonb_set(v_out, array['entry_fields', v_field], v_mode);
      end loop;
    else
      raise exception 'FIELD_INVALID:settings';
    end if;
  end loop;
  return v_out;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Role helpers
-- ───────────────────────────────────────────────────────────────────────────
-- The active role of a person in an ACTIVE organization. A suspended organization gives nobody a role.
create or replace function public._org_role(p_org uuid, p_uid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.role
  from public.organization_members m
  join public.organizations o on o.id = m.organization_id and o.status = 'active'
  join public.profiles p on p.id = m.profile_id and p.deleted_at is null
  where m.organization_id = p_org and m.profile_id = p_uid and m.removed_at is null;
$$;

create or replace function public.is_org_admin(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and coalesce(public._org_role(p_org, auth.uid()) = 'admin', false);
$$;

create or replace function public.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and public._org_role(p_org, auth.uid()) is not null;
$$;

-- History line; never allowed to break the action it describes.
create or replace function public._org_log(p_org uuid, p_action text, p_tournament uuid, p_summary text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_org is null then
    return;
  end if;
  insert into public.organization_activity (organization_id, actor_id, action, tournament_id, summary)
  values (p_org, auth.uid(), p_action, p_tournament, left(p_summary, 200));
exception when others then
  null;
end;
$$;

revoke all on function public._org_default_settings() from public, anon, authenticated;
revoke all on function public._org_settings_clean(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public._org_role(uuid, uuid) from public, anon, authenticated;
revoke all on function public._org_log(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.is_org_admin(uuid) from public, anon;
revoke all on function public.is_org_member(uuid) from public, anon;
grant execute on function public.is_org_admin(uuid) to authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;
