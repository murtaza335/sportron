-- ============================================================
-- AUDIT LOGGING SYSTEM
-- Captures every write action on critical tables.
-- Triggers fire automatically — cannot be bypassed by client code.
-- ============================================================

-- 1. Audit logs table
create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references auth.users(id) on delete set null,
  action      text not null,          -- 'INSERT', 'UPDATE', 'DELETE', or custom like 'APPROVE', 'DISPUTE'
  table_name  text not null,          -- 'communities', 'community_members', etc.
  record_id   uuid not null,          -- id of the affected row
  old_data    jsonb,                  -- row state before change (NULL for INSERT)
  new_data    jsonb,                  -- row state after change (NULL for DELETE)
  metadata    jsonb,                  -- extra context: { reason, target_user_id, ... }
  created_at  timestamptz not null default now()
);

-- Indexes for common queries
create index if not exists idx_audit_logs_table_name on public.audit_logs (table_name);
create index if not exists idx_audit_logs_record_id on public.audit_logs (record_id);
create index if not exists idx_audit_logs_actor_id on public.audit_logs (actor_id);
create index if not exists idx_audit_logs_created_at on public.audit_logs (created_at desc);
create index if not exists idx_audit_logs_community on public.audit_logs (table_name, record_id, created_at desc);

-- RLS: authenticated users can read all audit logs (transparency)
alter table public.audit_logs enable row level security;

create policy "Audit logs are readable by authenticated users"
  on public.audit_logs for select
  to authenticated
  using (true);

-- No direct INSERT/UPDATE/DELETE via RLS — only the SECURITY DEFINER function can insert
create policy "Only system can insert audit logs"
  on public.audit_logs for insert
  to authenticated
  with check (false);

