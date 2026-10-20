-- Firmcop website backend on Firmcop2 (firmo). Live firmcop is not touched.
-- Staff = any row in ds_staff (admin, designer or sales): public.ds_is_staff().
alter table public.ds_staff drop constraint if exists ds_staff_role_check;
alter table public.ds_staff add constraint ds_staff_role_check check (role in ('admin','designer','sales'));

-- ---------- settings and newsletter ----------
create table if not exists public.site_settings (
  key text primary key,
  value text,
  label text,
  updated_at timestamptz not null default now()
);
create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null check (position('@' in email) > 1 and length(email) <= 254),
  active boolean not null default true,
  source text,
  created_at timestamptz not null default now()
);

-- ---------- leads ----------
create sequence if not exists public.lead_code_seq start 1001;
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  code text unique not null default ('L-' || nextval('public.lead_code_seq')),
  kind text not null default 'contact' check (kind in ('visit','survey','feasibility','delivery_quote','reservation','waitlist','info_pack','contact','callback','other')),
  status text not null default 'new' check (status in ('new','contacted','qualified','won','lost','closed')),
  name text not null check (length(name) between 1 and 200),
  phone text check (phone is null or length(phone) <= 40),
  email text check (email is null or length(email) <= 254),
  preferred_date date,
  message text check (message is null or length(message) <= 4000),
  page text check (page is null or length(page) <= 200),
  context jsonb not null default '{}'::jsonb,
  assigned_to uuid references auth.users(id) on delete set null,
  internal_notes text,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists leads_status_idx on public.leads(status, created_at desc);
create table if not exists public.lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  kind text not null,
  note text,
  actor_id uuid,
  actor_email text,
  created_at timestamptz not null default now()
);
create index if not exists lead_events_lead_idx on public.lead_events(lead_id, created_at);

-- ---------- quotes (Configure page and Studio proposals) ----------
create sequence if not exists public.quote_code_seq start 1001;
create table if not exists public.sales_quotes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null default ('Q-' || nextval('public.quote_code_seq')),
  status text not null default 'pending_review' check (status in ('pending_review','sent','accepted','rejected','won','lost')),
  source text not null default 'website',
  intent text,
  title text,
  name text not null,
  phone text,
  email text not null,
  location text,
  subtotal numeric not null default 0,
  vat numeric not null default 0,
  total numeric not null default 0,
  deposit numeric,
  notes text,
  internal_notes text,
  design_slug text,
  assigned_to uuid references auth.users(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.sales_quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.sales_quotes(id) on delete cascade,
  sort integer not null default 0,
  label text not null,
  detail text,
  qty numeric,
  unit text,
  rate numeric,
  amount numeric
);
create table if not exists public.sales_quote_events (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.sales_quotes(id) on delete cascade,
  kind text not null,
  note text,
  actor_id uuid,
  created_at timestamptz not null default now()
);

