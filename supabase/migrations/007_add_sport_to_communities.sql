alter table public.communities
  add column if not exists sport text not null default 'table_tennis';

create index if not exists idx_communities_sport on public.communities(sport);
