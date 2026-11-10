-- SEC-M4: chat writes were only restricted client-side after a session ended, there was no
-- DB length cap, and reply_to_id could point at a message from a different chat (which makes
-- get_chat_push_data push "X replied to you" to authors in other chats).
--   * session chat INSERT only while the session is open or full
--   * content length 1..1000 (NOT VALID: legacy rows untouched, new writes checked)
--   * reply_to_id must reference a message of the same chat

drop policy if exists "Chat messages inserted by session members" on public.session_messages;
create policy "Chat messages inserted by session members"
  on public.session_messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.sessions s
      where s.id = session_messages.session_id
        and s.status in ('open', 'full')
        and (
          s.created_by = auth.uid()
          or exists (
            select 1 from public.commitments c
            where c.session_id = s.id and c.user_id = auth.uid() and c.status = 'accepted'
          )
        )
    )
  );

alter table public.session_messages drop constraint if exists session_messages_content_length;
alter table public.session_messages
  add constraint session_messages_content_length check (char_length(content) between 1 and 1000) not valid;
alter table public.community_messages drop constraint if exists community_messages_content_length;
alter table public.community_messages
  add constraint community_messages_content_length check (char_length(content) between 1 and 1000) not valid;

create or replace function public.validate_session_message_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.reply_to_id is not null and not exists (
    select 1 from public.session_messages m
    where m.id = new.reply_to_id and m.session_id = new.session_id
  ) then
    raise exception 'INVALID_REPLY';
  end if;
  return new;
end;
$$;

create or replace function public.validate_community_message_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.reply_to_id is not null and not exists (
    select 1 from public.community_messages m
    where m.id = new.reply_to_id and m.community_id = new.community_id
  ) then
    raise exception 'INVALID_REPLY';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_session_message_reply() from public, anon, authenticated;
revoke all on function public.validate_community_message_reply() from public, anon, authenticated;

drop trigger if exists trg_session_messages_validate_reply on public.session_messages;
create trigger trg_session_messages_validate_reply
  before insert on public.session_messages
  for each row execute function public.validate_session_message_reply();

drop trigger if exists trg_community_messages_validate_reply on public.community_messages;
create trigger trg_community_messages_validate_reply
  before insert on public.community_messages
  for each row execute function public.validate_community_message_reply();
