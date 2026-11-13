create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema auth;
grant usage on schema public, auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub', '')::uuid $$;
create publication supabase_realtime;
create table public.profiles (id uuid primary key default gen_random_uuid(), username text, avatar_url text,
  deleted_at timestamptz, created_at timestamptz default now(), sport_interests text[], bio text, updated_at timestamptz default now());
create view public.public_profiles as select id, username, avatar_url, deleted_at from public.profiles;
create table public.communities (id uuid primary key default gen_random_uuid(), name text, description text,
  organization text, location text, image_url text, visibility text default 'public', sport text default 'table_tennis',
  created_by uuid, created_at timestamptz default now(), updated_at timestamptz default now(), pings_enabled boolean default true);
create table public.community_members (community_id uuid, profile_id uuid, role text default 'member',
  approval_status text default 'approved');
create table public.community_matches (id uuid primary key default gen_random_uuid(), community_id uuid,
  recorded_by uuid, player_id uuid, opponent_id uuid, sport text default 'table_tennis', custom_sport_name text,
  team_a_name text, team_b_name text, player_score int default 0, opponent_score int default 0,
  approval_status text default 'pending', created_at timestamptz default now());
create table public.community_posts (id uuid primary key default gen_random_uuid(), community_id uuid,
  author_id uuid, content text, image_url text, post_type text default 'text', created_at timestamptz default now());
create table public.community_post_comments (id uuid primary key default gen_random_uuid(),
  post_id uuid references public.community_posts(id) on delete cascade, profile_id uuid, content text not null,
  created_at timestamptz default now());
create table public.community_match_comments (id uuid primary key default gen_random_uuid(),
  community_match_id uuid references public.community_matches(id) on delete cascade, profile_id uuid,
  content text not null, created_at timestamptz default now());
create table public.sessions (id uuid primary key default gen_random_uuid(), created_by uuid, purpose text,
  title text, location text, date_time timestamptz default now(), description text, status text default 'open');
create table public.commitments (id uuid primary key default gen_random_uuid(), session_id uuid, user_id uuid,
  status text default 'pending', updated_at timestamptz default now());
create table public.session_messages (id uuid primary key default gen_random_uuid(), session_id uuid, sender_id uuid,
  content text, sender_username text, sender_avatar_url text, edited_at timestamptz, created_at timestamptz default now());
create table public.community_messages (id uuid primary key default gen_random_uuid(), community_id uuid, sender_id uuid,
  content text, sender_username text, sender_avatar_url text, edited_at timestamptz, created_at timestamptz default now());
-- delete triggers from 039/043 (130 redefines these functions)
create function public.enforce_session_message_delete() returns trigger language plpgsql as $$ begin
  if old.sender_id <> auth.uid() then raise exception 'You can only delete your own messages'; end if; return old; end $$;
create trigger trg_session_message_delete before delete on public.session_messages
  for each row execute function public.enforce_session_message_delete();
create function public.enforce_community_message_delete() returns trigger language plpgsql as $$ begin
  if old.sender_id <> auth.uid() then raise exception 'You can only delete your own messages'; end if; return old; end $$;
create trigger trg_community_message_delete before delete on public.community_messages
  for each row execute function public.enforce_community_message_delete();
create table public.in_app_notifications (id uuid primary key default gen_random_uuid(), user_id uuid not null,
  type text not null, title text, body text, data jsonb, read boolean default false, created_at timestamptz default now());
create function public._notification_already_exists(p_user_id uuid, p_type text, p_data jsonb, p_window_seconds int default 10)
returns boolean language plpgsql as $$ begin
  return exists (select 1 from public.in_app_notifications where user_id = p_user_id and type = p_type and data = p_data
    and created_at > now() - make_interval(secs => p_window_seconds)); end $$;
create table public.audit_logs (id uuid primary key default gen_random_uuid(), actor_id uuid, action text not null,
  table_name text not null, record_id uuid not null, old_data jsonb, new_data jsonb, metadata jsonb,
  created_at timestamptz not null default now());
create function public.log_audit_event(p_action text, p_table_name text, p_record_id uuid, p_old_data jsonb default null,
  p_new_data jsonb default null, p_metadata jsonb default null) returns void language sql as $$
  insert into public.audit_logs (actor_id, action, table_name, record_id, old_data, new_data, metadata)
  values (auth.uid(), p_action, p_table_name, p_record_id, p_old_data, p_new_data, p_metadata) $$;
create table public.site_config (key text primary key, value jsonb not null default '{}', updated_at timestamptz default now());
insert into public.site_config (key, value) values
  ('maintenance', '{"enabled": false, "message": "We are currently down for maintenance. Please check back soon."}'),
  ('min_app_version', '{"min_version": "1.0.0", "store_url": "", "message": "A newer version of this app is required."}');
insert into public.profiles (username) select 'user' || g from generate_series(1,6) g;
