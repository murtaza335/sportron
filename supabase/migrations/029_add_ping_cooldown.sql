-- Enforce a 15-minute cooldown between pings per (community, sender).
-- Blocks a user from pinging the same community again within 15 minutes of
-- their last ping there.

create or replace function public.prevent_ping_spam()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  last_ping timestamp with time zone;
begin
  select created_at into last_ping
  from public.pings
  where community_id = new.community_id
    and sender_id = new.sender_id
  order by created_at desc
  limit 1;

  if last_ping is not null
    and last_ping > now() - interval '15 minutes' then
    raise exception 'You can only ping once every 15 minutes. Please wait before pinging again.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_pings_ping_cooldown on public.pings;
create trigger trg_pings_ping_cooldown
  before insert on public.pings
  for each row execute function public.prevent_ping_spam();