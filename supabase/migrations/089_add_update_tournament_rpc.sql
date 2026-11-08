-- 089_add_update_tournament_rpc.sql
-- Tournament admins can edit ALL tournament settings (name, description, organization, location,
-- cover image, dates, status) instead of only renaming. ADDITIVE ONLY: new RPC; rename_tournament
-- is untouched so installed builds keep working.
--
-- Unlike the other admin RPCs this deliberately does NOT call _tournament_assert_writable, so an
-- admin can reopen a completed/cancelled tournament by changing its status. Everything else about
-- a finished tournament stays read-only.
--
-- Partial update semantics: p_set is a jsonb object; only keys present are changed (so null can mean
-- "clear the value" for optional fields). Keys: name, description, organization, location,
-- image_url, starts_at, ends_at, status.

create or replace function public.update_tournament(p_tournament uuid, p_set jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t public.tournaments;
  v_name text;
  v_desc text;
  v_org text;
  v_loc text;
  v_img text;
  v_start timestamptz;
  v_end timestamptz;
  v_status text;
begin
  if auth.uid() is null or not public.is_tournament_admin(p_tournament) then
    raise exception 'NOT_ALLOWED';
  end if;
  select * into v_t from public.tournaments where id = p_tournament;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if p_set is null or jsonb_typeof(p_set) <> 'object' then
    raise exception 'FIELD_INVALID:settings';
  end if;

  v_name := v_t.name; v_desc := v_t.description; v_org := v_t.organization; v_loc := v_t.location;
  v_img := v_t.image_url; v_start := v_t.starts_at; v_end := v_t.ends_at; v_status := v_t.status;

  if p_set ? 'name' then
    v_name := btrim(coalesce(p_set->>'name', ''));
    if char_length(v_name) < 3 or char_length(v_name) > 80 then
      raise exception 'FIELD_INVALID:name';
    end if;
  end if;
  if p_set ? 'description' then
    v_desc := nullif(btrim(coalesce(p_set->>'description', '')), '');
    if char_length(v_desc) > 2000 then raise exception 'FIELD_INVALID:description'; end if;
  end if;
  if p_set ? 'organization' then
    v_org := nullif(btrim(coalesce(p_set->>'organization', '')), '');
    if char_length(v_org) > 80 then raise exception 'FIELD_INVALID:organization'; end if;
  end if;
  if p_set ? 'location' then
    v_loc := nullif(btrim(coalesce(p_set->>'location', '')), '');
    if char_length(v_loc) > 120 then raise exception 'FIELD_INVALID:location'; end if;
  end if;
  if p_set ? 'image_url' then
    v_img := nullif(btrim(coalesce(p_set->>'image_url', '')), '');
  end if;
  if p_set ? 'starts_at' then v_start := (p_set->>'starts_at')::timestamptz; end if;
  if p_set ? 'ends_at' then v_end := (p_set->>'ends_at')::timestamptz; end if;
  if v_start is not null and v_end is not null and v_end < v_start then
    raise exception 'FIELD_INVALID:ends_at';
  end if;
  if p_set ? 'status' then
    v_status := p_set->>'status';
    if v_status is null or v_status not in ('draft','published','completed','cancelled') then
      raise exception 'INVALID_STATUS';
    end if;
  end if;

  update public.tournaments
     set name = v_name, description = v_desc, organization = v_org, location = v_loc,
         image_url = v_img, starts_at = v_start, ends_at = v_end, status = v_status
   where id = p_tournament;
end;
$$;

revoke all on function public.update_tournament(uuid, jsonb) from public, anon;
grant execute on function public.update_tournament(uuid, jsonb) to authenticated;
