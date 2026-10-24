// media-optimize: keeps every photo in the `media` bucket small and cacheable.
//  - called by a database trigger whenever a file lands in the bucket ({ path })
//  - called by staff from the admin to import photos still hosted elsewhere and
//    to (re)optimise everything ({ action: "import" | "optimize-all" | "status" })
// Resizing uses Supabase Storage image transformations (imgproxy), so no image
// decoding happens in this function.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "media", MAX = 2000, QUALITY = 80, KEEP_BYTES = 350_000, YEAR = "public, max-age=31536000, immutable";
const IMG = /\.(jpe?g|png|webp|gif|avif|bmp|tiff?)$/i;
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, apikey, content-type, x-media-secret", "access-control-allow-methods": "POST, OPTIONS" };
const svc = { apikey: SRK, Authorization: "Bearer " + SRK };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });
const pub = (p: string) => `${URL_}/storage/v1/object/public/${BUCKET}/${p.split("/").map(encodeURIComponent).join("/")}`;

// image size from the file header (JPEG, PNG, WebP, GIF), without decoding
function dims(b: Uint8Array): [number, number] | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b[0] === 0x89 && b[1] === 0x50) return [dv.getUint32(16), dv.getUint32(20)];
  if (b[0] === 0x47 && b[1] === 0x49) return [dv.getUint16(6, true), dv.getUint16(8, true)];
  if (b[0] === 0x52 && b[8] === 0x57) { // RIFF....WEBP
    const t = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (t === "VP8X") return [1 + (b[24] | b[25] << 8 | b[26] << 16), 1 + (b[27] | b[28] << 8 | b[29] << 16)];
    if (t === "VP8 ") return [dv.getUint16(26, true) & 0x3fff, dv.getUint16(28, true) & 0x3fff];
    if (t === "VP8L") { const v = dv.getUint32(21, true); return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)]; }
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1], len = dv.getUint16(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [dv.getUint16(i + 7), dv.getUint16(i + 5)];
      i += 2 + len;
    }
  }
  return null;
}
async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...svc, "content-type": "application/json", Prefer: "return=representation", ...(init.headers || {}) } });
  const t = await r.text(); if (!r.ok) throw new Error(`${path}: ${r.status} ${t.slice(0, 200)}`); return t ? JSON.parse(t) : null;
}
async function upload(path: string, body: Uint8Array, type: string) {
  const r = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`, { method: "POST", headers: { ...svc, "content-type": type, "x-upsert": "true", "cache-control": YEAR }, body });
  if (!r.ok) throw new Error("upload " + r.status + " " + (await r.text()).slice(0, 200));
}
async function record(row: Record<string, unknown>) {
  await rest("media_assets?on_conflict=path", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ ...row, updated_at: new Date().toISOString() }) });
}

// shrink one stored photo in place: at most 2000 px on the long side, WebP, cached for a year
async function optimize(path: string, force = false) {
  if (!IMG.test(path)) return { path, skipped: "not a photo" };
  if (!force) { const done = await rest(`media_assets?select=status&path=eq.${encodeURIComponent(path)}`); if (done && done[0] && done[0].status === "done") return { path, skipped: "already done" }; }
  try {
    const o = await fetch(pub(path) + "?t=" + Date.now());
    if (!o.ok) throw new Error("cannot read the file (" + o.status + ")");
    const orig = new Uint8Array(await o.arrayBuffer()), type = o.headers.get("content-type") || "", d = dims(orig);
    const big = d ? Math.max(d[0], d[1]) > MAX : orig.length > 1_500_000;
    let out = orig, outType = type || "application/octet-stream", w = d ? d[0] : null, h = d ? d[1] : null;
    if (big || orig.length > KEEP_BYTES || !/webp/.test(type)) {
      const s = d && Math.max(d[0], d[1]) > MAX ? MAX / Math.max(d[0], d[1]) : 1;
      const tw = d ? Math.max(1, Math.round(d[0] * s)) : MAX, th = d ? Math.max(1, Math.round(d[1] * s)) : MAX;
      const r = await fetch(`${URL_}/storage/v1/render/image/authenticated/${BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}?width=${Math.min(2500, tw)}&height=${Math.min(2500, th)}&resize=contain&quality=${QUALITY}`, { headers: { ...svc, accept: "image/webp,image/*" } });
      if (!r.ok) throw new Error("resize failed (" + r.status + "): " + (await r.text()).slice(0, 160));
      const res = new Uint8Array(await r.arrayBuffer());
      if (res.length < orig.length * 0.95) { out = res; outType = r.headers.get("content-type") || "image/webp"; if (d) { w = tw; h = th; } }
    }
    await upload(path, out, outType); // same address, so every link keeps working; also sets the year-long cache
    const row = { path, status: "done", original_bytes: orig.length, bytes: out.length, width: w, height: h, content_type: outType, error: null };
    await record(row); return row;
  } catch (e) {
    const row = { path, status: "failed", error: String((e as Error).message || e).slice(0, 400) };
    await record(row).catch(() => {}); return row;
  }
}

// photos the website still loads from another host: copy them in, shrink them, repoint the records
const SOURCES: [string, string, "text" | "array" | "gallery"][] = [
  ["catalog_products", "cover_url", "text"], ["catalog_products", "images", "array"], ["catalog_categories", "image_url", "text"],
  ["product_media", "url", "text"], ["works", "images", "array"], ["works", "gallery", "gallery"], ["works", "cover_url", "text"],
  ["blog_posts", "cover_url", "text"], ["blog_posts", "og_image_url", "text"],
];
const ours = (u: string) => u.startsWith(URL_ + "/storage/");
const importable = (u: unknown): u is string => typeof u === "string" && /^https:\/\//.test(u) && !ours(u) && !/images\.unsplash\.com/.test(u);
async function columns(table: string) { const r = await rest(`${table}?select=*&limit=1`).catch(() => null); return r && r[0] ? Object.keys(r[0]) : []; }
async function importBatch(limit: number) {
  const found = new Map<string, { table: string; col: string; kind: string; id: string }[]>();
  for (const [table, col, kind] of SOURCES) {
    const cols = await columns(table); if (!cols.includes(col) || !cols.includes("id")) continue;
    const rows = await rest(`${table}?select=id,${col}&${col}=not.is.null&limit=5000`);
    for (const r of rows) {
      const v = r[col]; const urls = kind === "text" ? [v] : kind === "array" ? (v || []) : (v || []).map((g: { url?: string }) => g && g.url);
      for (const u of urls) if (importable(u)) { if (!found.has(u)) found.set(u, []); found.get(u)!.push({ table, col, kind, id: r.id }); }
    }
  }
  const todo = [...found.entries()].slice(0, limit), done: unknown[] = [];
  for (const [u, refs] of todo) {
    try {
      const r = await fetch(u); if (!r.ok) throw new Error("download " + r.status);
      const b = new Uint8Array(await r.arrayBuffer()), t = r.headers.get("content-type") || "image/jpeg";
      if (!/^image\//.test(t)) throw new Error("not an image: " + t);
      const name = decodeURIComponent(u.split("?")[0].split("/").pop() || "photo").toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "").slice(-60) || "photo";
      const ext = IMG.test(name) ? "" : "." + (t.split("/")[1] || "jpg").replace("jpeg", "jpg");
      const path = `imported/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}-${name}${ext}`;
      await upload(path, b, t); const res = await optimize(path, true); const nu = pub(path);
      for (const ref of refs) {
        const row = (await rest(`${ref.table}?select=${ref.col}&id=eq.${ref.id}`))[0]; let v = row[ref.col];
        if (ref.kind === "text") v = v === u ? nu : v; else if (ref.kind === "array") v = (v || []).map((x: string) => x === u ? nu : x); else v = (v || []).map((g: { url?: string }) => g && g.url === u ? { ...g, url: nu } : g);
        await rest(`${ref.table}?id=eq.${ref.id}`, { method: "PATCH", body: JSON.stringify({ [ref.col]: v }), headers: { Prefer: "return=minimal" } });
      }
      done.push({ from: u, to: nu, refs: refs.length, ...(res as object) });
    } catch (e) { done.push({ from: u, error: String((e as Error).message || e) }); }
  }
  return { imported: done, remaining: Math.max(0, found.size - todo.length) };
}
async function isStaff(auth: string | null) {
  if (!auth) return false;
  const r = await fetch(`${URL_}/rest/v1/rpc/ds_is_staff`, { method: "POST", headers: { apikey: SRK, Authorization: auth, "content-type": "application/json" }, body: "{}" });
  return r.ok && (await r.json()) === true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  let body: Record<string, unknown> = {}; try { body = await req.json(); } catch (_) { /* empty */ }
  const given = req.headers.get("x-media-secret") || "";
  const fromTrigger = given.length > 20 && (await fetch(`${URL_}/rest/v1/rpc/media_secret_ok`, { method: "POST", headers: { ...svc, "content-type": "application/json" }, body: JSON.stringify({ _s: given }) }).then((r) => r.ok ? r.json() : false).catch(() => false)) === true;
  if (!fromTrigger && !(await isStaff(req.headers.get("authorization")))) return json({ error: "Only Firmcop staff can run this" }, 403);
  try {
    if (typeof body.path === "string") return json(await optimize(body.path, !!body.force));
    if (body.action === "import") return json(await importBatch(Math.min(25, Number(body.limit) || 10)));
    if (body.action === "optimize-all") {
      // walk the bucket (folders too), skip photos already handled, do up to 20 per call
      const list = (prefix: string) => fetch(`${URL_}/storage/v1/object/list/${BUCKET}`, { method: "POST", headers: { ...svc, "content-type": "application/json" }, body: JSON.stringify({ prefix, limit: 1000 }) }).then((r) => r.json());
      const all: string[] = [];
      const walk = async (prefix: string, depth: number) => {
        for (const o of (await list(prefix)) || []) {
          const full = (prefix ? prefix + "/" : "") + o.name;
          if (o.id) { if (IMG.test(o.name)) all.push(full); } else if (depth < 4) await walk(full, depth + 1);
        }
      };
      await walk(String(body.prefix || "").replace(/\/+$/, ""), 0);
      const seen = new Set((await rest("media_assets?select=path&limit=10000")).map((r: { path: string }) => r.path));
      const todo = all.filter((x) => !seen.has(x)), out = [];
      for (const f of todo.slice(0, 20)) out.push(await optimize(f));
      return json({ processed: out, remaining: Math.max(0, todo.length - 20), total: all.length });
    }
    const rows = await rest("media_assets?select=status,original_bytes,bytes");
    const done = rows.filter((r: { status: string }) => r.status === "done");
    return json({ files: rows.length, done: done.length, failed: rows.length - done.length, original_bytes: done.reduce((a: number, r: { original_bytes: number }) => a + (r.original_bytes || 0), 0), bytes: done.reduce((a: number, r: { bytes: number }) => a + (r.bytes || 0), 0) });
  } catch (e) { return json({ error: String((e as Error).message || e) }, 500); }
});
