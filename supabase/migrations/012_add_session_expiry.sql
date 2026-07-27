-- Migration: Add expires_at column to sessions table
alter table if exists public.sessions
add column if not exists expires_at timestamptz;

-- Backfill existing open/full sessions with a default expiry (session time + 12h)
update public.sessions
set expires_at = date_time + interval '12 hours'
where expires_at is null and status in ('open', 'full');

-- SECURITY DEFINER function so the client can close expired sessions via RPC
create or replace function public.close_expired_sessions()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.sessions
  set status = 'closed'
  where status in ('open', 'full')
    and expires_at is not null
    and expires_at < now();
end;
$$;
