-- Migration: Chat message edit + delete (own messages)
--   * Edit: the sender can edit a message's content within 15 minutes of sending.
--     The edit trigger stamps `edited_at`; clients render an "Edited" mark.
--   * Delete: the sender can delete a message within 24 hours of sending (hard
--     delete — the bubble disappears everywhere via realtime DELETE).
-- Realtime already broadcasts UPDATE + DELETE for tables in supabase_realtime,
-- so the client handles those events to sync edits and removals live.

alter table public.session_messages
  add column if not exists edited_at timestamptz;

alter table public.community_messages
  add column if not exists edited_at timestamptz;

comment on column public.session_messages.edited_at
  is 'Set by the edit trigger when the sender edits their message within 15 minutes';
comment on column public.community_messages.edited_at
  is 'Set by the edit trigger when the sender edits their message within 15 minutes';

-- ---------------------------------------------------------------------------
-- Session messages
-- ---------------------------------------------------------------------------

-- UPDATE RLS: only the sender may edit, and only within 15 minutes of sending.
create policy "Chat messages editable by sender"
  on public.session_messages for update
  to authenticated
  using (
    sender_id = auth.uid()
    and created_at >= now() - interval '15 minutes'
  )
  with check (
    sender_id = auth.uid()
    and created_at >= now() - interval '15 minutes'
  );

-- Enforce edit rules: caller owns the message, edit is within the window, only
-- the content changes, and `edited_at` is stamped. No-op updates (same content)
-- leave the row untouched so realtime doesn't fire for nothing.
create or replace function public.enforce_session_message_edit()
returns trigger
language plpgsql
as $$
begin
  if new.sender_id is distinct from old.sender_id then
    raise exception 'A message cannot change owner';
  end if;
  if new.sender_id <> auth.uid() then
    raise exception 'You can only edit your own messages';
  end if;
  if old.created_at < now() - interval '15 minutes' then
    raise exception 'Messages can only be edited within 15 minutes of sending';
  end if;
  if new.content <> old.content and trim(coalesce(new.content, '')) = '' then
    raise exception 'Message content cannot be empty';
  end if;
  if new.content = old.content then
    return old;
  end if;
  new.edited_at = now();
  return new;
end $$;

drop trigger if exists trg_session_message_edit on public.session_messages;
create trigger trg_session_message_edit
  before update on public.session_messages
  for each row execute function public.enforce_session_message_edit();

-- DELETE RLS: only the sender may delete, and only within 24 hours of sending.
create policy "Chat messages deletable by sender"
  on public.session_messages for delete
  to authenticated
  using (
    sender_id = auth.uid()
    and created_at >= now() - interval '24 hours'
  );

create or replace function public.enforce_session_message_delete()
returns trigger
language plpgsql
as $$
begin
  if old.sender_id <> auth.uid() then
    raise exception 'You can only delete your own messages';
  end if;
  if old.created_at < now() - interval '24 hours' then
    raise exception 'Messages can only be deleted within 24 hours of sending';
  end if;
  return old;
end $$;

drop trigger if exists trg_session_message_delete on public.session_messages;
create trigger trg_session_message_delete
  before delete on public.session_messages
  for each row execute function public.enforce_session_message_delete();

-- ---------------------------------------------------------------------------
-- Community messages (same rules)
-- ---------------------------------------------------------------------------

create policy "Chat messages editable by sender"
  on public.community_messages for update
  to authenticated
  using (
    sender_id = auth.uid()
    and created_at >= now() - interval '15 minutes'
  )
  with check (
    sender_id = auth.uid()
    and created_at >= now() - interval '15 minutes'
  );

create or replace function public.enforce_community_message_edit()
returns trigger
language plpgsql
as $$
begin
  if new.sender_id is distinct from old.sender_id then
    raise exception 'A message cannot change owner';
  end if;
  if new.sender_id <> auth.uid() then
    raise exception 'You can only edit your own messages';
  end if;
  if old.created_at < now() - interval '15 minutes' then
    raise exception 'Messages can only be edited within 15 minutes of sending';
  end if;
  if new.content <> old.content and trim(coalesce(new.content, '')) = '' then
    raise exception 'Message content cannot be empty';
  end if;
  if new.content = old.content then
    return old;
  end if;
  new.edited_at = now();
  return new;
end $$;

drop trigger if exists trg_community_message_edit on public.community_messages;
create trigger trg_community_message_edit
  before update on public.community_messages
  for each row execute function public.enforce_community_message_edit();

create policy "Chat messages deletable by sender"
  on public.community_messages for delete
  to authenticated
  using (
    sender_id = auth.uid()
    and created_at >= now() - interval '24 hours'
  );

create or replace function public.enforce_community_message_delete()
returns trigger
language plpgsql
as $$
begin
  if old.sender_id <> auth.uid() then
    raise exception 'You can only delete your own messages';
  end if;
  if old.created_at < now() - interval '24 hours' then
    raise exception 'Messages can only be deleted within 24 hours of sending';
  end if;
  return old;
end $$;

drop trigger if exists trg_community_message_delete on public.community_messages;
create trigger trg_community_message_delete
  before delete on public.community_messages
  for each row execute function public.enforce_community_message_delete();