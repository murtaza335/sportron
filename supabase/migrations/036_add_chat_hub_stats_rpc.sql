-- Migration: get_chat_hub_stats — batched unread counts + last-message timestamps
-- for the Chats hub. Replaces the old N+1 client pattern (one exact-count query
-- per chat + one unbounded full-message scan on every tab focus) with two RPC
-- calls that compute everything in SQL, scoped to the caller's own chats.
--
-- SECURITY DEFINER: this function's internal queries bypass RLS, so membership
-- is enforced explicitly (approved community members; session creator or holder
-- of an accepted commitment). auth.uid() scopes every row to the caller — a
-- client can never read another user's chats.

create or replace function public.get_chat_hub_stats(p_chat_type text)
returns table (
  chat_id uuid,
  unread_count bigint,
  last_message_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return;
  end if;

  -- A community is "my chat" iff I'm an approved member. Unread = messages
  -- newer than my read cursor written by others (no cursor yet => all of them
  -- are unread, matching the old per-chat count semantics).
  if p_chat_type = 'community' then
    return query
      select
        c.id,
        count(cm.id) filter (
          where cm.sender_id <> v_user_id
            and cm.created_at > coalesce(cr.last_read_at, '-infinity'::timestamptz)
        )::bigint,
        max(cm.created_at)
      from public.community_members m
      join public.communities c on c.id = m.community_id
      left join public.community_chat_read cr
        on cr.community_id = c.id and cr.profile_id = v_user_id
      left join public.community_messages cm on cm.community_id = c.id
      where m.profile_id = v_user_id
        and m.approval_status = 'approved'
      group by c.id, cr.last_read_at;

  -- A session is "my chat" iff I created it or hold an accepted commitment.
  elsif p_chat_type = 'session' then
    return query
      select
        s.id,
        count(sm.id) filter (
          where sm.sender_id <> v_user_id
            and sm.created_at > coalesce(sr.last_read_at, '-infinity'::timestamptz)
        )::bigint,
        max(sm.created_at)
      from public.sessions s
      left join public.session_chat_read sr
        on sr.session_id = s.id and sr.profile_id = v_user_id
      left join public.session_messages sm on sm.session_id = s.id
      where s.created_by = v_user_id
         or exists (
           select 1 from public.commitments cmt
           where cmt.session_id = s.id
             and cmt.user_id = v_user_id
             and cmt.status = 'accepted'
         )
      group by s.id, sr.last_read_at;
  end if;
end;
$$;