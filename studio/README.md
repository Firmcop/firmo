# Firmcop Design Studio (Firmcop2)

Static site, no build step. Deployed by its own Vercel project with root directory `studio/`.

| Page | What it is |
|---|---|
| `collection.html` | Public catalogue. Reads published designs and live prices from Supabase (`rpc/ds_package`). |
| `design-studio.html` | Sales-assisted designer: shell, plan, furnish, finish, render, share. Author mode saves new versions (`rpc/ds_save_version`). |
| `design-manager.html` | Back office: versions, review queue, publish, catalogue prices and stock, activity. |
| `studio.html`, `2x4.html` | Engineering tools (container stacking, structure checks). |

- `ds-config.js` points at the Firmcop2 Supabase project. The publishable key is meant to be public; row-level security controls access.
- `ds-core.js` holds the model: rooms, lining, BOQ and checks. Shared by every page.
- `ds-package.json` is a fallback snapshot, used only when the database can't be reached.

Staff access: create the user in Supabase Auth, then
`insert into public.ds_staff(user_id, role) select id, 'admin' from auth.users where email = '...';` (role `admin` or `designer`).
