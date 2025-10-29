-- Social posting schema (idempotent)
create extension if not exists pgcrypto;
create table if not exists public.social_routes (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('x','facebook_page','linkedin_page','instagram','threads','youtube_community')),
  display text not null,
  account_ref text not null default '',
  auth_type text not null default 'token',
  token_ref text not null default '',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'blog/social',
  payload jsonb not null,
  platforms text[] not null default '{}',
  scheduled_at timestamptz not null,
  timezone text not null default 'UTC',
  status text not null default 'pending', -- pending|queued|running|completed|failed|cancelled
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.post_dispatch_log (
  id bigserial primary key,
  scheduled_post_id uuid references public.scheduled_posts(id) on delete cascade,
  platform text not null,
  status text not null, -- success|failed
  response jsonb,
  created_at timestamptz not null default now()
);

-- Basic RLS: readable by anon, writable only by service role
alter table public.social_routes enable row level security;
alter table public.scheduled_posts enable row level security;
alter table public.post_dispatch_log enable row level security;

-- Anonymous can read (for dashboards); no write
do $$ begin
  begin
    create policy social_routes_read on public.social_routes
      for select to anon using ( true );
  exception when duplicate_object then
    null;
  end;
end $$;

do $$ begin
  begin
    create policy scheduled_posts_read on public.scheduled_posts
      for select to anon using ( true );
  exception when duplicate_object then
    null;
  end;
end $$;

do $$ begin
  begin
    create policy post_dispatch_log_read on public.post_dispatch_log
      for select to anon using ( true );
  exception when duplicate_object then
    null;
  end;
end $$;


