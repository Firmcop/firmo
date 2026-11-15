-- Image library: staff keep photos, videos and PDFs in folders and reuse them anywhere in the admin.
-- Applied to Supabase project firmo as migration media_library.
create table if not exists public.media_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(name) between 1 and 80),
  sort int not null default 100,
  created_at timestamptz not null default now()
);
create table if not exists public.media_library (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid references public.media_folders(id) on delete set null,
  path text not null unique,
  url text not null,
  name text not null,
  alt text,
  kind text not null default 'photo' check (kind in ('photo','video','document','other')),
  content_type text,
  bytes bigint,
  width int, height int,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists media_library_folder on public.media_library(folder_id, created_at desc);
alter table public.media_folders enable row level security;
alter table public.media_library enable row level security;
create policy media_folders_staff on public.media_folders for all using (public.ds_is_staff()) with check (public.ds_is_staff());
create policy media_library_staff on public.media_library for all using (public.ds_is_staff()) with check (public.ds_is_staff());
grant select, insert, update, delete on public.media_folders, public.media_library to authenticated;
insert into public.media_folders(name, sort) values ('General', 1), ('Products', 2), ('Projects', 3), ('Blog', 4), ('Invest', 5), ('Brand and logos', 6) on conflict (name) do nothing;

create policy "media staff read" on storage.objects for select using (bucket_id = 'media' and public.ds_is_staff());
create policy "media staff delete" on storage.objects for delete using (bucket_id = 'media' and public.ds_is_staff());

create or replace function public.media_library_sync() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update media_library set bytes = new.bytes, width = new.width, height = new.height, content_type = coalesce(new.content_type, content_type), updated_at = now()
  where path = new.path and new.status = 'done';
  return new;
end $$;
revoke all on function public.media_library_sync() from public, anon, authenticated;
drop trigger if exists media_library_sync on public.media_assets;
create trigger media_library_sync after insert or update on public.media_assets for each row execute function public.media_library_sync();
