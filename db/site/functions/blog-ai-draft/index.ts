// blog-ai-draft: writes a first draft of a blog post for Firmcop staff to edit.
// Uses the post's title, search phrase and brief, plus the live Firmcop product list and prices,
// so the draft only quotes real products and prices. Anything it cannot know is marked [CHECK: ...].
// Needs the ANTHROPIC_API_KEY secret (Supabase dashboard > Edge Functions > Secrets).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const MODEL = Deno.env.get("BLOG_AI_MODEL") || "claude-sonnet-5-5";
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, apikey, content-type", "access-control-allow-methods": "POST, OPTIONS" };
const svc = { apikey: SRK, Authorization: "Bearer " + SRK };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });
async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...svc, "content-type": "application/json", ...(init.headers || {}) } });
  const t = await r.text(); if (!r.ok) throw new Error(`${path}: ${r.status} ${t.slice(0, 200)}`); return t ? JSON.parse(t) : null;
}
async function isStaff(auth: string | null) {
  if (!auth) return false;
  const r = await fetch(`${URL_}/rest/v1/rpc/ds_is_staff`, { method: "POST", headers: { apikey: SRK, Authorization: auth, "content-type": "application/json" }, body: "{}" });
  return r.ok && (await r.json()) === true;
}
const tidy = (h: string) => h.replace(/<(?!\/?(p|h2|h3|ul|ol|li|strong|em|a|blockquote|table|thead|tbody|tr|th|td|br)\b)[^>]*>/gi, "").replace(/\son\w+="[^"]*"/gi, "").replace(/href="javascript:[^"]*"/gi, 'href="#"');

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (!(await isStaff(req.headers.get("authorization")))) return json({ error: "Only Firmcop staff can use the AI helper" }, 403);
  if (!KEY) return json({ error: "The AI helper is not switched on yet. An administrator needs to add the ANTHROPIC_API_KEY secret in Supabase (Edge Functions > Secrets). You can still write the post yourself." }, 503);
  let body: Record<string, unknown> = {}; try { body = await req.json(); } catch (_) { /* empty */ }
  try {
    const id = String(body.post_id || ""); if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: "Which post?" }, 400);
    const p = (await rest(`blog_posts?select=*&id=eq.${id}`))[0]; if (!p) return json({ error: "That post is gone" }, 404);
    const prods = await rest("catalog_products?select=slug,name,kind,summary,price_mode,base_price,unit,lead_time_weeks,category:catalog_categories(name)&published=eq.true&order=name.asc&limit=400");
    const works = await rest("works?select=slug,title,type,location,brief&published=eq.true&limit=60").catch(() => []);
    const cat = p.category ? (await rest(`blog_categories?select=name&slug=eq.${encodeURIComponent(p.category)}`))[0] : null;
    const catalogue = prods.map((x: Record<string, any>) => `- ${x.name} [${x.slug}] (${x.category ? x.category.name : x.kind})${x.price_mode !== "quote" && Number(x.base_price) > 0 ? `: from KES ${Math.round(Number(x.base_price)).toLocaleString("en-GB")}${x.unit ? " per " + x.unit : ""}` : ": price on quote"}${x.lead_time_weeks ? `, about ${x.lead_time_weeks} weeks` : ""}${x.summary ? ". " + String(x.summary).slice(0, 140) : ""}`).join("\n");
    const projects = works.map((w: Record<string, any>) => `- ${w.title} [${w.slug}]${w.type ? " (" + w.type + ")" : ""}${w.location ? ", " + w.location : ""}${w.brief ? ": " + String(w.brief).slice(0, 140) : ""}`).join("\n");
    const system = `You write first drafts of blog posts for Firmcop, a modular building company in Nairobi, Kenya (container homes and offices, A-frame houses, cabins, steel structures, water tanks). Staff will edit and fact-check every draft before it is published.

Rules:
- Write for Kenyan buyers: plain, warm, practical British English. Short paragraphs. No hype, no filler, no emojis.
- Answer the search phrase fully and early: the first paragraph says what the reader will learn and gives the short answer.
- 1,200 to 1,800 words, organised under 4 to 7 <h2> headings (use <h3> sparingly). Use a <table> when comparing options or prices. Include a short FAQ section with 3 to 5 questions as <h3> items.
- Prices: only quote Firmcop prices from the product list below, written as "from KES …". Never invent a Firmcop price, client, project, statistic, law, fee or approval timeline. Where a fact is needed that you are not given (county fees, regulations, market prices from other suppliers, delivery costs), write a sensible placeholder and mark it [CHECK: what to verify]. It is better to mark too much than to guess.
- Link to 2 to 5 relevant Firmcop products inside the text with <a href="/collection/SLUG"> for buildings and designs, or <a href="/atelier/SLUG"> for other items. Use only slugs from the list. You may link /3d-studio (design it yourself in 3D) and /works/SLUG for real projects from the list.
- End with a short closing section that invites the reader to design it in the 3D Studio or ask Firmcop for a quote.
- Output only HTML using p, h2, h3, ul, ol, li, strong, em, a, blockquote, table, thead, tbody, tr, th, td. No h1, no images, no styles, no classes.

Firmcop products (name [slug] (category): price):
${catalogue}

Firmcop projects (title [slug]):
${projects || "(none listed)"}`;
    const user = `Title: ${p.title}
Category: ${cat ? cat.name : p.category || ""}
Search phrase: ${p.search_phrase || "(none given: infer it from the title)"}
Brief from the team: ${p.brief || "(none)"}
${p.body_html && String(p.body_html).length > 200 ? `Existing text to improve and expand (keep what is correct, remove anything that looks invented, mark doubtful facts with [CHECK: ...]):\n${String(p.body_html).slice(0, 12000)}` : ""}

Reply with one JSON object and nothing else:
{"body_html": "...", "excerpt": "one or two sentences for the blog list", "seo_title": "up to 60 characters", "seo_description": "120 to 160 characters with the search phrase", "related_products": ["slug", "..."], "checks": ["each fact the editor must verify"]}`;
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 8000, system, messages: [{ role: "user", content: user }] }) });
    const j = await r.json(); if (!r.ok) throw new Error("AI service: " + (j.error && j.error.message || r.status));
    const text = (j.content || []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
    const m = text.match(/\{[\s\S]*\}/); if (!m) throw new Error("The AI reply could not be read. Try again.");
    const out = JSON.parse(m[0]);
    const slugs = new Set(prods.map((x: { slug: string }) => x.slug));
    const res = { body_html: tidy(String(out.body_html || "")), excerpt: String(out.excerpt || "").slice(0, 300), seo_title: String(out.seo_title || "").slice(0, 70), seo_description: String(out.seo_description || "").slice(0, 170),
      related_products: (out.related_products || []).filter((s: string) => slugs.has(s)).slice(0, 6), checks: (out.checks || []).slice(0, 30) };
    await rest(`blog_posts?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ai: { at: new Date().toISOString(), model: MODEL, checks: res.checks, usage: j.usage || null } }) });
    return json(res);
  } catch (e) { return json({ error: String((e as Error).message || e) }, 500); }
});
