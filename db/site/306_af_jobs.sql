-- Phase 5b: A-frame engineering and production jobs (staff only). The engine itself is f3d/af-engine.js.
create table if not exists public.af_jobs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  project_id uuid references public.ds_projects(id) on delete set null,
  unit_id text,
  customer text,
  site text,
  site_qp numeric not null default 0.6,
  revisions jsonb not null default '[]'::jsonb,
  draft jsonb not null,
  lifecycle jsonb not null default '{"approvals":[],"quotes":[],"snapshots":[],"releases":[]}'::jsonb,
  work_order jsonb,
  stage text not null default 'engineering' check (stage in ('engineering','commercial','released','production','dispatched','archived')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.af_jobs enable row level security;
create policy af_jobs_staff_read on public.af_jobs for select using (ds_is_staff());
create policy af_jobs_staff_insert on public.af_jobs for insert with check (ds_is_staff());
create policy af_jobs_staff_update on public.af_jobs for update using (ds_is_staff()) with check (ds_is_staff());
grant select, insert, update on public.af_jobs to authenticated;
create or replace function public.af_jobs_touch() returns trigger language plpgsql set search_path = public as $$ begin new.updated_at = now(); return new; end $$;
create trigger af_jobs_touch before update on public.af_jobs for each row execute function public.af_jobs_touch();
create index if not exists af_jobs_project on public.af_jobs(project_id);
