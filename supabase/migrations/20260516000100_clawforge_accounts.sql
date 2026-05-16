create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
  agent_id text not null,
  status text not null default 'draft',
  audit_events jsonb not null default '[]'::jsonb,
  memory jsonb not null default '[]'::jsonb,
  report jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.clawforge_blueprints enable row level security;
alter table public.clawforge_runs enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "blueprints_select_own" on public.clawforge_blueprints;
create policy "blueprints_select_own"
  on public.clawforge_blueprints for select
  using (auth.uid() = user_id);

drop policy if exists "blueprints_insert_own" on public.clawforge_blueprints;
create policy "blueprints_insert_own"
  on public.clawforge_blueprints for insert
  with check (auth.uid() = user_id);

drop policy if exists "runs_select_own" on public.clawforge_runs;
create policy "runs_select_own"
  on public.clawforge_runs for select
  using (auth.uid() = user_id);

drop policy if exists "runs_insert_own" on public.clawforge_runs;
create policy "runs_insert_own"
  on public.clawforge_runs for insert
  with check (auth.uid() = user_id);

drop policy if exists "runs_update_own" on public.clawforge_runs;
create policy "runs_update_own"
  on public.clawforge_runs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
