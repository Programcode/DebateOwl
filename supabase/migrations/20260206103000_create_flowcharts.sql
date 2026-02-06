-- Create flowcharts table for saving debate flows
create table if not exists public.flowcharts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  nodes jsonb not null default '[]'::jsonb,
  edges jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_flowcharts_user_id on public.flowcharts(user_id);

-- RLS
alter table public.flowcharts enable row level security;

-- Policies
create policy "flowcharts_select" on public.flowcharts
  for select using (user_id = auth.uid());

create policy "flowcharts_insert" on public.flowcharts
  for insert with check (user_id = auth.uid());

create policy "flowcharts_update" on public.flowcharts
  for update using (user_id = auth.uid());

create policy "flowcharts_delete" on public.flowcharts
  for delete using (user_id = auth.uid());
