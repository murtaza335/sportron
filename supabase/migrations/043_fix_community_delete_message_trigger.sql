-- Migration: Fix community and session deletion blocked by chat message delete trigger
--
-- Problem: When deleting a community, PostgreSQL cascades deletion to `community_messages`.
-- The BEFORE DELETE trigger `trg_community_message_delete` was enforcing the 24-hour sender limit
-- ("Messages can only be deleted within 24 hours of sending"), which aborted community deletion.
--
-- Fix: Bypass the 24-hour and single-sender restrictions when messages are deleted as part of
-- a community (or session) deletion by the creator.

create or replace function public.enforce_community_message_delete()
returns trigger
language plpgsql
as $$
begin
  -- Bypass 24h & sender restrictions if caller is the community creator (or community is deleted)
  if not exists (
    select 1 from public.communities
    where id = old.community_id and created_by <> auth.uid()
  ) then
    return old;
  end if;

  if old.sender_id <> auth.uid() then
    raise exception 'You can only delete your own messages';
  end if;
  if old.created_at < now() - interval '24 hours' then
    raise exception 'Messages can only be deleted within 24 hours of sending';
  end if;
  return old;
end $$;

create or replace function public.enforce_session_message_delete()
returns trigger
language plpgsql
as $$
begin
  -- Bypass 24h & sender restrictions if caller is the session creator (or session is deleted)
  if not exists (
    select 1 from public.sessions
    where id = old.session_id and created_by <> auth.uid()
  ) then
    return old;
  end if;

  if old.sender_id <> auth.uid() then
    raise exception 'You can only delete your own messages';
  end if;
  if old.created_at < now() - interval '24 hours' then
    raise exception 'Messages can only be deleted within 24 hours of sending';
  end if;
  return old;
end $$;
