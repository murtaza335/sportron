-- ============================================================
-- 070: Fix community_members notification trigger
-- ============================================================
-- Fixes two bugs in trg_handle_community_member_notifications:
--   1. Community deletion (CASCADE) fired "Removed from Community"
--      for every member including the creator
--   2. Leaving a community fired "Removed from Community" instead
--      of being skipped (the user left voluntarily)
--
-- Now skips notifications when:
--   - Community no longer exists (cascade delete)
--   - profile_id matches auth.uid() (user left voluntarily)

create or replace function public.trg_handle_community_member_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_community_name text;
  v_actor_name text;
begin
  select name into v_community_name
  from public.communities where id = (case when TG_OP = 'DELETE' then OLD.community_id else NEW.community_id end);

  -- ─── DELETE: member removed ───
  if TG_OP = 'DELETE' then
    -- Skip notifications when:
    -- 1. Community was deleted (cascade) — community row no longer exists
    -- 2. User left voluntarily — profile_id matches the authenticated user
    if v_community_name is null then
      return OLD;
    end if;

    if OLD.profile_id = auth.uid() then
      return OLD;
    end if;

    if not public._notification_already_exists(
      OLD.profile_id,
      'member_removed',
      jsonb_build_object('communityId', OLD.community_id)
    ) then
      insert into public.in_app_notifications (user_id, type, title, body, data)
      values (
        OLD.profile_id,
        'member_removed',
        'Removed from Community',
        'You were removed from ' || coalesce(v_community_name, 'the community'),
        jsonb_build_object('communityId', OLD.community_id)
      );
    end if;

    return OLD;
  end if;

  -- ─── UPDATE: role changes ───
  if TG_OP = 'UPDATE' and OLD.role is distinct from NEW.role then

    -- member → admin: promotion
    if OLD.role = 'member' and NEW.role = 'admin' then
      if not public._notification_already_exists(
        NEW.profile_id,
        'admin_promoted',
        jsonb_build_object('communityId', NEW.community_id)
      ) then
        insert into public.in_app_notifications (user_id, type, title, body, data)
        values (
          NEW.profile_id,
          'admin_promoted',
          'Promoted to Admin',
          'You were promoted to admin in ' || coalesce(v_community_name, 'the community'),
          jsonb_build_object('communityId', NEW.community_id)
        );
      end if;
    end if;
  end if;

  return NEW;
end;
$$;