-- ---------- Atelier store ----------
create table if not exists public.store_items (
  id uuid primary key default gen_random_uuid(),
  sku text unique not null,
  name text not null,
  category text not null,
  unit text not null default 'no.',
  price numeric not null default 0 check (price >= 0),
  stock numeric,
  fits text,
  swatch text default '#8F8A80',
  texture text default 'none' check (texture in ('none','ribs','boards','panels','grid')),
  image_url text,
  active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create sequence if not exists public.order_code_seq start 1001;
create table if not exists public.store_orders (
  id uuid primary key default gen_random_uuid(),
  code text unique not null default ('A-' || nextval('public.order_code_seq')),
  status text not null default 'pending' check (status in ('pending','confirmed','paid','dispatched','delivered','cancelled')),
  name text not null,
  phone text,
  email text not null,
  address text,
  notes text,
  internal_notes text,
  total numeric not null default 0,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.store_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.store_orders(id) on delete cascade,
  sku text,
  name text not null,
  unit text,
  qty numeric not null,
  unit_price numeric not null
);

-- ---------- Works (portfolio) ----------
create table if not exists public.works (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  type text not null default 'Container' check (type in ('Container','A-frame','Cabin','Steel','Other')),
  category text,
  location text,
  client text,
  area_m2 numeric,
  weeks integer,
  design text,
  finishes text,
  story text,
  images text[] not null default '{}',
  featured boolean not null default false,
  published boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- investment opportunities ----------
create table if not exists public.investment_opportunities (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  sector text not null default 'Hospitality',
  place text,
  spec text,
  units integer not null default 1 check (units > 0),
  taken integer not null default 0 check (taken >= 0),
  price numeric not null default 0,
  yield_lo numeric,
  yield_hi numeric,
  opens text,
  status_label text,
  own_terms text,
  operator text,
  split text,
  story text,
  image_url text,
  pack_url text,
  published boolean not null default false,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- client builds (My builds) ----------
create sequence if not exists public.build_code_seq start 143;
create table if not exists public.client_builds (
  id uuid primary key default gen_random_uuid(),
  code text unique not null default ('SO-' || lpad(nextval('public.build_code_seq')::text, 4, '0')),
  client_name text not null,
  client_email text not null check (position('@' in client_email) > 1),
  client_phone text,
  client_user_id uuid references auth.users(id) on delete set null,
  title text not null,
  spec text,
  location text,
  status text not null default 'active' check (status in ('active','on_hold','complete','cancelled')),
  progress integer not null default 0 check (progress between 0 and 100),
  delivery_text text,
  contract_total numeric not null default 0,
  pm_name text,
  pm_phone text,
  site_checklist jsonb not null default '[{"label":"Plinths cast to our drawing","done":false},{"label":"Access road cleared for a truck","done":false},{"label":"Power line moved or confirmed clear","done":false},{"label":"Water connection point ready","done":false},{"label":"County approval on file","done":false}]'::jsonb,
  quote_id uuid references public.sales_quotes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists client_builds_email_idx on public.client_builds(lower(client_email));
create table if not exists public.build_stages (
  id uuid primary key default gen_random_uuid(),
  build_id uuid not null references public.client_builds(id) on delete cascade,
  sort integer not null default 0,
  name text not null,
  when_text text,
  note text,
  state text not null default 'next' check (state in ('done','current','next'))
);
create table if not exists public.build_payments (
  id uuid primary key default gen_random_uuid(),
  build_id uuid not null references public.client_builds(id) on delete cascade,
  sort integer not null default 0,
  name text not null,
  note text,
  amount numeric not null default 0,
  due_date date,
  status text not null default 'upcoming' check (status in ('upcoming','due','paid')),
  paid_at timestamptz,
  method text
);
create table if not exists public.build_updates (
  id uuid primary key default gen_random_uuid(),
  build_id uuid not null references public.client_builds(id) on delete cascade,
  posted_on date not null default current_date,
  title text not null,
  body text,
  image_url text,
  created_at timestamptz not null default now()
);
create table if not exists public.build_documents (
  id uuid primary key default gen_random_uuid(),
  build_id uuid not null references public.client_builds(id) on delete cascade,
  sort integer not null default 0,
  name text not null,
  meta text,
  url text,
  available boolean not null default true
);
create table if not exists public.build_variations (
  id uuid primary key default gen_random_uuid(),
  build_id uuid not null references public.client_builds(id) on delete cascade,
  title text not null,
  description text,
  amount numeric not null default 0,
  delivery_impact text,
  status text not null default 'pending' check (status in ('pending','approved','declined')),
  decided_at timestamptz,
  decided_by uuid,
  created_at timestamptz not null default now()
);
create table if not exists public.build_messages (
  id uuid primary key default gen_random_uuid(),
  build_id uuid not null references public.client_builds(id) on delete cascade,
  from_staff boolean not null default false,
  author_name text,
  author_id uuid,
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists build_messages_idx on public.build_messages(build_id, created_at);

-- ---------- helpers ----------
create or replace function public.site_owns_build(_build_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.client_builds b
    where b.id = _build_id
      and (b.client_user_id = auth.uid()
           or (auth.uid() is not null and lower(b.client_email) = lower(coalesce(auth.jwt() ->> 'email', ''))))
  )
$$;

create or replace function public.site_touch_updated() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;

do $$ declare t text; begin
  foreach t in array array['leads','sales_quotes','store_items','store_orders','works','investment_opportunities','client_builds','site_settings'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.site_touch_updated()', t || '_touch', t);
  end loop;
end $$;

-- ---------- RLS ----------
do $$ declare t text; begin
  foreach t in array array['site_settings','newsletter_subscribers','leads','lead_events','sales_quotes','sales_quote_lines','sales_quote_events',
                           'store_items','store_orders','store_order_items','works','investment_opportunities',
                           'client_builds','build_stages','build_payments','build_updates','build_documents','build_variations','build_messages'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "staff manage %s" on public.%I', t, t);
    execute format('create policy "staff manage %s" on public.%I for all to authenticated using (public.ds_is_staff()) with check (public.ds_is_staff())', t, t);
  end loop;
end $$;

drop policy if exists "public reads settings" on public.site_settings;
create policy "public reads settings" on public.site_settings for select to anon, authenticated using (true);
drop policy if exists "public reads active store items" on public.store_items;
create policy "public reads active store items" on public.store_items for select to anon, authenticated using (active);
drop policy if exists "public reads published works" on public.works;
create policy "public reads published works" on public.works for select to anon, authenticated using (published);
drop policy if exists "public reads published opportunities" on public.investment_opportunities;
create policy "public reads published opportunities" on public.investment_opportunities for select to anon, authenticated using (published);

drop policy if exists "client reads own build" on public.client_builds;
create policy "client reads own build" on public.client_builds for select to authenticated using (public.site_owns_build(id));
do $$ declare t text; begin
  foreach t in array array['build_stages','build_payments','build_updates','build_documents','build_variations','build_messages'] loop
    execute format('drop policy if exists "client reads own %s" on public.%I', t, t);
    execute format('create policy "client reads own %s" on public.%I for select to authenticated using (public.site_owns_build(build_id))', t, t);
  end loop;
end $$;

-- ---------- public RPCs ----------
create or replace function public.site_submit_lead(
  _kind text, _name text, _phone text, _email text default null, _message text default null,
  _preferred_date date default null, _page text default null, _context jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.leads;
begin
  if coalesce(length(trim(_name)), 0) = 0 then raise exception 'Please give your name'; end if;
  if coalesce(length(trim(_phone)), 0) < 7 and coalesce(position('@' in coalesce(_email, '')), 0) < 2 then
    raise exception 'Please give a phone number or email';
  end if;
  if _kind is null or _kind not in ('visit','survey','feasibility','delivery_quote','reservation','waitlist','info_pack','contact','callback','other') then _kind := 'other'; end if;
  if (select count(*) from public.leads where created_at > now() - interval '1 hour'
        and ((nullif(trim(_phone), '') is not null and phone = trim(_phone)) or (nullif(trim(_email), '') is not null and lower(email) = lower(trim(_email))))) >= 8 then
    raise exception 'Too many requests. Please WhatsApp us instead.';
  end if;
  insert into public.leads(kind, name, phone, email, message, preferred_date, page, context, user_id)
  values (_kind, left(trim(_name), 200), nullif(left(trim(_phone), 40), ''), nullif(left(trim(_email), 254), ''), left(_message, 4000),
          _preferred_date, left(_page, 200), coalesce(_context, '{}'::jsonb), auth.uid())
  returning * into r;
  insert into public.lead_events(lead_id, kind, note) values (r.id, 'created', 'From ' || coalesce(_page, 'website'));
  return jsonb_build_object('code', r.code, 'id', r.id);
end $$;

create or replace function public.site_subscribe(_email text, _source text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if coalesce(position('@' in coalesce(_email, '')), 0) < 2 or length(_email) > 254 then raise exception 'Please give a valid email'; end if;
  insert into public.newsletter_subscribers(email, source) values (lower(trim(_email)), left(_source, 100))
  on conflict (email) do update set active = true;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.site_submit_order(
  _name text, _phone text, _email text, _address text, _notes text, _items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.store_orders; it jsonb; s public.store_items; q numeric; tot numeric := 0; low text := '';
begin
  if coalesce(length(trim(_name)), 0) = 0 or coalesce(position('@' in coalesce(_email, '')), 0) < 2 then
    raise exception 'Please give your name and email';
  end if;
  if _items is null or jsonb_typeof(_items) <> 'array' or jsonb_array_length(_items) = 0 then raise exception 'Your cart is empty'; end if;
  for it in select * from jsonb_array_elements(_items) loop
    select * into s from public.store_items where sku = it ->> 'sku' and active;
    q := greatest(0, coalesce((it ->> 'qty')::numeric, 0));
    if s.id is null or q = 0 then continue; end if;
    tot := tot + q * s.price;
    if s.stock is not null and q > s.stock then low := low || s.sku || ' (' || q || ' ordered, ' || s.stock || ' in stock); '; end if;
  end loop;
  if tot = 0 then raise exception 'Nothing in the cart could be priced'; end if;
  insert into public.store_orders(name, phone, email, address, notes, total, user_id, internal_notes)
  values (left(trim(_name), 200), left(_phone, 40), left(trim(_email), 254), left(_address, 1000), left(_notes, 2000), tot, auth.uid(),
          case when low <> '' then 'Check stock: ' || low end)
  returning * into o;
  for it in select * from jsonb_array_elements(_items) loop
    select * into s from public.store_items where sku = it ->> 'sku' and active;
    q := greatest(0, coalesce((it ->> 'qty')::numeric, 0));
    if s.id is null or q = 0 then continue; end if;
    insert into public.store_order_items(order_id, sku, name, unit, qty, unit_price) values (o.id, s.sku, s.name, s.unit, q, s.price);
  end loop;
  return jsonb_build_object('code', o.code, 'id', o.id, 'total', tot);
end $$;

create or replace function public.site_submit_quote(
  _name text, _phone text, _email text, _location text, _source text, _title text, _intent text,
  _lines jsonb, _subtotal numeric, _vat numeric, _total numeric, _notes text default null, _design_slug text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare qt public.sales_quotes; ln jsonb; i integer := 0;
begin
  if coalesce(length(trim(_name)), 0) = 0 or coalesce(position('@' in coalesce(_email, '')), 0) < 2 then
    raise exception 'Please give your name and email';
  end if;
  insert into public.sales_quotes(name, phone, email, location, source, title, intent, subtotal, vat, total, deposit, notes, design_slug, user_id)
  values (left(trim(_name), 200), left(_phone, 40), left(trim(_email), 254), left(_location, 300), left(coalesce(_source, 'website'), 40),
          left(_title, 200), left(_intent, 40), coalesce(_subtotal, 0), coalesce(_vat, 0), coalesce(_total, 0),
          case when _intent = 'deposit' then round(coalesce(_total, 0) * 0.3) end, left(_notes, 3000), left(_design_slug, 120), auth.uid())
  returning * into qt;
  if _lines is not null and jsonb_typeof(_lines) = 'array' then
    for ln in select * from jsonb_array_elements(_lines) limit 300 loop
      i := i + 1;
      insert into public.sales_quote_lines(quote_id, sort, label, detail, qty, unit, rate, amount)
      values (qt.id, i, left(coalesce(ln ->> 'label', 'Item'), 300), left(ln ->> 'detail', 300),
              nullif(ln ->> 'qty', '')::numeric, left(ln ->> 'unit', 20), nullif(ln ->> 'rate', '')::numeric, nullif(ln ->> 'amount', '')::numeric);
    end loop;
  end if;
  insert into public.sales_quote_events(quote_id, kind, note) values (qt.id, 'submitted', 'From ' || coalesce(_source, 'website') || coalesce(' · ' || _intent, ''));
  return jsonb_build_object('code', qt.code, 'id', qt.id);
end $$;

-- ---------- client portal RPCs ----------
create or replace function public.site_my_builds()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); em text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if uid is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'build', to_jsonb(b),
      'stages', (select coalesce(jsonb_agg(to_jsonb(x) order by x.sort), '[]') from public.build_stages x where x.build_id = b.id),
      'payments', (select coalesce(jsonb_agg(to_jsonb(x) order by x.sort), '[]') from public.build_payments x where x.build_id = b.id),
      'updates', (select coalesce(jsonb_agg(to_jsonb(x) order by x.posted_on desc, x.created_at desc), '[]') from public.build_updates x where x.build_id = b.id),
      'documents', (select coalesce(jsonb_agg(to_jsonb(x) order by x.sort), '[]') from public.build_documents x where x.build_id = b.id),
      'variations', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from public.build_variations x where x.build_id = b.id),
      'messages', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from public.build_messages x where x.build_id = b.id)
    ) order by b.created_at desc)
    from public.client_builds b
    where b.client_user_id = uid or (em <> '' and lower(b.client_email) = em)), '[]'::jsonb);
end $$;

create or replace function public.site_build_decide_variation(_variation_id uuid, _approve boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.build_variations;
begin
  select * into v from public.build_variations where id = _variation_id;
  if v.id is null or not public.site_owns_build(v.build_id) then raise exception 'Not found'; end if;
  if v.status <> 'pending' then raise exception 'This variation was already decided'; end if;
  update public.build_variations set status = case when _approve then 'approved' else 'declined' end, decided_at = now(), decided_by = auth.uid()
  where id = v.id returning * into v;
  insert into public.build_messages(build_id, from_staff, author_name, author_id, body)
  values (v.build_id, false, 'System', auth.uid(), 'Variation ' || v.status || ': ' || v.title);
  return to_jsonb(v);
end $$;

create or replace function public.site_build_post_message(_build_id uuid, _body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.build_messages; nm text;
begin
  if not public.site_owns_build(_build_id) then raise exception 'Not found'; end if;
  if coalesce(length(trim(_body)), 0) = 0 then raise exception 'Type a message first'; end if;
  select client_name into nm from public.client_builds where id = _build_id;
  insert into public.build_messages(build_id, from_staff, author_name, author_id, body)
  values (_build_id, false, nm, auth.uid(), left(trim(_body), 4000)) returning * into m;
  update public.client_builds set client_user_id = auth.uid() where id = _build_id and client_user_id is null;
  return to_jsonb(m);
end $$;

create or replace function public.site_build_set_checklist(_build_id uuid, _index integer, _done boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b public.client_builds;
begin
  if not public.site_owns_build(_build_id) then raise exception 'Not found'; end if;
  select * into b from public.client_builds where id = _build_id;
  if _index < 0 or _index >= jsonb_array_length(b.site_checklist) then raise exception 'Bad item'; end if;
  update public.client_builds set site_checklist = jsonb_set(site_checklist, array[_index::text, 'done'], to_jsonb(_done)),
         client_user_id = coalesce(client_user_id, auth.uid())
  where id = _build_id returning * into b;
  return b.site_checklist;
end $$;

-- ---------- staff ----------
create or replace function public.site_whoami()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('user_id', auth.uid(), 'email', auth.jwt() ->> 'email',
    'role', (select role from public.ds_staff where user_id = auth.uid()))
$$;

create or replace function public.site_admin_counts()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.ds_is_staff() then raise exception 'Staff only'; end if;
  return jsonb_build_object(
    'leads_new', (select count(*) from public.leads where status = 'new'),
    'leads_open', (select count(*) from public.leads where status in ('new','contacted','qualified')),
    'quotes_review', (select count(*) from public.sales_quotes where status = 'pending_review'),
    'orders_pending', (select count(*) from public.store_orders where status = 'pending'),
    'builds_active', (select count(*) from public.client_builds where status = 'active'),
    'variations_pending', (select count(*) from public.build_variations where status = 'pending'),
    'messages_7d', (select count(*) from public.build_messages where not from_staff and created_at > now() - interval '7 days'),
    'designs_review', (select count(*) from public.ds_design_versions where status = 'in_review'),
    'subscribers', (select count(*) from public.newsletter_subscribers where active),
    'works', (select count(*) from public.works where published),
    'low_stock', (select count(*) from public.store_items where active and stock is not null and stock <= 5)
  );
end $$;

-- staff list for the admin's Team tab (emails of staff only)
create or replace function public.site_staff_list()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.ds_is_staff() then raise exception 'Staff only'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', s.user_id, 'role', s.role, 'email', u.email) order by u.email)
                   from public.ds_staff s join auth.users u on u.id = s.user_id), '[]'::jsonb);
end $$;

create or replace function public.site_set_staff(_email text, _role text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare uid uuid;
begin
  if not public.ds_is_admin() then raise exception 'Admins only'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(_email));
  if uid is null then raise exception 'No account with that email yet. Ask them to create one first.'; end if;
  if _role is null or _role = 'none' then
    if uid = auth.uid() then raise exception 'You cannot remove yourself'; end if;
    delete from public.ds_staff where user_id = uid;
  else
    insert into public.ds_staff(user_id, role) values (uid, _role) on conflict (user_id) do update set role = excluded.role;
  end if;
  return public.site_staff_list();
end $$;

-- ---------- grants ----------
do $$ declare f text; begin
  foreach f in array array[
    'site_submit_lead(text,text,text,text,text,date,text,jsonb)', 'site_subscribe(text,text)',
    'site_submit_order(text,text,text,text,text,jsonb)', 'site_submit_quote(text,text,text,text,text,text,text,jsonb,numeric,numeric,numeric,text,text)',
    'site_my_builds()', 'site_build_decide_variation(uuid,boolean)', 'site_build_post_message(uuid,text)', 'site_build_set_checklist(uuid,integer,boolean)',
    'site_whoami()', 'site_admin_counts()', 'site_staff_list()', 'site_set_staff(text,text)', 'site_owns_build(uuid)'] loop
    execute 'revoke all on function public.' || f || ' from public, anon, authenticated';
    execute 'grant execute on function public.' || f || ' to authenticated';
  end loop;
  foreach f in array array['site_submit_lead(text,text,text,text,text,date,text,jsonb)', 'site_subscribe(text,text)',
    'site_submit_order(text,text,text,text,text,jsonb)', 'site_submit_quote(text,text,text,text,text,text,text,jsonb,numeric,numeric,numeric,text,text)'] loop
    execute 'grant execute on function public.' || f || ' to anon';
  end loop;
end $$;
grant usage on sequence public.lead_code_seq, public.quote_code_seq, public.order_code_seq, public.build_code_seq to authenticated;
