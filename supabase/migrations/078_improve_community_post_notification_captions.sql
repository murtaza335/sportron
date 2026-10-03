-- ============================================================================
-- 078: Improve Community Post Notification Captions
-- ============================================================================
-- Updates the community_post_created trigger to use more engaging,
-- context-aware captions based on post type (text, photo, match).
-- These captions appear in both in-app notifications and FCM push notifications.
-- ============================================================================

create or replace function public.trg_handle_community_post_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_community_name text;
  v_author_name text;
  v_member record;
  v_title text;
  v_body text;
begin
  -- Only fire on INSERT
  if TG_OP <> 'INSERT' then
    return NEW;
  end if;

  -- Get community name
  select c.name into v_community_name
  from public.communities c where c.id = NEW.community_id;

  -- Get author username
  select p.username into v_author_name
  from public.profiles p where p.id = NEW.author_id;

  -- Build engaging caption based on post type
  case NEW.post_type
    when 'photo' then
      v_title := '📸 New Photo in ' || coalesce(v_community_name, 'the community');
      v_body := coalesce(v_author_name, 'Someone') || ' shared a photo — check it out!';
    when 'match' then
      v_title := '🏓 Match Posted in ' || coalesce(v_community_name, 'the community');
      v_body := coalesce(v_author_name, 'Someone') || ' recorded a match result — see the score!';
    else -- 'text' or any other type
      v_title := '💬 New Update in ' || coalesce(v_community_name, 'the community');
      v_body := coalesce(v_author_name, 'Someone') || ' posted: "' || 
                coalesce(left(NEW.content, 60), '...') || 
                case when length(NEW.content) > 60 then '...' else '' end || '"';
  end case;

  -- Notify all approved community members except the author
  for v_member in
    select cm.profile_id from public.community_members cm
    where cm.community_id = NEW.community_id
      and cm.approval_status = 'approved'
      and cm.profile_id <> NEW.author_id
  loop
    if not public._notification_already_exists(
      v_member.profile_id,
      'community_post_created',
      jsonb_build_object('postId', NEW.id, 'communityId', NEW.community_id)
    ) then
      insert into public.in_app_notifications (user_id, type, title, body, data)
      values (
        v_member.profile_id,
        'community_post_created',
        v_title,
        v_body,
        jsonb_build_object('postId', NEW.id, 'communityId', NEW.community_id, 'postType', NEW.post_type)
      );
    end if;
  end loop;

  return NEW;
end;
$$;

drop trigger if exists trg_handle_community_post_notifications on public.community_posts;
create trigger trg_handle_community_post_notifications
  after insert on public.community_posts
  for each row
  execute function public.trg_handle_community_post_notifications();