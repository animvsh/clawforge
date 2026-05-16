create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists display_name text;

create table if not exists public.clawforge_blueprints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  blueprint_id text not null,
  agent_name text not null,
  prompt text not null,
  blueprint jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.clawforge_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  agent_name text not null,
  agent_id text not null,
  blueprint_id text not null,
  provider text not null,
  model text not null,
  status text not null default 'created',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clawforge_runs
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists agent_name text,
  add column if not exists agent_id text,
  add column if not exists blueprint_id text,
  add column if not exists provider text,
  add column if not exists model text,
  add column if not exists status text not null default 'created',
  add column if not exists started_at timestamptz not null default now(),
  add column if not exists finished_at timestamptz,
  add column if not exists metadata jsonb,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.clawforge_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  agent_id text not null,
  type text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.clawforge_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  agent_id text not null,
  title text not null,
  severity text not null,
  detected_behavior text not null,
  likely_threat text not null,
  mitre_mapping text not null,
  evidence jsonb not null default '[]'::jsonb,
  recommended_action text not null,
  actions_attempted jsonb not null default '[]'::jsonb,
  actions_blocked jsonb not null default '[]'::jsonb,
  approval_decisions jsonb not null default '[]'::jsonb,
  memory_updates jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists clawforge_runs_agent_id_idx on public.clawforge_runs (agent_id);
create index if not exists clawforge_runs_user_id_idx on public.clawforge_runs (user_id);
create index if not exists clawforge_memory_agent_id_idx on public.clawforge_memory (agent_id);
create index if not exists clawforge_memory_user_id_idx on public.clawforge_memory (user_id);
create index if not exists clawforge_reports_agent_id_idx on public.clawforge_reports (agent_id);
create index if not exists clawforge_reports_user_id_idx on public.clawforge_reports (user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists clawforge_runs_set_updated_at on public.clawforge_runs;
create trigger clawforge_runs_set_updated_at
  before update on public.clawforge_runs
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.clawforge_blueprints enable row level security;
alter table public.clawforge_runs enable row level security;
alter table public.clawforge_memory enable row level security;
alter table public.clawforge_reports enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "blueprints_select_own" on public.clawforge_blueprints;
create policy "blueprints_select_own"
  on public.clawforge_blueprints for select
  using (user_id is null or auth.uid() = user_id);

drop policy if exists "blueprints_insert_own" on public.clawforge_blueprints;
create policy "blueprints_insert_own"
  on public.clawforge_blueprints for insert
  with check (user_id is null or auth.uid() = user_id);

drop policy if exists "runs_select_own" on public.clawforge_runs;
create policy "runs_select_own"
  on public.clawforge_runs for select
  using (user_id is null or auth.uid() = user_id);

drop policy if exists "runs_insert_own" on public.clawforge_runs;
create policy "runs_insert_own"
  on public.clawforge_runs for insert
  with check (user_id is null or auth.uid() = user_id);

drop policy if exists "runs_update_own" on public.clawforge_runs;
create policy "runs_update_own"
  on public.clawforge_runs for update
  using (user_id is null or auth.uid() = user_id)
  with check (user_id is null or auth.uid() = user_id);

drop policy if exists "memory_select_own" on public.clawforge_memory;
create policy "memory_select_own"
  on public.clawforge_memory for select
  using (user_id is null or auth.uid() = user_id);

drop policy if exists "memory_insert_own" on public.clawforge_memory;
create policy "memory_insert_own"
  on public.clawforge_memory for insert
  with check (user_id is null or auth.uid() = user_id);

drop policy if exists "reports_select_own" on public.clawforge_reports;
create policy "reports_select_own"
  on public.clawforge_reports for select
  using (user_id is null or auth.uid() = user_id);

drop policy if exists "reports_insert_own" on public.clawforge_reports;
create policy "reports_insert_own"
  on public.clawforge_reports for insert
  with check (user_id is null or auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'display_name')
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(excluded.display_name, public.profiles.display_name),
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
