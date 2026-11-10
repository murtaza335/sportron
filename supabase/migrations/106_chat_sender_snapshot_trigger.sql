-- SEC-H5: sender_username / sender_avatar_url were written by the client, so a member could
-- post as anyone and the forged name appeared in bubbles and push banners. A BEFORE INSERT
-- trigger now overwrites the snapshot from the sender's real profile. Clients may keep
-- sending the fields; they are ignored. A BEFORE UPDATE trigger additionally freezes the
-- identity/location columns of a message so edits cannot rewrite them (silently reverted,
-- never raising, to stay compatible with installed builds).

create or replace function public.set_chat_sender_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_avatar text;
  v_found boolean;
begin
  select p.username, p.avatar_url, true
    into v_username, v_avatar, v_found
    from public.profiles p
   where p.id = new.sender_id;

  if v_found then
    new.sender_username := v_username;
    new.sender_avatar_url := v_avatar;
  end if;
  return new;
end;
$$;

create or replace function public.freeze_chat_message_identity()
returns trigger
language plpgsql
as $$
begin
  new.sender_username := old.sender_username;
  new.sender_avatar_url := old.sender_avatar_url;
  new.reply_to_id := old.reply_to_id;
  new.created_at := old.created_at;
  return new;
end;
$$;

revoke all on function public.set_chat_sender_snapshot() from public, anon, authenticated;
revoke all on function public.freeze_chat_message_identity() from public, anon, authenticated;

drop trigger if exists trg_session_messages_sender_snapshot on public.session_messages;
create trigger trg_session_messages_sender_snapshot
  before insert on public.session_messages
  for each row execute function public.set_chat_sender_snapshot();

drop trigger if exists trg_community_messages_sender_snapshot on public.community_messages;
create trigger trg_community_messages_sender_snapshot
  before insert on public.community_messages
  for each row execute function public.set_chat_sender_snapshot();

drop trigger if exists trg_session_messages_freeze_identity on public.session_messages;
create trigger trg_session_messages_freeze_identity
  before update on public.session_messages
  for each row execute function public.freeze_chat_message_identity();

drop trigger if exists trg_community_messages_freeze_identity on public.community_messages;
create trigger trg_community_messages_freeze_identity
  before update on public.community_messages
  for each row execute function public.freeze_chat_message_identity();
