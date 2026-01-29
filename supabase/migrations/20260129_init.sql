-- Minimal Supabase schema for DebateLab (simple but comprehensive)
-- NOTE: Run via supabase migration or SQL editor.

create extension if not exists "pgcrypto";

-- Settings per user
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  language text not null default 'en',
  theme text not null default 'system',
  feature_configs jsonb not null default '{}'::jsonb,
  custom_system_prompt text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Core content tables
create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  input jsonb not null,
  output jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.attacks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  input jsonb not null,
  output jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.brainstorms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  input jsonb not null,
  output jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.factoids (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  input jsonb not null,
  output jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  output jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content text not null,
  type text not null check (type in ('url','file','text')),
  origin text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.source_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid not null references public.sources(id) on delete cascade,
  filename text not null,
  mime_type text,
  storage_key text not null,
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now()
);

-- Optional usage tracking
create table if not exists public.ai_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null,
  provider text not null,
  model text not null,
  input_tokens integer,
  output_tokens integer,
  latency_ms integer,
  status text not null default 'success',
  error_code text,
  cost_usd numeric,
  created_at timestamptz not null default now()
);

-- Optional per-user API keys (BYOK). Encrypt in app layer before insert.
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  key_ciphertext text not null,
  key_last4 text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_cases_user_id on public.cases(user_id);
create index if not exists idx_attacks_user_id on public.attacks(user_id);
create index if not exists idx_brainstorms_user_id on public.brainstorms(user_id);
create index if not exists idx_factoids_user_id on public.factoids(user_id);
create index if not exists idx_chats_user_id on public.chats(user_id);
create index if not exists idx_sources_user_id on public.sources(user_id);
create index if not exists idx_ai_requests_user_id on public.ai_requests(user_id);
create index if not exists idx_messages_chat_id on public.messages(chat_id);

-- Row Level Security
alter table public.user_settings enable row level security;
alter table public.cases enable row level security;
alter table public.attacks enable row level security;
alter table public.brainstorms enable row level security;
alter table public.factoids enable row level security;
alter table public.chats enable row level security;
alter table public.messages enable row level security;
alter table public.sources enable row level security;
alter table public.source_files enable row level security;
alter table public.ai_requests enable row level security;
alter table public.api_keys enable row level security;

-- Policies: user owns their data
create policy "user_settings_select" on public.user_settings
  for select using (user_id = auth.uid());
create policy "user_settings_insert" on public.user_settings
  for insert with check (user_id = auth.uid());
create policy "user_settings_update" on public.user_settings
  for update using (user_id = auth.uid());
create policy "user_settings_delete" on public.user_settings
  for delete using (user_id = auth.uid());

create policy "cases_all" on public.cases
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "attacks_all" on public.attacks
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "brainstorms_all" on public.brainstorms
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "factoids_all" on public.factoids
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "chats_all" on public.chats
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "messages_select" on public.messages
  for select using (
    exists (select 1 from public.chats where chats.id = messages.chat_id and chats.user_id = auth.uid())
  );
create policy "messages_insert" on public.messages
  for insert with check (
    exists (select 1 from public.chats where chats.id = messages.chat_id and chats.user_id = auth.uid())
  );
create policy "messages_update" on public.messages
  for update using (
    exists (select 1 from public.chats where chats.id = messages.chat_id and chats.user_id = auth.uid())
  );
create policy "messages_delete" on public.messages
  for delete using (
    exists (select 1 from public.chats where chats.id = messages.chat_id and chats.user_id = auth.uid())
  );

create policy "sources_all" on public.sources
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "source_files_all" on public.source_files
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "ai_requests_all" on public.ai_requests
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "api_keys_all" on public.api_keys
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Create a default settings row for new users
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
