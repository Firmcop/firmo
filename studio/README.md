# Firmcop website, admin and Design Studio (Firmcop2)

Static site, no build step on Vercel. The website pages (`*.dc.html`) are the canvas prototype pages, rendered in the browser by `support.js`. `build_site.py` generates them from the prototype and `site_patches.py` connects them to the backend, so edit the prototype and rebuild rather than editing them here. Deployed by its own Vercel project with root directory `studio/`.

Backend: the **Firmcop2** Supabase project (`ds-config.js`). The publishable key is meant to be public; row-level security and the `site_*` functions control access.

| Page | Backend |
|---|---|
| `/` Main, every page | "Book a yard visit" and "WhatsApp us" buttons → `leads` (`rpc/site_submit_lead`), phone/address from `site_settings` |
| `Catalog.dc.html` | Collection: published designs (`rpc/ds_package`) plus the prototype range |
| `DesignDetail.dc.html` | Book a visit / site survey → `leads` |
| `Configurator.dc.html` | Deposit, engineer review, save → `sales_quotes` with the BOQ (`rpc/site_submit_quote`) |
| `3d-studio.html` | The Design Studio inside the site; proposal "Request this quote" → `sales_quotes` |
| `Store.dc.html` (Atelier) | Items from the shared catalogue (`catalog_products` in Atelier categories); checkout → `store_orders` (`rpc/site_submit_order`, priced again in the database by `catalog_price`) |
| `Projects.dc.html` (Works) | `works` |
| `Invest.dc.html` | Feasibility request → `leads` with the planner inputs |
| `Opportunities.dc.html` | `investment_opportunities`; reserve / waitlist / pack → `leads` |
| `Portal.dc.html` (My builds) | Client signs in with the email on their build: `client_builds` + stages, payments, updates, documents, variations, messages |
| `admin.html` (`/admin`) | Staff admin for all of the above, plus the Catalogue (categories, products, options, photos and 3D models, price check), subscribers, site settings and team |
| `design-manager.html` | Design versions, review queue, publish, catalogue prices |

Staff: anyone with an active row in `ds_staff` (roles `admin`, `designer`, `sales`). First admin, once, in the SQL editor:
`insert into public.ds_staff(user_id, role) select id, 'admin' from auth.users where email = '...';` After that, admins add people under Team in `/admin`.

Database reference SQL is in `/db/site/` at the repo root (already applied).

## Catalogue (Phase 0)

One catalogue feeds the Collection, the Atelier and the 3D Studio library:
`catalog_categories` (tree, `scopes` = collection / atelier / studio) → `catalog_products` (kind, price mode, base price and rate, stock, `shape` for the simple 3D shape until a `model_url` GLB is uploaded) → `product_params` (options with limits, `price_add`, `price_mult`) and `product_media` (files in the public `media` storage bucket).
`catalog_price(product, choices)` is the one price formula; `fc-site.js` has the same rules for showing prices. Products copied from the 3D Studio catalogue carry `ds_ref`, and a trigger copies their price, stock and name back to `ds_catalog_items`, so the Studio BOQ follows the catalogue.
