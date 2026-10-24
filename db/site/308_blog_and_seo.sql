-- Blog and SEO: posts, categories, page settings, redirects. Applied to Supabase project firmo as migration blog_and_seo.
create table if not exists public.blog_categories (
  slug text primary key, name text not null, description text, sort int not null default 100
);
insert into public.blog_categories(slug, name, description, sort) values
 ('guides', 'Guides', 'How to plan, buy and live in a modular building in Kenya', 1),
 ('prices-and-costs', 'Prices and costs', 'What things cost in KES, and why', 2),
 ('projects', 'Projects', 'Builds we delivered, with the numbers', 3),
 ('investment', 'Investment and Airbnb', 'Modular buildings that earn', 4),
 ('steel-and-tanks', 'Steel and tanks', 'Fabrication, tanks and structures', 5),
 ('news', 'News', 'Firmcop news', 9)
on conflict (slug) do nothing;
alter table public.blog_categories enable row level security;
create policy blog_categories_read on public.blog_categories for select using (true);
create policy blog_categories_staff on public.blog_categories for all using (public.ds_is_staff()) with check (public.ds_is_staff());

create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  excerpt text,
  body_html text not null default '',
  cover_url text, cover_alt text,
  category text references public.blog_categories(slug) on update cascade,
  tags text[] not null default '{}',
  author_name text,
  status text not null default 'draft' check (status in ('idea','draft','review','scheduled','published','archived')),
  published_at timestamptz,
  search_phrase text,           -- the search people type that this post answers
  brief text,                   -- what the post should cover (ideas and AI drafts)
  seo_title text, seo_description text, og_image_url text, noindex boolean not null default false,
  related_products text[] not null default '{}',
  related_works text[] not null default '{}',
  reading_minutes int,
  needs_expansion boolean not null default false,
  source text not null default 'staff',   -- staff | ai | firmcop.com
  legacy_path text,
  ai jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists blog_posts_pub on public.blog_posts(status, published_at desc);
alter table public.blog_posts enable row level security;
create policy blog_posts_public on public.blog_posts for select using (status in ('published','scheduled') and published_at <= now() and not noindex or public.ds_is_staff());
create policy blog_posts_staff_ins on public.blog_posts for insert with check (public.ds_is_staff());
create policy blog_posts_staff_upd on public.blog_posts for update using (public.ds_is_staff()) with check (public.ds_is_staff());
create policy blog_posts_staff_del on public.blog_posts for delete using (public.ds_is_staff());
grant select on public.blog_posts, public.blog_categories to anon, authenticated;
grant insert, update, delete on public.blog_posts, public.blog_categories to authenticated;
create or replace function public.blog_touch() returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if new.status in ('published','scheduled') and new.published_at is null then new.published_at := now(); end if;
  new.reading_minutes := greatest(1, round(coalesce(length(regexp_replace(new.body_html, '<[^>]+>', ' ', 'g')), 0) / 5.5 / 220.0));
  return new;
end $$;
create trigger blog_touch before insert or update on public.blog_posts for each row execute function public.blog_touch();

create table if not exists public.seo_overrides (
  path text primary key,
  title text, description text, og_image_url text, canonical_url text,
  noindex boolean not null default false, json_ld jsonb, notes text,
  updated_at timestamptz not null default now()
);
alter table public.seo_overrides enable row level security;
create policy seo_overrides_read on public.seo_overrides for select using (true);
create policy seo_overrides_staff on public.seo_overrides for all using (public.ds_is_staff()) with check (public.ds_is_staff());
grant select on public.seo_overrides to anon, authenticated; grant insert, update, delete on public.seo_overrides to authenticated;

create table if not exists public.seo_redirects (
  id uuid primary key default gen_random_uuid(),
  source_path text not null unique,
  destination_path text not null,
  status_code int not null default 301 check (status_code in (301, 302, 308, 307)),
  active boolean not null default true,
  hit_count int not null default 0, last_hit_at timestamptz,
  notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.seo_redirects enable row level security;
create policy seo_redirects_read on public.seo_redirects for select using (active or public.ds_is_staff());
create policy seo_redirects_staff on public.seo_redirects for all using (public.ds_is_staff()) with check (public.ds_is_staff());
grant select on public.seo_redirects to anon, authenticated; grant insert, update, delete on public.seo_redirects to authenticated;
create or replace function public.seo_redirect_hit(_path text) returns void language sql security definer set search_path = public as $$
  update seo_redirects set hit_count = hit_count + 1, last_hit_at = now() where source_path = _path and active;
$$;
grant execute on function public.seo_redirect_hit(text) to anon, authenticated;

alter table public.catalog_products add column if not exists seo_title text, add column if not exists seo_description text;
alter table public.catalog_categories add column if not exists seo_title text, add column if not exists seo_description text;

insert into public.site_settings(key, value, label) values
 ('seo_new_site_url', '', 'Address of the new site once live (canonical links). Empty = the address it is served from'),
 ('seo_allow_index', 'false', 'Let search engines index this site (turn on when it replaces firmcop.com)'),
 ('seo_indexnow_key', '', 'IndexNow key (Bing, Yandex)')
on conflict (key) do nothing;
