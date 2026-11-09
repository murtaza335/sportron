-- SEC-L1: avatar_url / image_url columns accepted any string via the API (tracking pixels,
-- hostile hosts). Uploads always return a Cloudinary secure_url, so new writes must be
-- https://res.cloudinary.com/... (NOT VALID: existing rows are left alone, only new
-- writes are checked; NULL/empty stay allowed). The cloud name is not pinned here because it
-- is an app env value; restrict the unsigned upload preset in the Cloudinary console
-- (formats jpg/png/webp, max ~5 MB, fixed folder, incoming transformation) - see bugreport.md.

alter table public.profiles drop constraint if exists profiles_avatar_url_cloudinary;
alter table public.profiles
  add constraint profiles_avatar_url_cloudinary
  check (avatar_url is null or avatar_url = '' or avatar_url like 'https://res.cloudinary.com/%') not valid;

alter table public.communities drop constraint if exists communities_image_url_cloudinary;
alter table public.communities
  add constraint communities_image_url_cloudinary
  check (image_url is null or image_url = '' or image_url like 'https://res.cloudinary.com/%') not valid;

alter table public.community_posts drop constraint if exists community_posts_image_url_cloudinary;
alter table public.community_posts
  add constraint community_posts_image_url_cloudinary
  check (image_url is null or image_url = '' or image_url like 'https://res.cloudinary.com/%') not valid;
