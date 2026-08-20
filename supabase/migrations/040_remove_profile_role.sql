-- Migration: Remove the student/teacher role from profiles
-- The client no longer collects `role` (student/teacher) on profile create/edit.
-- Make the column nullable so inserts that omit it succeed; existing values are
-- kept for reference but are no longer read by the app.
alter table public.profiles
  alter column role drop not null;

comment on column public.profiles.role
  is 'Deprecated — the student/teacher role is no longer collected by the app and may be null.';