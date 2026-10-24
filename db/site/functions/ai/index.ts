// ai: Firmcop's own AI service. Every AI feature in the admin calls this one function, so the AI provider,
// model, monthly limit and usage log live in one place.
// Provider: whichever key is set in Supabase (Edge Functions > Secrets), or the one named in site setting ai_provider:
//   GEMINI_API_KEY (Google AI Studio)  ·  ANTHROPIC_API_KEY (Claude)  ·  OPENAI_API_KEY  ·  AI_API_KEY (OpenRouter)
// Tasks: status, test, blog_draft, invest_description, product_description.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const env = (...names: string[]) => { for (const n of names) { const v = (Deno.env.get(n) || "").trim(); if (v) return v; } return ""; };
const KEYS: Record<string, string> = {
  gemini: env("GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_AI_API_KEY", "GOOGLE_GEMINI_API_KEY", "GEMINI_KEY", "GOOGLE_AI_STUDIO_KEY"),
  anthropic: env("ANTHROPIC_API_KEY", "CLAUDE_API_KEY", "ANTHROPIC_KEY"),
  openai: env("OPENAI_API_KEY", "OPENAI_KEY"),
  openrouter: env("AI_API_KEY", "OPENROUTER_API_KEY", "OPENROUTER_KEY"),
};
// a key pasted under an unexpected name: guess the service from the key itself
if (!Object.values(KEYS).some(Boolean)) {
  for (const [n, v] of Object.entries(Deno.env.toObject())) {
    if (/^SUPABASE_|^SB_|^DENO_|^PATH$|^HOME$/.test(n) || !v) continue;
    const t = v.trim().replace(/^["']|["']$/g, "");
    if (/gemini|google/i.test(n) && t.length > 20) KEYS.gemini = KEYS.gemini || t;
    else if (/anthropic|claude/i.test(n) && t.length > 20) KEYS.anthropic = KEYS.anthropic || t;
    else if (/openrouter/i.test(n) && t.length > 20) KEYS.openrouter = KEYS.openrouter || t;
    else if (/openai|chatgpt|gpt/i.test(n) && t.length > 20) KEYS.openai = KEYS.openai || t;
    else if (/^AIza[\w-]{30,}$/.test(t)) KEYS.gemini = KEYS.gemini || t;
    else if (/^sk-ant-/.test(t)) KEYS.anthropic = KEYS.anthropic || t;
    else if (/^sk-or-/.test(t)) KEYS.openrouter = KEYS.openrouter || t;
    else if (/^sk-(proj-)?[\w-]{20,}$/.test(t)) KEYS.openai = KEYS.openai || t;
  }
}
// names (never values) of the secrets this project has, to help when a key is not picked up
const SECRET_NAMES = Object.keys(Deno.env.toObject()).filter((n) => !/^SUPABASE_|^SB_|^DENO_|^(PATH|HOME|HOSTNAME|PWD|LANG|TZ|NO_COLOR|EDGE_RUNTIME.*|VERBOSE|WORKER_.*)$/.test(n)).sort();
const DEFAULT_MODEL: Record<string, string> = { gemini: "gemini-2.5-flash", anthropic: "claude-sonnet-5-5", openai: "gpt-4.1-mini", openrouter: "google/gemini-2.5-flash" };
const CHAT_URL: Record<string, string> = {
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  openai: "https://api.openai.com/v1/chat/completions",
  openrouter: Deno.env.get("AI_GATEWAY_URL") || "https://openrouter.ai/api/v1/chat/completions",
};
const KEY_NAME: Record<string, string> = { gemini: "GEMINI_API_KEY", anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY", openrouter: "AI_API_KEY" };
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, apikey, content-type", "access-control-allow-methods": "POST, OPTIONS" };
const svc = { apikey: SRK, Authorization: "Bearer " + SRK };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });
async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...svc, "content-type": "application/json", ...(init.headers || {}) } });
  const t = await r.text(); if (!r.ok) throw new Error(`${path}: ${r.status} ${t.slice(0, 200)}`); return t ? JSON.parse(t) : null;
}
// internal checks from the database (pg_net) carry the same vault secret the photo optimiser uses
async function trusted(secret: string | null) {
  if (!secret || secret.length < 20) return false;
  return (await fetch(`${URL_}/rest/v1/rpc/media_secret_ok`, { method: "POST", headers: { ...svc, "content-type": "application/json" }, body: JSON.stringify({ _s: secret }) }).then((r) => r.ok ? r.json() : false).catch(() => false)) === true;
}
async function staffUser(auth: string | null): Promise<string | null> {
  if (!auth) return null;
  const ok = await fetch(`${URL_}/rest/v1/rpc/ds_is_staff`, { method: "POST", headers: { apikey: SRK, Authorization: auth, "content-type": "application/json" }, body: "{}" }).then((r) => r.ok ? r.json() : false).catch(() => false);
  if (ok !== true) return null;
  const u = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: SRK, Authorization: auth } }).then((r) => r.ok ? r.json() : {}).catch(() => ({}));
  return (u && u.id) || "staff";
}
async function config() {
  const rows = await rest("site_settings?select=key,value&key=in.(ai_provider,ai_model,ai_monthly_cap)").catch(() => []);
  const s = Object.fromEntries(rows.map((r: { key: string; value: string }) => [r.key, r.value]));
  const want = String(s.ai_provider || "auto").toLowerCase();
  const provider = want !== "auto" && KEYS[want] ? want : (["gemini", "anthropic", "openai", "openrouter"].find((p) => KEYS[p]) || "");
  return { provider, wanted: want, model: (s.ai_model || "").trim() || (provider ? DEFAULT_MODEL[provider] : ""), cap: Number(s.ai_monthly_cap) || 300 };
}
async function usedThisMonth() {
  const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
  const r = await fetch(`${URL_}/rest/v1/ai_usage?select=id&ok=eq.true&at=gte.${start.toISOString()}`, { headers: { ...svc, Prefer: "count=exact", Range: "0-0" } });
  return Number((r.headers.get("content-range") || "").split("/")[1]) || 0;
}
const tidy = (h: string) => String(h || "").replace(/<(?!\/?(p|h2|h3|ul|ol|li|strong|em|a|blockquote|table|thead|tbody|tr|th|td|br)\b)[^>]*>/gi, "").replace(/\son\w+="[^"]*"/gi, "").replace(/href="javascript:[^"]*"/gi, 'href="#"');

