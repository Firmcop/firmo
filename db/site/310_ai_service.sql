-- Firmcop's own AI service (function db/site/functions/ai): usage log and settings. Applied as migration ai_service.
create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid,
  task text not null,
  provider text, model text,
  input_tokens int, output_tokens int,
  ok boolean not null default true,
  error text, ms int
);
create index if not exists ai_usage_at on public.ai_usage(at desc);
alter table public.ai_usage enable row level security;
create policy ai_usage_staff_read on public.ai_usage for select using (public.ds_is_staff());
grant select on public.ai_usage to authenticated;
insert into public.site_settings(key, value, label) values
 ('ai_provider', 'auto', 'AI service: auto, gemini, anthropic, openai or openrouter (auto = whichever key is set)'),
 ('ai_model', '', 'AI model name (empty = the service default)'),
 ('ai_monthly_cap', '300', 'Most AI requests allowed per month (protects the bill)')
on conflict (key) do nothing;
