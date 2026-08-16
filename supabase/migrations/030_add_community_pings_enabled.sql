-- Admin can toggle community-wide pings on/off for members.
-- pings_enabled defaults to true; admins may always ping.

alter table public.communities
  add column if not exists pings_enabled boolean not null default true;

-- Block members from pinging when the admin has disabled pings for the
-- community. Admins keep the ability to ping (e.g. to re-announce after
-- re-enabling).
create or replace function public.prevent_pings_when_disabled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.communities c
    where c.id = new.community_id
      and c.pings_enabled = false
      and not exists (
        select 1
        from public.community_members m
        where m.community_id = new.community_id
          and m.profile_id = new.sender_id
          and m.role = 'admin'
      )
  ) then
    raise exception 'Pings are disabled for this community.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_pings_pings_disabled on public.pings;
create trigger trg_pings_pings_disabled
  before insert on public.pings
  for each row execute function public.prevent_pings_when_disabled();