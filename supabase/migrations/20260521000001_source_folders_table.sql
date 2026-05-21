-- Persist empty source folders so Library organization syncs across devices.

create table if not exists public.source_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists idx_source_folders_user_id on public.source_folders(user_id);

alter table public.source_folders enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'source_folders'
      and policyname = 'source_folders_all'
  ) then
    create policy "source_folders_all" on public.source_folders
      for all using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;

insert into public.source_folders (user_id, name)
select distinct user_id, coalesce(nullif(btrim(folder), ''), 'General')
from public.sources
on conflict (user_id, name) do nothing;
