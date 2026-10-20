-- Applied 21 Oct 2026 as migration order_lines_with_options:
-- store_order_items.choices keeps each line's chosen options; catalog_choice_text() writes them in words;
-- site_submit_order() prices each line with catalog_price() and labels it, e.g.
-- "Steel security door (Width 1,000 mm, Height 2,100 mm, Colour: Custom colour)".
alter table public.store_order_items add column if not exists choices jsonb;
