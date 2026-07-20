-- ============================================================
-- Migration 005: SECURITY DEFINER function for commitment counts
--
-- Bypasses RLS so any authenticated user can see the count of
-- accepted commitments per session without seeing individual
-- user_id data.
-- ============================================================

create or replace function public.get_accepted_commitment_counts(
  p_session_ids uuid[]
)
returns table (session_id uuid, count bigint)
language sql
security definer
set search_path = public
as $$
  select c.session_id, count(*)::bigint
  from public.commitments c
  where c.session_id = any(p_session_ids)
    and c.status = 'accepted'
  group by c.session_id;
$$;
