-- SEC-L1: avatar_url / image_url columns accepted any string via the API (tracking pixels,
-- hostile hosts). Uploads always return a Cloudinary secure_url, so a changed value must now be
-- https://res.cloudinary.com/... (NULL/empty stay allowed).
--
-- Implemented as a BEFORE trigger that only validates when the column value CHANGES, not as a
-- CHECK constraint: a CHECK (even NOT VALID) runs on every UPDATE of the row, so a legacy
-- non-Cloudinary avatar would block unrelated updates (fcm_tokens, streaks, soft delete...).
-- The cloud name is not pinned here because it is an app env value; restrict the unsigned
-- upload preset in the Cloudinary console (formats jpg/png/webp, max ~5 MB, fixed folder,
-- incoming transformation) - see bugreport.md.

create or replace function public.validate_cloudinary_image_url()
returns trigger
language plpgsql
as $$
declare
  v_col text := tg_argv[0];
  v_new text := to_jsonb(new) ->> v_col;
  v_old text;
begin
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old) ->> v_col;
    if v_new is not distinct from v_old then
      return new;
    end if;
  end if;
  if v_new is null or v_new = '' or v_new like 'https://res.cloudinary.com/%' then
    return new;
  end if;
  raise exception 'INVALID_IMAGE_URL';
end;
$$;

revoke all on function public.validate_cloudinary_image_url() from public, anon, authenticated;

alter table public.profiles drop constraint if exists profiles_avatar_url_cloudinary;
alter table public.communities drop constraint if exists communities_image_url_cloudinary;
alter table public.community_posts drop constraint if exists community_posts_image_url_cloudinary;

drop trigger if exists trg_validate_profile_avatar_url on public.profiles;
create trigger trg_validate_profile_avatar_url
  before insert or update on public.profiles
  for each row execute function public.validate_cloudinary_image_url('avatar_url');

drop trigger if exists trg_validate_community_image_url on public.communities;
create trigger trg_validate_community_image_url
  before insert or update on public.communities
  for each row execute function public.validate_cloudinary_image_url('image_url');

drop trigger if exists trg_validate_post_image_url on public.community_posts;
create trigger trg_validate_post_image_url
  before insert or update on public.community_posts
  for each row execute function public.validate_cloudinary_image_url('image_url');
