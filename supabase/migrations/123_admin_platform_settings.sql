-- 123_admin_platform_settings.sql
-- Admin panel v1 (docs/admin-panel/PLAN.md §4): maintenance mode + minimum app version, super admin only.
-- ADDITIVE ONLY. Writes the exact JSON shapes RootLayout already reads:
--   maintenance      -> {"enabled": bool, "message": text}
--   min_app_version  -> {"min_version": "x.y.z", "store_url": text, "message": text}
-- site_config has no audit trigger, so each setter logs old + new values itself.

create or replace function public.admin_get_site_config()
returns table (key text, value jsonb, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.assert_platform_role(array['super_admin']);
  return query
  select sc.key, sc.value, sc.updated_at
  from public.site_config sc
  where sc.key in ('maintenance', 'min_app_version')
  order by sc.key;
end;
$$;

create or replace function public.admin_set_maintenance(
  p_enabled boolean,
  p_message text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_msg text := btrim(coalesce(p_message, ''));
  v_old jsonb;
  v_new jsonb;
begin
  perform public.assert_platform_role(array['super_admin']);
  if p_enabled is null then
    raise exception 'FIELD_INVALID:enabled';
  end if;
  if char_length(v_msg) > 300 then
    raise exception 'FIELD_INVALID:message';
  end if;
  if p_enabled and v_msg = '' then
    raise exception 'FIELD_INVALID:message';
  end if;

  select value into v_old from public.site_config where key = 'maintenance';
  v_new := jsonb_build_object('enabled', p_enabled, 'message', v_msg);

  insert into public.site_config (key, value, updated_at)
  values ('maintenance', v_new, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();

  perform public.log_admin_action(
    'SET_MAINTENANCE', 'site_config', md5('site_config:maintenance')::uuid, v_old, v_new, p_note
  );
end;
$$;

create or replace function public.admin_set_min_app_version(
  p_min_version text,
  p_store_url text,
  p_message text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ver text := btrim(coalesce(p_min_version, ''));
  v_url text := btrim(coalesce(p_store_url, ''));
  v_msg text := btrim(coalesce(p_message, ''));
  v_old jsonb;
  v_new jsonb;
begin
  perform public.assert_platform_role(array['super_admin']);
  if v_ver !~ '^\d+\.\d+\.\d+$' then
    raise exception 'FIELD_INVALID:min_version';
  end if;
  if v_url <> '' and v_url !~ '^https://' then
    raise exception 'FIELD_INVALID:store_url';
  end if;
  if char_length(v_url) > 500 then
    raise exception 'FIELD_INVALID:store_url';
  end if;
  if char_length(v_msg) > 300 then
    raise exception 'FIELD_INVALID:message';
  end if;

  select value into v_old from public.site_config where key = 'min_app_version';
  v_new := jsonb_build_object('min_version', v_ver, 'store_url', v_url, 'message', v_msg);

  insert into public.site_config (key, value, updated_at)
  values ('min_app_version', v_new, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();

  perform public.log_admin_action(
    'SET_MIN_APP_VERSION', 'site_config', md5('site_config:min_app_version')::uuid, v_old, v_new, p_note
  );
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'admin_get_site_config()',
    'admin_set_maintenance(boolean, text, text)',
    'admin_set_min_app_version(text, text, text, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
