-- SEC-H2: community_post_likes / community_post_comments were readable by every authenticated
-- user (using (true)) and writable by anyone who knew a post id, which let outsiders spam
-- like/comment notifications+pushes at authors. Access now requires approved membership of
-- the post's community. The posts feed RPCs/trigger paths are unaffected (SECURITY DEFINER).

create or replace function public.is_post_community_member(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.community_posts p
    join public.community_members m on m.community_id = p.community_id
    where p.id = p_post_id
      and m.profile_id = auth.uid()
      and m.approval_status = 'approved'
  );
$$;

revoke all on function public.is_post_community_member(uuid) from public, anon;
grant execute on function public.is_post_community_member(uuid) to authenticated;

-- Likes
drop policy if exists "Likes are viewable by authenticated users" on public.community_post_likes;
drop policy if exists "Likes are viewable by community members" on public.community_post_likes;
create policy "Likes are viewable by community members"
  on public.community_post_likes for select
  to authenticated
  using (public.is_post_community_member(post_id));

drop policy if exists "Users can insert their own likes" on public.community_post_likes;
create policy "Users can insert their own likes"
  on public.community_post_likes for insert
  to authenticated
  with check (auth.uid() = profile_id and public.is_post_community_member(post_id));

-- Comments
drop policy if exists "Comments are viewable by authenticated users" on public.community_post_comments;
drop policy if exists "Comments are viewable by community members" on public.community_post_comments;
create policy "Comments are viewable by community members"
  on public.community_post_comments for select
  to authenticated
  using (public.is_post_community_member(post_id));

drop policy if exists "Users can insert their own comments" on public.community_post_comments;
create policy "Users can insert their own comments"
  on public.community_post_comments for insert
  to authenticated
  with check (auth.uid() = profile_id and public.is_post_community_member(post_id));

drop policy if exists "Users can update their own comments" on public.community_post_comments;
create policy "Users can update their own comments"
  on public.community_post_comments for update
  to authenticated
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id and public.is_post_community_member(post_id));

-- Length limit (NOT VALID: legacy rows are not checked, new writes are).
alter table public.community_post_comments
  drop constraint if exists community_post_comments_content_length;
alter table public.community_post_comments
  add constraint community_post_comments_content_length
  check (char_length(content) between 1 and 1000) not valid;
