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

