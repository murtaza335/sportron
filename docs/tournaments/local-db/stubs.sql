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
  deleted_at timestamptz, created_at timestamptz default now());
create view public.public_profiles as select id, username, avatar_url, deleted_at from public.profiles;
create table public.communities (id uuid primary key default gen_random_uuid());
create table public.in_app_notifications (id uuid primary key default gen_random_uuid(), user_id uuid not null,
  type text not null, title text, body text, data jsonb, read boolean default false, created_at timestamptz default now());
create function public._notification_already_exists(p_user_id uuid, p_type text, p_data jsonb, p_window_seconds int default 10)
returns boolean language plpgsql as $$ begin
  return exists (select 1 from public.in_app_notifications where user_id = p_user_id and type = p_type and data = p_data
    and created_at > now() - make_interval(secs => p_window_seconds)); end $$;
create table public.audit_logs (id uuid primary key default gen_random_uuid(), action text);
create function public.log_audit_event(p_action text, p_table_name text, p_record_id uuid, p_old_data jsonb default null,
  p_new_data jsonb default null, p_metadata jsonb default null) returns void language sql as $$ select 1 $$;
insert into public.profiles (username) select 'user' || g from generate_series(1,6) g;