// models this key can use (OpenAI-style list), newest first; used to recover when a default model is retired
async function listModels(p: string): Promise<string[]> {
  const base = p === "gemini" ? "https://generativelanguage.googleapis.com/v1beta/openai/models" : p === "openai" ? "https://api.openai.com/v1/models" : p === "openrouter" ? "https://openrouter.ai/api/v1/models" : "https://api.anthropic.com/v1/models";
  const headers: Record<string, string> = p === "anthropic" ? { "x-api-key": KEYS[p], "anthropic-version": "2023-06-01" } : { Authorization: "Bearer " + KEYS[p] };
  const r = await fetch(base, { headers }); const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(friendly(r.status, (Array.isArray(j) ? j[0]?.error?.message : j.error?.message) || ""));
  return ((j.data || j.models || []) as Array<{ id?: string; name?: string }>).map((m) => String(m.id || m.name || "").replace(/^models\//, "")).filter(Boolean);
}
function bestModel(p: string, ids: string[]) {
  const num = (id: string) => (id.match(/(\d+(?:\.\d+)?)/) || [])[1] ? Number((id.match(/(\d+(?:\.\d+)?)/) || [])[1]) : 0;
  const pick = (re: RegExp) => ids.filter((id) => re.test(id) && !/(image|tts|audio|live|embedding|vision|thinking-exp|lite)/i.test(id)).sort((a, b) => num(b) - num(a) || a.length - b.length)[0];
  if (p === "gemini") return pick(/^gemini-[\d.]+-flash$/) || pick(/^gemini-[\d.]+-flash/) || pick(/^gemini-[\d.]+-pro/) || "";
  if (p === "anthropic") return pick(/sonnet/) || ids[0] || "";
  if (p === "openai") return pick(/^gpt-[\d.]+-mini$/) || pick(/^gpt-/) || "";
  return pick(/gemini.*flash/) || ids[0] || "";
}
// one call to the chosen provider; if the model has been retired, pick the newest suitable one, remember it, retry once
async function ask(cfg: { provider: string; model: string }, system: string, user: string, maxTokens = 6000): Promise<{ text: string; inT?: number; outT?: number; model?: string }> {
  try { const r = await ask1(cfg, system, user, maxTokens); return { ...r, model: cfg.model }; }
  catch (e) {
    if (!/model was not found/.test(String((e as Error).message))) throw e;
    const m = bestModel(cfg.provider, await listModels(cfg.provider)); if (!m || m === cfg.model) throw e;
    await rest("site_settings?on_conflict=key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ key: "ai_model", value: m, updated_at: new Date().toISOString() }) }).catch(() => {});
    const r = await ask1({ ...cfg, model: m }, system, user, maxTokens); return { ...r, model: m };
  }
}
async function ask1(cfg: { provider: string; model: string }, system: string, user: string, maxTokens = 6000) {
  const p = cfg.provider, key = KEYS[p];
  if (p === "anthropic") {
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: cfg.model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(friendly(r.status, j.error && j.error.message));
    return { text: (j.content || []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join(""), inT: j.usage?.input_tokens, outT: j.usage?.output_tokens };
  }
  const headers: Record<string, string> = { Authorization: "Bearer " + key, "content-type": "application/json" };
  if (p === "openrouter") { headers["HTTP-Referer"] = "https://firmcop.com"; headers["X-Title"] = "Firmcop admin"; }
  const r = await fetch(CHAT_URL[p], { method: "POST", headers, body: JSON.stringify({ model: cfg.model, max_tokens: maxTokens + (p === "gemini" ? 4000 : 0), ...(p === "gemini" ? { reasoning_effort: "low" } : {}), response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: user }] }) });
  const j = await r.json().catch(() => ({}));
  const err = Array.isArray(j) ? j[0]?.error?.message : j.error?.message;
  if (!r.ok) throw new Error(friendly(r.status, err));
  return { text: String(j.choices?.[0]?.message?.content || ""), inT: j.usage?.prompt_tokens, outT: j.usage?.completion_tokens };
}
function friendly(status: number, msg?: string) {
  if (status === 401 || status === 403) return "The AI key was refused. Check the key in Supabase (Edge Functions > Secrets).";
  if (status === 429) return "The AI service is busy or the free limit is reached" + (msg ? " (" + String(msg).slice(0, 220) + ")" : "") + ". Try again in a minute.";
  if (status === 402) return "The AI account needs billing or credit" + (msg ? " (" + String(msg).slice(0, 220) + ")" : "") + ".";
  if (status === 404) return "The AI model was not found" + (msg ? " (" + String(msg).slice(0, 160) + ")" : "") + ". Clear the model name in Admin › AI helper to use the default.";
  return "AI service error " + status + (msg ? ": " + String(msg).slice(0, 200) : "");
}
const parseJSON = (t: string) => { const m = String(t).replace(/```(?:json)?/g, "").match(/\{[\s\S]*\}/); if (!m) throw new Error("The AI reply could not be read (" + (String(t).trim() ? "no JSON in: " + String(t).slice(0, 80) : "empty reply") + "). Try again."); return JSON.parse(m[0]); };

async function catalogue() {
  const prods = await rest("catalog_products?select=slug,name,kind,summary,price_mode,base_price,unit,lead_time_weeks,category:catalog_categories(name)&published=eq.true&order=name.asc&limit=400");
  const works = await rest("works?select=slug,title,type,location,brief&published=eq.true&limit=60").catch(() => []);
  const list = prods.map((x: Record<string, any>) => `- ${x.name} [${x.slug}] (${x.category ? x.category.name : x.kind})${x.price_mode !== "quote" && Number(x.base_price) > 0 ? `: from KES ${Math.round(Number(x.base_price)).toLocaleString("en-GB")}${x.unit ? " per " + x.unit : ""}` : ": price on quote"}${x.lead_time_weeks ? `, about ${x.lead_time_weeks} weeks` : ""}${x.summary ? ". " + String(x.summary).slice(0, 140) : ""}`).join("\n");
  const projects = works.map((w: Record<string, any>) => `- ${w.title} [${w.slug}]${w.type ? " (" + w.type + ")" : ""}${w.location ? ", " + w.location : ""}${w.brief ? ": " + String(w.brief).slice(0, 140) : ""}`).join("\n");
  return { prods, list, projects };
}
const VOICE = "Write for Kenyan buyers and investors: plain, warm, practical British English. Short paragraphs. No hype, no filler, no emojis. Never invent a Firmcop price, client, project, statistic, law, fee, return or date. Where a fact is needed that you are not given, write a sensible placeholder and mark it [CHECK: what to verify].";

const TASKS: Record<string, (body: Record<string, any>) => Promise<{ system: string; user: string; max?: number; finish: (o: any) => Promise<unknown> | unknown }>> = {
  test: async () => ({ system: "Reply with JSON only.", user: 'Reply with {"ok": true, "hello": "a one-line greeting for the Firmcop team in Nairobi"}', max: 600, finish: (o) => o }),
  blog_draft: async (b) => {
    const id = String(b.post_id || b.id || ""); if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Which post?");
    const p = (await rest(`blog_posts?select=*&id=eq.${id}`))[0]; if (!p) throw new Error("That post is gone");
    const c = await catalogue(); const cat = p.category ? (await rest(`blog_categories?select=name&slug=eq.${encodeURIComponent(p.category)}`))[0] : null;
    return {
      system: `You write first drafts of blog posts for Firmcop, a modular building company in Nairobi, Kenya (container homes and offices, A-frame houses, cabins, steel structures, water tanks). Staff edit and fact-check every draft before it is published.
${VOICE}
- Answer the search phrase fully and early: the first paragraph says what the reader will learn and gives the short answer.
- 1,200 to 1,800 words under 4 to 7 <h2> headings (<h3> sparingly). Use a <table> when comparing options or prices. Include a short FAQ with 3 to 5 questions as <h3> items.
- Prices: only Firmcop prices from the product list below, written as "from KES …".
- Link 2 to 5 relevant products in the text: <a href="/collection/SLUG"> for buildings and designs, <a href="/atelier/SLUG"> for other items, only slugs from the list. You may link /3d-studio and /works/SLUG.
- End with a short section inviting the reader to design it in the 3D Studio or ask Firmcop for a quote.
- HTML only with p, h2, h3, ul, ol, li, strong, em, a, blockquote, table, thead, tbody, tr, th, td. No h1, images, styles or classes.

Firmcop products (name [slug] (category): price):
${c.list}

Firmcop projects (title [slug]):
${c.projects || "(none listed)"}`,
      user: `Title: ${p.title}\nCategory: ${cat ? cat.name : p.category || ""}\nSearch phrase: ${p.search_phrase || "(none: infer it from the title)"}\nBrief from the team: ${p.brief || "(none)"}
${p.body_html && String(p.body_html).length > 200 ? `Existing text to improve and expand (keep what is correct, remove anything that looks invented, mark doubtful facts with [CHECK: ...]):\n${String(p.body_html).slice(0, 12000)}` : ""}

Reply with one JSON object and nothing else:
{"body_html": "...", "excerpt": "one or two sentences for the blog list", "seo_title": "up to 60 characters", "seo_description": "120 to 160 characters with the search phrase", "related_products": ["slug"], "checks": ["each fact the editor must verify"]}`,
      max: 8000,
      finish: async (o) => {
        const slugs = new Set(c.prods.map((x: { slug: string }) => x.slug));
        const res = { body_html: tidy(o.body_html), excerpt: String(o.excerpt || "").slice(0, 300), seo_title: String(o.seo_title || "").slice(0, 70), seo_description: String(o.seo_description || "").slice(0, 170),
          related_products: (o.related_products || []).filter((s: string) => slugs.has(s)).slice(0, 6), checks: (o.checks || []).slice(0, 30) };
        await rest(`blog_posts?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ai: { at: new Date().toISOString(), checks: res.checks } }) });
        return res;
      },
    };
  },
  invest_description: async (b) => {
    const id = String(b.id || ""); if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Which model?");
    const o = (await rest(`investment_opportunities?select=*&id=eq.${id}`))[0]; if (!o) throw new Error("That model is gone");
    const work = o.work_slug ? (await rest(`works?select=title,location,type,brief,story,area_m2,weeks,outcome&slug=eq.${encodeURIComponent(o.work_slug)}`))[0] : null;
    const prod = o.product_slug ? (await rest(`catalog_products?select=name,summary,description,base_price,features,specs&slug=eq.${encodeURIComponent(o.product_slug)}`))[0] : null;
    const facts = { name: o.name, stage: o.stage, sector: o.sector, unit_type: o.unit_type, place: o.place, county: o.county, size_m2: o.size_m2, bedrooms: o.bedrooms, bathrooms: o.bathrooms, units: o.units, price_per_unit_kes: o.price, deposit_pct: o.deposit_pct,
      payment_plan: o.payment_plan, projected_yield: o.yield_lo ? `${o.yield_lo}-${o.yield_hi}%` : null, nightly_rate_kes: o.rent_night, monthly_rent_kes: o.rent_month, occupancy_pct: o.occupancy_pct, management_fee_pct: o.mgmt_fee_pct, operator: o.operator, income_split: o.split, ownership: o.own_terms,
      completion: o.completion_date, handover: o.handover, existing_notes: o.story, based_on_build: work, based_on_plan: prod };
    return {
      system: `You write investment listings for Firmcop, a modular building company in Nairobi, Kenya. Each listing is a building model investors can buy units in (off-plan, building, ready, or completed and earning). Staff check every figure before publishing.
${VOICE}
Use only the facts given. Returns are projections, never promises: say "projected" and never "guaranteed". Do not give financial or legal advice.`,
      user: `Facts about this model (JSON):\n${JSON.stringify(facts)}\n\nReply with one JSON object and nothing else:
{"summary": "one or two sentences for the card, under 200 characters", "story": "4 to 6 short paragraphs of plain text separated by blank lines: the place, the unit, who it is for (guests or tenants), how it is managed and how income works, the stage and what happens next", "highlights": ["4 to 6 short highlights, each under 60 characters"]}`,
      max: 2500,
      finish: (r) => ({ summary: String(r.summary || "").slice(0, 220), story: String(r.story || "").slice(0, 5000), highlights: (r.highlights || []).map((x: string) => String(x).slice(0, 80)).slice(0, 8) }),
    };
  },
  product_description: async (b) => {
    const id = String(b.id || ""); const p = (await rest(`catalog_products?select=name,kind,summary,description,features,specs,unit,base_price,category:catalog_categories(name)&id=eq.${encodeURIComponent(id)}`))[0]; if (!p) throw new Error("That product is gone");
    return { system: `You write product descriptions for Firmcop, a modular building company in Nairobi, Kenya. ${VOICE}`,
      user: `Product facts (JSON):\n${JSON.stringify(p)}\n\nReply with one JSON object: {"summary": "one sentence under 160 characters", "description": "2 to 4 short paragraphs of plain text separated by blank lines", "features": ["3 to 8 short features"]}`, max: 1500,
      finish: (r) => ({ summary: String(r.summary || "").slice(0, 200), description: String(r.description || "").slice(0, 4000), features: (r.features || []).slice(0, 10) }) };
  },
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const uid = (await trusted(req.headers.get("x-media-secret"))) ? "system" : await staffUser(req.headers.get("authorization"));
  if (!uid) return json({ error: "Only Firmcop staff can use the AI helper" }, 403);
  let body: Record<string, any> = {}; try { body = await req.json(); } catch (_) { /* empty */ }
  const task = String(body.task || "status"), cfg = await config();
  if (task === "status") {
    const used = await usedThisMonth();
    return json({ provider: cfg.provider, model: cfg.model, wanted: cfg.wanted, cap: cfg.cap, used, keys: Object.fromEntries(Object.entries(KEYS).map(([k, v]) => [k, !!v])), key_names: KEY_NAME, defaults: DEFAULT_MODEL, secret_names: SECRET_NAMES, secret_shapes: Object.fromEntries(SECRET_NAMES.map((n) => { const t = (Deno.env.get(n) || '').trim(); return [n, { length: t.length, google_format: /^AIza[\w-]{30,}$/.test(t), spaces: /\s/.test(t) }]; })) });
  }
  if (task === "models") { if (!cfg.provider) return json({ error: "No AI key" }, 503); try { const ids = await listModels(cfg.provider); return json({ provider: cfg.provider, models: ids, best: bestModel(cfg.provider, ids) }); } catch (e) { return json({ error: String((e as Error).message) }, 500); } }
  const make = TASKS[task]; if (!make) return json({ error: "Unknown task" }, 400);
  if (!cfg.provider) return json({ error: "The AI helper is not switched on yet. Add an AI key in Supabase (Edge Functions > Secrets): GEMINI_API_KEY, ANTHROPIC_API_KEY or OPENAI_API_KEY. See Admin › AI helper. You can still write it yourself." }, 503);
  if (task !== "test" && (await usedThisMonth()) >= cfg.cap) return json({ error: `This month's AI limit (${cfg.cap} requests) is used up. An admin can raise it in Admin › AI helper.` }, 429);
  const t0 = Date.now(); let log: Record<string, unknown> = { user_id: /^[0-9a-f-]{36}$/.test(uid) ? uid : null, task, provider: cfg.provider, model: cfg.model };
  try {
    const job = await make(body);
    const r = await ask(body.model && uid === "system" ? { ...cfg, model: String(body.model) } : cfg, job.system, job.user, job.max);
    log = { ...log, model: r.model || cfg.model, input_tokens: r.inT ?? null, output_tokens: r.outT ?? null, ms: Date.now() - t0, ok: true };
    const out = await job.finish(parseJSON(r.text));
    await rest("ai_usage", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(log) }).catch(() => {});
    return json({ ...(out as object), provider: cfg.provider, model: r.model || cfg.model });
  } catch (e) {
    const msg = String((e as Error).message || e);
    await rest("ai_usage", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ...log, ok: false, error: msg.slice(0, 300), ms: Date.now() - t0 }) }).catch(() => {});
    return json({ error: msg }, 500);
  }
});
