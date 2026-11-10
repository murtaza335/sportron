-- SEC-H7: device FCM tokens were never removed on sign-out and were saved with a racy
-- read-modify-write, so after user A signed out and B signed in on the same phone, BOTH
-- profiles held the token and B's device kept receiving A's pushes (chat text included).
--
--  * claim_fcm_token(p_token): atomically removes the token from every OTHER profile and adds
--    it to the caller. Used by new builds when registering a token.
--  * prune_fcm_tokens(p_tokens): service-role only; the push edge functions call it to drop
--    tokens FCM reports as UNREGISTERED / invalid.
-- Old builds keep using addFCMToken (read-modify-write) which still works.

create or replace function public.claim_fcm_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_token is null or length(p_token) = 0 then
    return;
  end if;

  update public.profiles
     set fcm_tokens = array_remove(fcm_tokens, p_token)
   where id <> auth.uid()
     and fcm_tokens @> array[p_token];

  update public.profiles
     set fcm_tokens = case
           when fcm_tokens @> array[p_token] then fcm_tokens
           else array_append(coalesce(fcm_tokens, '{}'), p_token)
         end
   where id = auth.uid();
end;
$$;

revoke all on function public.claim_fcm_token(text) from public, anon;
grant execute on function public.claim_fcm_token(text) to authenticated;

create or replace function public.prune_fcm_tokens(p_tokens text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user not in ('postgres', 'service_role') then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_tokens is null or array_length(p_tokens, 1) is null then
    return;
  end if;

  update public.profiles
     set fcm_tokens = (
           select coalesce(array_agg(t), '{}')
             from unnest(fcm_tokens) as t
            where t <> all (p_tokens))
   where fcm_tokens && p_tokens;
end;
$$;

revoke all on function public.prune_fcm_tokens(text[]) from public, anon, authenticated;
grant execute on function public.prune_fcm_tokens(text[]) to service_role;