-- 2. SECURITY DEFINER function to insert audit logs (bypasses RLS)
create or replace function public.log_audit_event(
  p_action     text,
  p_table_name text,
  p_record_id  uuid,
  p_old_data   jsonb default null,
  p_new_data   jsonb default null,
  p_metadata   jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (actor_id, action, table_name, record_id, old_data, new_data, metadata)
  values (auth.uid(), p_action, p_table_name, p_record_id, p_old_data, p_new_data, p_metadata);
end;
$$;

-- 3. Trigger functions for each critical table

-- --- communities ---
create or replace function public.audit_communities()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_audit_event('INSERT', 'communities', NEW.id, null, to_jsonb(NEW));
    return NEW;
  elsif tg_op = 'UPDATE' then
    perform public.log_audit_event('UPDATE', 'communities', NEW.id, to_jsonb(OLD), to_jsonb(NEW));
    return NEW;
  elsif tg_op = 'DELETE' then
    perform public.log_audit_event('DELETE', 'communities', OLD.id, to_jsonb(OLD), null);
    return OLD;
  end if;
end;
$$;

drop trigger if exists trg_audit_communities on public.communities;
create trigger trg_audit_communities
  after insert or update or delete on public.communities
  for each row execute function public.audit_communities();

-- --- community_members ---
create or replace function public.audit_community_members()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_audit_event('INSERT', 'community_members', NEW.community_id, null, to_jsonb(NEW));
    return NEW;
  elsif tg_op = 'UPDATE' then
    perform public.log_audit_event('UPDATE', 'community_members', NEW.community_id, to_jsonb(OLD), to_jsonb(NEW));
    return NEW;
  elsif tg_op = 'DELETE' then
    perform public.log_audit_event('DELETE', 'community_members', OLD.community_id, to_jsonb(OLD), null);
    return OLD;
  end if;
end;
$$;

drop trigger if exists trg_audit_community_members on public.community_members;
create trigger trg_audit_community_members
  after insert or update or delete on public.community_members
  for each row execute function public.audit_community_members();

-- --- community_matches ---
create or replace function public.audit_community_matches()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_audit_event('INSERT', 'community_matches', NEW.id, null, to_jsonb(NEW));
    return NEW;
  elsif tg_op = 'UPDATE' then
    perform public.log_audit_event('UPDATE', 'community_matches', NEW.id, to_jsonb(OLD), to_jsonb(NEW));
    return NEW;
  elsif tg_op = 'DELETE' then
    perform public.log_audit_event('DELETE', 'community_matches', OLD.id, to_jsonb(OLD), null);
    return OLD;
  end if;
end;
$$;

drop trigger if exists trg_audit_community_matches on public.community_matches;
create trigger trg_audit_community_matches
  after insert or update or delete on public.community_matches
  for each row execute function public.audit_community_matches();

-- --- community_join_requests ---
create or replace function public.audit_community_join_requests()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_audit_event('INSERT', 'community_join_requests', NEW.id, null, to_jsonb(NEW));
    return NEW;
  elsif tg_op = 'UPDATE' then
    perform public.log_audit_event('UPDATE', 'community_join_requests', NEW.id, to_jsonb(OLD), to_jsonb(NEW));
    return NEW;
  elsif tg_op = 'DELETE' then
    perform public.log_audit_event('DELETE', 'community_join_requests', OLD.id, to_jsonb(OLD), null);
    return OLD;
  end if;
end;
$$;

drop trigger if exists trg_audit_community_join_requests on public.community_join_requests;
create trigger trg_audit_community_join_requests
  after insert or update or delete on public.community_join_requests
  for each row execute function public.audit_community_join_requests();

-- --- community_invites ---
create or replace function public.audit_community_invites()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_audit_event('INSERT', 'community_invites', NEW.id, null, to_jsonb(NEW));
    return NEW;
  elsif tg_op = 'UPDATE' then
    perform public.log_audit_event('UPDATE', 'community_invites', NEW.id, to_jsonb(OLD), to_jsonb(NEW));
    return NEW;
  elsif tg_op = 'DELETE' then
    perform public.log_audit_event('DELETE', 'community_invites', OLD.id, to_jsonb(OLD), null);
    return OLD;
  end if;
end;
$$;

drop trigger if exists trg_audit_community_invites on public.community_invites;
create trigger trg_audit_community_invites
  after insert or update or delete on public.community_invites
  for each row execute function public.audit_community_invites();

-- --- sessions ---
create or replace function public.audit_sessions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_audit_event('INSERT', 'sessions', NEW.id, null, to_jsonb(NEW));
    return NEW;
  elsif tg_op = 'UPDATE' then
    perform public.log_audit_event('UPDATE', 'sessions', NEW.id, to_jsonb(OLD), to_jsonb(NEW));
    return NEW;
  elsif tg_op = 'DELETE' then
    perform public.log_audit_event('DELETE', 'sessions', OLD.id, to_jsonb(OLD), null);
    return OLD;
  end if;
end;
$$;

drop trigger if exists trg_audit_sessions on public.sessions;
create trigger trg_audit_sessions
  after insert or update or delete on public.sessions
  for each row execute function public.audit_sessions();

-- --- commitments ---
create or replace function public.audit_commitments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_audit_event('INSERT', 'commitments', NEW.id, null, to_jsonb(NEW));
    return NEW;
  elsif tg_op = 'UPDATE' then
    perform public.log_audit_event('UPDATE', 'commitments', NEW.id, to_jsonb(OLD), to_jsonb(NEW));
    return NEW;
  elsif tg_op = 'DELETE' then
    perform public.log_audit_event('DELETE', 'commitments', OLD.id, to_jsonb(OLD), null);
    return OLD;
  end if;
end;
$$;

drop trigger if exists trg_audit_commitments on public.commitments;
create trigger trg_audit_commitments
  after insert or update or delete on public.commitments
  for each row execute function public.audit_commitments();

-- --- pings ---
create or replace function public.audit_pings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_audit_event('INSERT', 'pings', NEW.id, null, to_jsonb(NEW));
    return NEW;
  elsif tg_op = 'DELETE' then
    perform public.log_audit_event('DELETE', 'pings', OLD.id, to_jsonb(OLD), null);
    return OLD;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_audit_pings on public.pings;
create trigger trg_audit_pings
  after insert or delete on public.pings
  for each row execute function public.audit_pings();

-- --- profiles (only sensitive changes) ---
create or replace function public.audit_profiles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    -- Only log meaningful profile changes, not every FCM token update
    if OLD.username is distinct from NEW.username
       or OLD.bio is distinct from NEW.bio
       or OLD.avatar_url is distinct from NEW.avatar_url
       or OLD.deleted_at is distinct from NEW.deleted_at
       or OLD.notification_preferences is distinct from NEW.notification_preferences then
      perform public.log_audit_event('UPDATE', 'profiles', NEW.id, to_jsonb(OLD), to_jsonb(NEW));
    end if;
    return NEW;
  elsif tg_op = 'DELETE' then
    perform public.log_audit_event('DELETE', 'profiles', OLD.id, to_jsonb(OLD), null);
    return OLD;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_audit_profiles on public.profiles;
create trigger trg_audit_profiles
  after update or delete on public.profiles
  for each row execute function public.audit_profiles();

-- --- session_messages / community_messages (edits + deletes only, not every send) ---
create or replace function public.audit_session_messages()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and OLD.content is distinct from NEW.content then
    perform public.log_audit_event('UPDATE', 'session_messages', NEW.id, to_jsonb(OLD), to_jsonb(NEW));
    return NEW;
  elsif tg_op = 'DELETE' then
    perform public.log_audit_event('DELETE', 'session_messages', OLD.id, to_jsonb(OLD), null);
    return OLD;
  end if;
  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists trg_audit_session_messages on public.session_messages;
create trigger trg_audit_session_messages
  after update or delete on public.session_messages
  for each row execute function public.audit_session_messages();

create or replace function public.audit_community_messages()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and OLD.content is distinct from NEW.content then
    perform public.log_audit_event('UPDATE', 'community_messages', NEW.id, to_jsonb(OLD), to_jsonb(NEW));
    return NEW;
  elsif tg_op = 'DELETE' then
    perform public.log_audit_event('DELETE', 'community_messages', OLD.id, to_jsonb(OLD), null);
    return OLD;
  end if;
  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists trg_audit_community_messages on public.community_messages;
create trigger trg_audit_community_messages
  after update or delete on public.community_messages
  for each row execute function public.audit_community_messages();
