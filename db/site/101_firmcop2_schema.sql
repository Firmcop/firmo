-- Firmcop Design Studio: designs as data. Additive only (new ds_ objects).
-- Roles: admin = approve/publish/edit catalogue; moderator = designer/sales (save drafts, submit for review).

-- Firmcop2 (standalone): Design Studio, designs as data.
create table public.ds_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','designer')),
  full_name text,
  created_at timestamptz not null default now()
);
alter table public.ds_staff enable row level security;
create or replace function public.ds_touch() returns trigger language plpgsql set search_path = public as $$ begin new.updated_at = now(); return new; end $$;
create or replace function public.ds_is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ds_staff where user_id = auth.uid())
$$;
create or replace function public.ds_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ds_staff where user_id = auth.uid() and role = 'admin')
$$;
create policy "ds_staff self read" on public.ds_staff for select to authenticated using (user_id = auth.uid() or public.ds_is_admin());
create policy "ds_staff admin write" on public.ds_staff for all to authenticated using (public.ds_is_admin()) with check (public.ds_is_admin());

-- shells: the sizes each system comes in
create table public.ds_shells (
  key text primary key,
  system text not null check (system in ('container','aframe','cabin','steel')),
  name text not null,
  subtitle text,
  geometry jsonb not null,               -- {L,W,H|ridge,t,ih,yF,veranda?,twin?}
  shell_price_kes numeric not null check (shell_price_kes >= 0),
  delivery_kes numeric not null default 0,
  lead_weeks int not null default 8,
  active boolean not null default true,
  sort int not null default 0,
  updated_at timestamptz not null default now()
);

-- catalogue: everything the Studio can place or apply
create table public.ds_catalog_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('opening','floor','wall','ceil','kitchen_unit','wardrobe_unit','front','worktop','item','service','partition')),
  key text not null,
  name text not null,
  unit text not null default 'ea',
  price_kes numeric not null default 0 check (price_kes >= 0),   -- used when no price item is linked
  price_source text,                                            -- where the rate came from, e.g. a past quote's price item
  stock_qty numeric,                                             -- null = made to order
  specs jsonb not null default '{}'::jsonb,                      -- geometry and 3D: w,h,sill,col,pat,wet,tall,door,glass,mult,perM...
  systems text[] not null default '{container,aframe,cabin}',
  active boolean not null default true,
  sort int not null default 0,
  updated_at timestamptz not null default now(),
  unique (kind, key)
);
create index ds_catalog_items_kind on public.ds_catalog_items(kind) where active;

-- designs and their versions
create table public.ds_designs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,80}$'),
  name text not null,
  system text not null,
  shell_key text references public.ds_shells(key),
  summary text,
  tags text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft','published','archived')),
  published_version_id uuid,
  website_slug text,                                                       -- website catalogue page, when linked
  hero_url text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.ds_design_versions (
  id uuid primary key default gen_random_uuid(),
  design_id uuid not null references public.ds_designs(id) on delete cascade,
  version int not null,
  status text not null default 'draft' check (status in ('draft','in_review','approved','rejected')),
  layout jsonb not null,                 -- the Studio document: preset, parts, opens, runs, items, roomCfg, ceil, colour...
  rules jsonb not null default '{}'::jsonb,   -- configurator rules: shells, lock, options, finishes, defaults
  checks jsonb not null default '[]'::jsonb,  -- [{lvl,text}] from the Studio at save time
  total_kes numeric,
  notes text,
  review_note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  unique (design_id, version)
);
alter table public.ds_designs add constraint ds_designs_published_version_fk foreign key (published_version_id) references public.ds_design_versions(id) on delete set null;
create index ds_design_versions_design on public.ds_design_versions(design_id, version desc);

