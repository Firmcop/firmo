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

