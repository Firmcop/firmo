-- Invest: investment models. Each model is a detailed plan (a Studio design or Collection product) or an
-- actual build from Works, offered to investors off-plan, while building, ready, or completed.
-- Applied to Supabase project firmo as migration invest_models.
alter table public.investment_opportunities
  add column if not exists basis text not null default 'plan' check (basis in ('plan','work')),
  add column if not exists stage text not null default 'offplan' check (stage in ('offplan','building','ready','completed')),
  add column if not exists design_slug text,
  add column if not exists product_slug text,
  add column if not exists work_slug text,
  add column if not exists unit_type text,
  add column if not exists size_m2 numeric,
  add column if not exists bedrooms int,
  add column if not exists bathrooms int,
  add column if not exists county text,
  add column if not exists map_url text,
  add column if not exists completion_date date,
  add column if not exists handover text,
  add column if not exists summary text,
  add column if not exists highlights text[] not null default '{}',
  add column if not exists deposit_pct numeric default 20,
  add column if not exists payment_plan jsonb not null default '[]',
  add column if not exists rent_night numeric,
  add column if not exists rent_month numeric,
  add column if not exists occupancy_pct numeric,
  add column if not exists mgmt_fee_pct numeric,
  add column if not exists media jsonb not null default '[]',
  add column if not exists documents jsonb not null default '[]',
  add column if not exists seo_title text,
  add column if not exists seo_description text,
  add column if not exists is_sample boolean not null default false;
comment on column public.investment_opportunities.media is 'Photos and videos: [{type: photo|video, url, caption, poster}] in display order; the first photo is the cover';
comment on column public.investment_opportunities.payment_plan is 'Milestones: [{label, pct, when}]';
comment on column public.investment_opportunities.documents is 'Downloads: [{label, url}]';

-- the four placeholder projects from the prototype stay as samples until real models replace them
update public.investment_opportunities set is_sample = true where name like '[%]';
update public.investment_opportunities set media = jsonb_build_array(jsonb_build_object('type','photo','url',image_url,'caption',''))
  where image_url is not null and media = '[]'::jsonb;

-- individual units investors can buy
create table if not exists public.investment_units (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.investment_opportunities(id) on delete cascade,
  code text not null,
  floor text,
  size_m2 numeric,
  price numeric,
  status text not null default 'available' check (status in ('available','reserved','sold','held')),
  note text,                      -- shown on the website, e.g. 'corner unit with garden'
  sort int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opportunity_id, code)
);
alter table public.investment_units enable row level security;
create policy investment_units_public on public.investment_units for select using (
  exists (select 1 from public.investment_opportunities o where o.id = opportunity_id and o.published) or public.ds_is_staff());
create policy investment_units_staff on public.investment_units for all using (public.ds_is_staff()) with check (public.ds_is_staff());
grant select on public.investment_units to anon, authenticated;
grant insert, update, delete on public.investment_units to authenticated;

-- keep units / taken on the model in step with the unit list, when a unit list exists
create or replace function public.invest_sync_counts() returns trigger language plpgsql security definer set search_path = public as $$
declare oid uuid := coalesce(new.opportunity_id, old.opportunity_id);
begin
  update investment_opportunities o set
    units = greatest(1, (select count(*) from investment_units u where u.opportunity_id = oid)),
    taken = (select count(*) from investment_units u where u.opportunity_id = oid and u.status in ('reserved','sold','held')),
    updated_at = now()
  where o.id = oid and exists (select 1 from investment_units u where u.opportunity_id = oid);
  return null;
end $$;
drop trigger if exists invest_sync_counts on public.investment_units;
create trigger invest_sync_counts after insert or update or delete on public.investment_units for each row execute function public.invest_sync_counts();

-- the media bucket also takes short video clips (up to the bucket's 50 MB); long films go on YouTube or Vimeo
update storage.buckets set allowed_mime_types = (
  select array_agg(distinct m) from unnest(coalesce(allowed_mime_types, '{}') || array['video/mp4','video/webm','video/quicktime']) m)
where id = 'media';
revoke all on function public.invest_sync_counts() from public, anon, authenticated;
