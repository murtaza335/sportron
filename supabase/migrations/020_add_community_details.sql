-- Migration: Community details (organization, location) + per-user unique name
-- Two users are allowed to create communities with the same name, but a single
-- user cannot create two communities with the same name (case-insensitive).

alter table public.communities
  add column if not exists organization text,
  add column if not exists location text;

comment on column public.communities.organization is 'Optional organization (university, club, etc.) the community belongs to';
comment on column public.communities.location is 'Optional city/location where the community operates';

-- Enforce: one user cannot own two communities with the same name.
create unique index if not exists idx_communities_name_created_by
  on public.communities (lower(name), created_by);

create index if not exists idx_communities_organization
  on public.communities (organization);