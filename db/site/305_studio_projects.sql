-- Phase 5a: 3D Studio projects (multi-unit assemblies saved to an account)
create table if not exists public.ds_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null default 'Untitled project',
  data jsonb not null,
  units int not null default 1,
  total_kes numeric,
  status text not null default 'draft' check (status in ('draft','quoted','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ds_projects_user_idx on public.ds_projects(user_id, updated_at desc);
alter table public.ds_projects enable row level security;
create policy ds_projects_own_read on public.ds_projects for select using (user_id = auth.uid() or public.ds_is_staff());
create policy ds_projects_own_insert on public.ds_projects for insert with check (user_id = auth.uid());
create policy ds_projects_own_update on public.ds_projects for update using (user_id = auth.uid() or public.ds_is_staff()) with check (user_id = auth.uid() or public.ds_is_staff());
grant select, insert, update on public.ds_projects to authenticated;
create or replace function public.ds_projects_touch() returns trigger language plpgsql set search_path to 'public' as $$ begin new.updated_at := now(); return new; end $$;
create trigger ds_projects_touch before update on public.ds_projects for each row execute function public.ds_projects_touch();

-- assembly prices (placeholders until Firmcop confirms)
insert into public.ds_catalog_items(kind, key, name, unit, price_kes, stock_qty, specs, systems, active, sort) values
 ('extension','party','Wall opened between joined units, with welded frame','m',24000,null,'{"eng":true}','{container}',true,5),
 ('extension','stack','Stacking an upper unit: twist locks, crane lift, weather seal','lot',85000,null,'{"eng":true}','{container}',true,6),
 ('extension','stair','External steel stair with landing to an upper unit','lot',165000,null,'{}','{container,cabin,aframe}',true,7)
on conflict (kind, key) do update set name = excluded.name, unit = excluded.unit, price_kes = excluded.price_kes, specs = excluded.specs, systems = excluded.systems, active = true, sort = excluded.sort;
