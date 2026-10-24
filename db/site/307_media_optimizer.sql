-- Photo optimiser: every upload to the `media` bucket is shrunk and cached by the media-optimize Edge Function
-- (source in db/site/functions/media-optimize). Applied to Supabase project firmo as migrations
-- media_optimizer and media_secret_check. The shared secret is created in Vault and is not stored here.
create extension if not exists pg_net;
create table if not exists public.media_assets (
  path text primary key,
  status text not null default 'pending',
  original_bytes bigint, bytes bigint, width int, height int, content_type text, error text,
  updated_at timestamptz not null default now()
);
comment on table public.media_assets is 'One row per photo in the media bucket: what media-optimize did to it.';
alter table public.media_assets enable row level security;
create policy media_assets_staff_read on public.media_assets for select using (public.ds_is_staff());
grant select on public.media_assets to authenticated;

-- run once with a fresh random value:  select vault.create_secret('<random 48 hex>', 'media_optimize_secret', '...');

create or replace function public.media_on_upload() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare s text;
begin
  if new.bucket_id <> 'media' or new.name !~* '\.(jpe?g|png|webp|gif|avif|bmp|tiff?)$' then return new; end if;
  select decrypted_secret into s from vault.decrypted_secrets where name = 'media_optimize_secret' limit 1;
  perform net.http_post(
    url := 'https://llzifrmwczpejiagqltx.supabase.co/functions/v1/media-optimize',
    body := jsonb_build_object('path', new.name),
    headers := jsonb_build_object('content-type', 'application/json', 'x-media-secret', coalesce(s, '')),
    timeout_milliseconds := 60000);
  return new;
end $$;
revoke all on function public.media_on_upload() from public, anon, authenticated;
create trigger media_on_upload after insert on storage.objects for each row execute function public.media_on_upload();

create or replace function public.media_secret_ok(_s text) returns boolean
language sql security definer set search_path = public as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'media_optimize_secret' and decrypted_secret = _s);
$$;
revoke all on function public.media_secret_ok(text) from public, anon, authenticated;
grant execute on function public.media_secret_ok(text) to service_role;
