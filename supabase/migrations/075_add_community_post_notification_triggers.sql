-- ============================================================================
-- Community Post Notification Triggers (Fixed ambiguous column references)
-- ============================================================================
-- Adds AFTER INSERT triggers on community_posts, community_post_likes, 
-- community_post_comments to create in-app notifications for community members.
-- Uses v_ prefix for variables and explicit table aliases to avoid ambiguous column references.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. COMMUNITY_POSTS — community_post_created (notify community members)
-- ---------------------------------------------------------------------------

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
        'New Post in ' || coalesce(v_community_name, 'Community'),
        coalesce(v_author_name, 'Someone') || ' posted in ' || coalesce(v_community_name, 'the community'),
        jsonb_build_object('postId', NEW.id, 'communityId', NEW.community_id)
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


-- ---------------------------------------------------------------------------
-- 2. COMMUNITY_POST_LIKES — community_post_liked (notify post author)
-- ---------------------------------------------------------------------------

create or replace function public.trg_handle_community_post_like_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post_author uuid;
  v_community_id uuid;
  v_liker_name text;
begin
  if TG_OP <> 'INSERT' then
    return NEW;
  end if;

  -- Get post author and community
  select cp.author_id, cp.community_id into v_post_author, v_community_id
  from public.community_posts cp where cp.id = NEW.post_id;

  if v_post_author is null or v_post_author = NEW.profile_id then
    return NEW;
  end if;

  select p.username into v_liker_name
  from public.profiles p where p.id = NEW.profile_id;

  if not public._notification_already_exists(
    v_post_author,
    'community_post_liked',
    jsonb_build_object('postId', NEW.post_id, 'communityId', v_community_id)
  ) then
    insert into public.in_app_notifications (user_id, type, title, body, data)
    values (
      v_post_author,
      'community_post_liked',
      'New Like on Your Post',
      coalesce(v_liker_name, 'Someone') || ' liked your post',
      jsonb_build_object('postId', NEW.post_id, 'communityId', v_community_id)
    );
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_handle_community_post_like_notifications on public.community_post_likes;
create trigger trg_handle_community_post_like_notifications
  after insert on public.community_post_likes
  for each row
  execute function public.trg_handle_community_post_like_notifications();


-- ---------------------------------------------------------------------------
-- 3. COMMUNITY_POST_COMMENTS — community_post_commented (notify post author)
-- ---------------------------------------------------------------------------

create or replace function public.trg_handle_community_post_comment_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post_author uuid;
  v_community_id uuid;
  v_commenter_name text;
begin
  if TG_OP <> 'INSERT' then
    return NEW;
  end if;

  -- Get post author and community
  select cp.author_id, cp.community_id into v_post_author, v_community_id
  from public.community_posts cp where cp.id = NEW.post_id;

  if v_post_author is null or v_post_author = NEW.profile_id then
    return NEW;
  end if;

  select p.username into v_commenter_name
  from public.profiles p where p.id = NEW.profile_id;

  if not public._notification_already_exists(
    v_post_author,
    'community_post_commented',
    jsonb_build_object('postId', NEW.post_id, 'communityId', v_community_id, 'commentId', NEW.id)
  ) then
    insert into public.in_app_notifications (user_id, type, title, body, data)
    values (
      v_post_author,
      'community_post_commented',
      'New Comment on Your Post',
      coalesce(v_commenter_name, 'Someone') || ' commented on your post',
      jsonb_build_object('postId', NEW.post_id, 'communityId', v_community_id, 'commentId', NEW.id)
    );
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_handle_community_post_comment_notifications on public.community_post_comments;
create trigger trg_handle_community_post_comment_notifications
  after insert on public.community_post_comments
  for each row
  execute function public.trg_handle_community_post_comment_notifications();