create table public.ds_design_media (
  id uuid primary key default gen_random_uuid(),
  design_id uuid not null references public.ds_designs(id) on delete cascade,
  version_id uuid references public.ds_design_versions(id) on delete set null,
  kind text not null check (kind in ('still','pano','plan','bim','video')),
  url text,
  caption text,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

-- outbox: one event per change; the website, SEO push and team portal consume these
create table public.ds_events (
  id bigint generated always as identity primary key,
  type text not null,
  entity text not null,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  actor uuid default auth.uid(),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index ds_events_unprocessed on public.ds_events(created_at) where processed_at is null;

create trigger ds_shells_updated before update on public.ds_shells for each row execute function public.ds_touch();
create trigger ds_catalog_items_updated before update on public.ds_catalog_items for each row execute function public.ds_touch();
create trigger ds_designs_updated before update on public.ds_designs for each row execute function public.ds_touch();

-- catalogue price changes raise an event
create or replace function public.ds_catalog_price_event() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.price_kes is distinct from old.price_kes or new.stock_qty is distinct from old.stock_qty or new.active is distinct from old.active then
    insert into public.ds_events(type, entity, entity_id, payload)
    values ('catalog.changed', 'ds_catalog_items', new.id::text, jsonb_build_object('kind', new.kind, 'key', new.key, 'price_kes', new.price_kes, 'stock_qty', new.stock_qty, 'active', new.active));
  end if;
  return new;
end $$;
create trigger ds_catalog_items_event after update on public.ds_catalog_items for each row execute function public.ds_catalog_price_event();

-- RLS
alter table public.ds_shells enable row level security;
alter table public.ds_catalog_items enable row level security;
alter table public.ds_designs enable row level security;
alter table public.ds_design_versions enable row level security;
alter table public.ds_design_media enable row level security;
alter table public.ds_events enable row level security;

create policy "ds_shells public read" on public.ds_shells for select using (active or public.ds_is_staff());
create policy "ds_shells admin write" on public.ds_shells for all to authenticated using (public.ds_is_admin()) with check (public.ds_is_admin());
create policy "ds_catalog public read" on public.ds_catalog_items for select using (active or public.ds_is_staff());
create policy "ds_catalog admin write" on public.ds_catalog_items for all to authenticated using (public.ds_is_admin()) with check (public.ds_is_admin());
create policy "ds_designs public read" on public.ds_designs for select using (status = 'published' or public.ds_is_staff());
create policy "ds_designs admin write" on public.ds_designs for all to authenticated using (public.ds_is_admin()) with check (public.ds_is_admin());
create policy "ds_versions public read" on public.ds_design_versions for select using (
  public.ds_is_staff() or exists (select 1 from public.ds_designs d where d.published_version_id = ds_design_versions.id and d.status = 'published'));
create policy "ds_versions admin write" on public.ds_design_versions for all to authenticated using (public.ds_is_admin()) with check (public.ds_is_admin());
create policy "ds_media public read" on public.ds_design_media for select using (
  public.ds_is_staff() or exists (select 1 from public.ds_designs d where d.id = ds_design_media.design_id and d.status = 'published'));
create policy "ds_media staff insert" on public.ds_design_media for insert to authenticated with check (public.ds_is_staff());
create policy "ds_media admin write" on public.ds_design_media for all to authenticated using (public.ds_is_admin()) with check (public.ds_is_admin());
create policy "ds_events admin read" on public.ds_events for select to authenticated using (public.ds_is_admin());

-- the package the Studio loads: shells, catalogue (with linked prices resolved) and published designs
create or replace function public.ds_package() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'version', 1, 'generated_at', now(), 'currency', 'KES',
    'shells', coalesce((select jsonb_object_agg(s.key, s.geometry || jsonb_build_object('sys', s.system, 'name', s.name, 'sub', s.subtitle, 'shell', s.shell_price_kes, 'deliver', s.delivery_kes, 'weeks', s.lead_weeks)) from ds_shells s where s.active), '{}'::jsonb),
    'catalog', coalesce((select jsonb_object_agg(k.kind, k.items) from (
        select c.kind, jsonb_object_agg(c.key, c.specs || jsonb_build_object('name', c.name, 'unit', c.unit,
          'price', c.price_kes, 'stock', coalesce(c.stock_qty, 999), 'systems', c.systems,
          'linked', c.price_source is not null, 'sort', c.sort)) items
        from ds_catalog_items c
        where c.active group by c.kind) k), '{}'::jsonb),
    'designs', coalesce((select jsonb_agg(jsonb_build_object('slug', d.slug, 'name', d.name, 'system', d.system, 'shell', d.shell_key, 'summary', d.summary, 'tags', d.tags,
        'version', v.version, 'layout', v.layout, 'rules', v.rules, 'total_kes', v.total_kes) order by d.name)
      from ds_designs d join ds_design_versions v on v.id = d.published_version_id where d.status = 'published'), '[]'::jsonb)
  )
$$;

-- staff: save a new version (creates the design on first save)
create or replace function public.ds_save_version(_slug text, _name text, _system text, _shell text, _layout jsonb, _rules jsonb, _checks jsonb, _total numeric, _notes text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d ds_designs; n int; vid uuid;
begin
  if not public.ds_is_staff() then raise exception 'Only Firmcop staff can save designs' using errcode = '42501'; end if;
  select * into d from ds_designs where slug = _slug;
  if not found then
    insert into ds_designs(slug, name, system, shell_key) values (_slug, _name, _system, _shell) returning * into d;
    insert into ds_events(type, entity, entity_id, payload) values ('design.created', 'ds_designs', d.id::text, jsonb_build_object('slug', _slug));
  else
    update ds_designs set name = coalesce(_name, name), shell_key = coalesce(_shell, shell_key) where id = d.id;
  end if;
  select coalesce(max(version), 0) + 1 into n from ds_design_versions where design_id = d.id;
  insert into ds_design_versions(design_id, version, layout, rules, checks, total_kes, notes)
  values (d.id, n, _layout, coalesce(_rules, '{}'::jsonb), coalesce(_checks, '[]'::jsonb), _total, _notes) returning id into vid;
  insert into ds_events(type, entity, entity_id, payload) values ('version.saved', 'ds_design_versions', vid::text, jsonb_build_object('slug', _slug, 'version', n));
  return jsonb_build_object('design_id', d.id, 'version_id', vid, 'version', n);
end $$;

create or replace function public.ds_submit_version(_version_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.ds_is_staff() then raise exception 'Only Firmcop staff can submit designs' using errcode = '42501'; end if;
  if exists (select 1 from ds_design_versions where id = _version_id and jsonb_path_exists(checks, '$[*] ? (@.lvl == "error")')) then
    raise exception 'Fix the checks marked Fix before submitting';
  end if;
  update ds_design_versions set status = 'in_review' where id = _version_id and status in ('draft','rejected');
  insert into ds_events(type, entity, entity_id) values ('version.submitted', 'ds_design_versions', _version_id::text);
end $$;

create or replace function public.ds_review_version(_version_id uuid, _approve boolean, _note text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.ds_is_admin() then raise exception 'Only admins can review designs' using errcode = '42501'; end if;
  update ds_design_versions set status = case when _approve then 'approved' else 'rejected' end, review_note = _note, reviewed_by = auth.uid(), reviewed_at = now()
  where id = _version_id and status = 'in_review';
  if not found then raise exception 'That version is not waiting for review'; end if;
  insert into ds_events(type, entity, entity_id, payload) values (case when _approve then 'version.approved' else 'version.rejected' end, 'ds_design_versions', _version_id::text, jsonb_build_object('note', _note));
end $$;

create or replace function public.ds_publish_version(_version_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v ds_design_versions;
begin
  if not public.ds_is_admin() then raise exception 'Only admins can publish designs' using errcode = '42501'; end if;
  select * into v from ds_design_versions where id = _version_id;
  if not found or v.status <> 'approved' then raise exception 'Only an approved version can be published'; end if;
  update ds_designs set published_version_id = v.id, status = 'published' where id = v.design_id;
  insert into ds_events(type, entity, entity_id, payload) values ('design.published', 'ds_designs', v.design_id::text, jsonb_build_object('version', v.version, 'version_id', v.id));
end $$;

create or replace function public.ds_archive_design(_design_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.ds_is_admin() then raise exception 'Only admins can archive designs' using errcode = '42501'; end if;
  update ds_designs set status = 'archived' where id = _design_id;
  insert into ds_events(type, entity, entity_id) values ('design.archived', 'ds_designs', _design_id::text);
end $$;

revoke all on function public.ds_save_version(text,text,text,text,jsonb,jsonb,jsonb,numeric,text), public.ds_submit_version(uuid), public.ds_review_version(uuid,boolean,text), public.ds_publish_version(uuid), public.ds_archive_design(uuid) from public, anon;
grant execute on function public.ds_save_version(text,text,text,text,jsonb,jsonb,jsonb,numeric,text), public.ds_submit_version(uuid), public.ds_review_version(uuid,boolean,text), public.ds_publish_version(uuid), public.ds_archive_design(uuid) to authenticated;
revoke all on function public.ds_catalog_price_event(), public.ds_touch() from public, anon, authenticated;
grant execute on function public.ds_package() to anon, authenticated;
