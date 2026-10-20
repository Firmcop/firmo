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
