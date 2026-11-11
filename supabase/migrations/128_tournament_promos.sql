-- 128_tournament_promos.sql
-- Roadmap A8: a 6-digit discount code shown on the tournament page (redeemed off-app).
-- ADDITIVE ONLY: new tables + functions. No existing tournament table, RPC or response shape changes,
-- so installed builds simply never see promos.
-- Clients have NO direct table access: reads go through get_tournament_promos (code withheld until
-- revealed, unless the promo is display_mode 'visible'), reveal through reveal_tournament_promo,
-- writes through upsert/end RPCs (tournament admins) or admin_* RPCs (platform staff).

create table if not exists public.tournament_promos (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  code          text not null,
  title         text not null,
  description   text,
  partner_name  text,
  cta_url       text,
  display_mode  text not null default 'reveal',
  starts_at     timestamptz,
  ends_at       timestamptz,
  is_active     boolean not null default true,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_tournament_promos_tournament on public.tournament_promos (tournament_id);

create table if not exists public.tournament_promo_reveals (
  promo_id    uuid not null references public.tournament_promos(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  revealed_at timestamptz not null default now(),
  primary key (promo_id, profile_id)
);

alter table public.tournament_promos enable row level security;
alter table public.tournament_promo_reveals enable row level security;
-- No policies on purpose: no client SELECT/INSERT/UPDATE/DELETE. SECURITY DEFINER functions only.
revoke all on public.tournament_promos from anon, authenticated;
revoke all on public.tournament_promo_reveals from anon, authenticated;

-- ── Validation: on change only (never a CHECK, see AGENTS.md) ───────────────────────────────────
create or replace function public.guard_tournament_promo()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.title := btrim(coalesce(new.title, ''));
  if char_length(new.title) < 1 or char_length(new.title) > 80 then
    raise exception 'FIELD_INVALID:title';
  end if;
  if new.code !~ '^[0-9]{6}$' then
    raise exception 'PROMO_CODE_INVALID';
  end if;
  if new.display_mode not in ('visible', 'reveal', 'hidden') then
    raise exception 'FIELD_INVALID:display_mode';
  end if;
  new.description := nullif(btrim(coalesce(new.description, '')), '');
  if char_length(new.description) > 500 then raise exception 'FIELD_INVALID:description'; end if;
  new.partner_name := nullif(btrim(coalesce(new.partner_name, '')), '');
  if char_length(new.partner_name) > 60 then raise exception 'FIELD_INVALID:partner_name'; end if;
  new.cta_url := nullif(btrim(coalesce(new.cta_url, '')), '');
  if new.cta_url is not null and (char_length(new.cta_url) > 500 or new.cta_url !~* '^https://') then
    raise exception 'FIELD_INVALID:cta_url';
  end if;
  if new.starts_at is not null and new.ends_at is not null and new.ends_at < new.starts_at then
    raise exception 'FIELD_INVALID:ends_at';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_guard_tournament_promo on public.tournament_promos;
create trigger trg_guard_tournament_promo
  before insert or update on public.tournament_promos
  for each row execute function public.guard_tournament_promo();

-- ── Internal writer shared by the tournament-admin and platform-admin RPCs ──────────────────────
-- p_set keys: code, title, description, partner_name, cta_url, display_mode, starts_at, ends_at.
create or replace function public._write_tournament_promo(p_tournament uuid, p_promo uuid, p_set jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.tournament_promos;
  v_id uuid;
begin
  if p_set is null or jsonb_typeof(p_set) <> 'object' then
    raise exception 'FIELD_INVALID:settings';
  end if;
  if not exists (select 1 from public.tournaments where id = p_tournament) then
    raise exception 'NOT_FOUND';
  end if;

  if p_promo is null then
    v.code := coalesce(p_set->>'code', '');
    v.title := coalesce(p_set->>'title', '');
    v.display_mode := coalesce(p_set->>'display_mode', 'reveal');
  else
    select * into v from public.tournament_promos where id = p_promo and tournament_id = p_tournament;
    if not found then raise exception 'NOT_FOUND'; end if;
    if p_set ? 'code' then v.code := coalesce(p_set->>'code', ''); end if;
    if p_set ? 'title' then v.title := coalesce(p_set->>'title', ''); end if;
    if p_set ? 'display_mode' then v.display_mode := coalesce(p_set->>'display_mode', ''); end if;
  end if;
  if p_set ? 'description' then v.description := p_set->>'description'; end if;
  if p_set ? 'partner_name' then v.partner_name := p_set->>'partner_name'; end if;
  if p_set ? 'cta_url' then v.cta_url := p_set->>'cta_url'; end if;
  begin
    if p_set ? 'starts_at' then v.starts_at := nullif(p_set->>'starts_at', '')::timestamptz; end if;
  exception when others then raise exception 'FIELD_INVALID:starts_at';
  end;
  begin
    if p_set ? 'ends_at' then v.ends_at := nullif(p_set->>'ends_at', '')::timestamptz; end if;
  exception when others then raise exception 'FIELD_INVALID:ends_at';
  end;

  if p_promo is null then
    insert into public.tournament_promos
      (tournament_id, code, title, description, partner_name, cta_url, display_mode, starts_at, ends_at, created_by)
    values
      (p_tournament, v.code, v.title, v.description, v.partner_name, v.cta_url, v.display_mode,
       v.starts_at, v.ends_at, auth.uid())
    returning id into v_id;
  else
    update public.tournament_promos
       set code = v.code, title = v.title, description = v.description, partner_name = v.partner_name,
           cta_url = v.cta_url, display_mode = v.display_mode, starts_at = v.starts_at, ends_at = v.ends_at,
           is_active = true
     where id = p_promo
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

revoke all on function public._write_tournament_promo(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public._write_tournament_promo(uuid, uuid, jsonb) to service_role;

-- ── Player reads ────────────────────────────────────────────────────────────────────────────────
-- Active, in-window promos for tournaments the caller can view. `code` is null until the caller has
-- revealed it (or the promo is 'visible'), so it can't be scraped from the list.
create or replace function public.get_tournament_promos(p_tournament uuid)
returns table (
  id uuid,
  tournament_id uuid,
  title text,
  description text,
  partner_name text,
  cta_url text,
  display_mode text,
  ends_at timestamptz,
  revealed boolean,
  code text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not public.can_view_tournament(p_tournament) then
    return;
  end if;
  return query
    select p.id, p.tournament_id, p.title, p.description, p.partner_name, p.cta_url, p.display_mode, p.ends_at,
           (r.profile_id is not null) as revealed,
           case when p.display_mode = 'visible' or r.profile_id is not null then p.code else null end as code
      from public.tournament_promos p
      left join public.tournament_promo_reveals r on r.promo_id = p.id and r.profile_id = auth.uid()
     where p.tournament_id = p_tournament
       and p.is_active
       and (p.starts_at is null or p.starts_at <= now())
       and (p.ends_at is null or p.ends_at > now())
     order by p.created_at desc;
end;
$$;

-- Returns the code and records the reveal (idempotent per user). Used by tap-to-reveal and the hidden easter egg.
create or replace function public.reveal_tournament_promo(p_promo uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.tournament_promos;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  select * into v from public.tournament_promos p
   where p.id = p_promo
     and p.is_active
     and (p.starts_at is null or p.starts_at <= now())
     and (p.ends_at is null or p.ends_at > now());
  if not found or not public.can_view_tournament(v.tournament_id) then
    raise exception 'NOT_FOUND';
  end if;
  insert into public.tournament_promo_reveals (promo_id, profile_id)
  values (v.id, auth.uid())
  on conflict do nothing;
  return v.code;
end;
$$;

-- ── Tournament-admin management ─────────────────────────────────────────────────────────────────
-- All promos (any state) incl. the code and reveal count, for the manage screen.
create or replace function public.get_tournament_promos_manage(p_tournament uuid)
returns table (
  id uuid,
  tournament_id uuid,
  code text,
  title text,
  description text,
  partner_name text,
  cta_url text,
  display_mode text,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean,
  reveal_count bigint,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not public.is_tournament_admin(p_tournament) then
    raise exception 'NOT_ALLOWED';
  end if;
  return query
    select p.id, p.tournament_id, p.code, p.title, p.description, p.partner_name, p.cta_url, p.display_mode,
           p.starts_at, p.ends_at, p.is_active,
           (select count(*) from public.tournament_promo_reveals r where r.promo_id = p.id),
           p.created_at
      from public.tournament_promos p
     where p.tournament_id = p_tournament
     order by p.created_at desc;
end;
$$;

create or replace function public.upsert_tournament_promo(p_tournament uuid, p_promo uuid, p_set jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not public.is_tournament_admin(p_tournament) then
    raise exception 'NOT_ALLOWED';
  end if;
  return public._write_tournament_promo(p_tournament, p_promo, p_set);
end;
$$;

create or replace function public.end_tournament_promo(p_promo uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  select tournament_id into v_t from public.tournament_promos where id = p_promo;
  if v_t is null then raise exception 'NOT_FOUND'; end if;
  if not public.is_tournament_admin(v_t) then
    raise exception 'NOT_ALLOWED';
  end if;
  update public.tournament_promos set is_active = false where id = p_promo;
end;
$$;

-- ── Platform-admin (admin panel) ────────────────────────────────────────────────────────────────
create or replace function public.admin_list_tournament_promos(p_tournament uuid)
returns table (
  id uuid,
  tournament_id uuid,
  code text,
  title text,
  description text,
  partner_name text,
  cta_url text,
  display_mode text,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean,
  reveal_count bigint,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.assert_platform_role(array['super_admin', 'tournament_manager']);
  return query
    select p.id, p.tournament_id, p.code, p.title, p.description, p.partner_name, p.cta_url, p.display_mode,
           p.starts_at, p.ends_at, p.is_active,
           (select count(*) from public.tournament_promo_reveals r where r.promo_id = p.id),
           p.created_at
      from public.tournament_promos p
     where p.tournament_id = p_tournament
     order by p.created_at desc;
end;
$$;

create or replace function public.admin_upsert_tournament_promo(
  p_tournament uuid, p_promo uuid, p_set jsonb, p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform public.assert_platform_role(array['super_admin', 'tournament_manager']);
  v_id := public._write_tournament_promo(p_tournament, p_promo, p_set);
  perform public.log_admin_action(
    case when p_promo is null then 'CREATE_TOURNAMENT_PROMO' else 'UPDATE_TOURNAMENT_PROMO' end,
    'tournament_promos', v_id, null, jsonb_build_object('tournament_id', p_tournament, 'title', p_set->>'title'), p_note
  );
  return v_id;
end;
$$;

create or replace function public.admin_end_tournament_promo(p_promo uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_platform_role(array['super_admin', 'tournament_manager']);
  update public.tournament_promos set is_active = false where id = p_promo;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform public.log_admin_action('END_TOURNAMENT_PROMO', 'tournament_promos', p_promo, null, null, p_note);
end;
$$;

-- ── Privileges ──────────────────────────────────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'get_tournament_promos(uuid)',
    'reveal_tournament_promo(uuid)',
    'get_tournament_promos_manage(uuid)',
    'upsert_tournament_promo(uuid, uuid, jsonb)',
    'end_tournament_promo(uuid)',
    'admin_list_tournament_promos(uuid)',
    'admin_upsert_tournament_promo(uuid, uuid, jsonb, text)',
    'admin_end_tournament_promo(uuid, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
