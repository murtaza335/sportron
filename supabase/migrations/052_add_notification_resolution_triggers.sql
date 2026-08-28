-- ============================================================
-- 052: Add triggers to auto-resolve in-app notifications when
--      community join requests and community invites are responded to
-- ============================================================
-- This ensures notifications are cleaned up regardless of how the
-- action is performed (mobile app, web, API, etc.)

-- -----------------------------------------------------------------------------
-- Trigger for community_join_requests table
-- -----------------------------------------------------------------------------
-- When a join request is approved/rejected, update the corresponding
-- in_app_notifications row (type: 'join_request') to resolved type
-- ('join_approved'/'join_rejected') and mark as read.
-- -----------------------------------------------------------------------------

create or replace function public.resolve_join_request_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_type text;
begin
  -- Only act when status changes from pending to approved/rejected
  if OLD.status = 'pending' and NEW.status in ('approved', 'rejected') then
    v_new_type := case when NEW.status = 'approved' then 'join_approved' else 'join_rejected' end;

    update public.in_app_notifications
    set type = v_new_type,
        read = true
    where type = 'join_request'
      and (data->>'communityId') = NEW.community_id::text
      and (data->>'requesterId') = NEW.user_id::text
      and read = false;

    -- If no pending notification was found (e.g., already resolved), that's fine
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_resolve_join_request_notification on public.community_join_requests;
create trigger trg_resolve_join_request_notification
  after update on public.community_join_requests
  for each row
  execute function public.resolve_join_request_notification();


-- -----------------------------------------------------------------------------
-- Trigger for community_invites table
-- -----------------------------------------------------------------------------
-- When a community invite is accepted/rejected, update the corresponding
-- in_app_notifications row (type: 'community_invite') to resolved type
-- ('community_invite_accepted'/'community_invite_rejected') and mark as read.
-- -----------------------------------------------------------------------------

create or replace function public.resolve_community_invite_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_type text;
begin
  -- Only act when status changes from pending to accepted/rejected
  if OLD.status = 'pending' and NEW.status in ('accepted', 'rejected') then
    v_new_type := case when NEW.status = 'accepted' then 'community_invite_accepted' else 'community_invite_rejected' end;

    update public.in_app_notifications
    set type = v_new_type,
        read = true
    where type = 'community_invite'
      and (data->>'inviteId') = NEW.id::text
      and read = false;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_resolve_community_invite_notification on public.community_invites;
create trigger trg_resolve_community_invite_notification
  after update on public.community_invites
  for each row
  execute function public.resolve_community_invite_notification();