// Shared helpers for the site's server functions: data from Supabase, page meta, sanitising.
const fs = require('fs'), path = require('path');
const CFG = require('./_cfg.js');

async function rest(q) {
  const r = await fetch(CFG.url + '/rest/v1/' + q, { headers: { apikey: CFG.key, Authorization: 'Bearer ' + CFG.key } });
  if (!r.ok) throw new Error('data ' + r.status);
  return r.json();
}
let SET = null, SET_AT = 0;
async function settings() {
  if (SET && Date.now() - SET_AT < 60000) return SET;
  const rows = await rest('site_settings?select=key,value').catch(() => []);
  SET = Object.fromEntries(rows.map((r) => [r.key, r.value])); SET_AT = Date.now(); return SET;
}
function site(req, s) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const base = (s.seo_new_site_url || '').trim().replace(/\/+$/, '') || 'https://' + host;
  return { host, base, index: String(s.seo_allow_index || '').toLowerCase() === 'true', name: s.company_name || 'Firmcop' };
}
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const text = (h) => String(h || '').replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); if (s.length <= n) return s; const t = s.slice(0, n - 1); return t.slice(0, Math.max(t.lastIndexOf(' '), n - 20)).replace(/[,;:.\s]+$/, '') + '…'; };
// a photo at a given width (Supabase image service for our storage, Unsplash's own sizing for Unsplash)
function img(u, w) {
  if (!u) return '';
  const pre = CFG.url + '/storage/v1/object/public/';
  if (u.indexOf(pre) === 0) return CFG.url + '/storage/v1/render/image/public/' + u.slice(pre.length).split('?')[0] + '?width=' + w + '&quality=75';
  if (/^https:\/\/images\.unsplash\.com\//.test(u)) { try { const x = new URL(u); x.searchParams.set('w', String(w)); x.searchParams.set('q', '72'); x.searchParams.set('auto', 'format'); x.searchParams.set('fit', 'crop'); return x.toString(); } catch (e) { return u; } }
  return u;
}
// staff-written article HTML: keep the formatting, drop anything that runs code
function clean(html) {
  let h = String(html || '');
  h = h.replace(/<(script|style|object|embed|form|textarea|select|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, '');
  h = h.replace(/<\/?(script|style|object|embed|form|input|button|textarea|select|link|meta|base|noscript|template)\b[^>]*>/gi, '');
  h = h.replace(/<iframe\b[^>]*src=["'](https:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com|player\.vimeo\.com)\/[^"']+)["'][^>]*>\s*<\/iframe>/gi, '<iframe src="$1" loading="lazy" allowfullscreen style="width:100%;aspect-ratio:16/9;border:0"></iframe>');
  h = h.replace(/<iframe(?![^>]*(youtube|vimeo))[\s\S]*?<\/iframe>/gi, '');
  h = h.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  h = h.replace(/(href|src)\s*=\s*(["'])\s*(javascript|data|vbscript):[^"']*\2/gi, '$1="#"');
  return h;
}
const read = (f) => fs.readFileSync(path.join(process.cwd(), f), 'utf8');
/* Put this page's meta into a page template: title, description, canonical, robots, Open Graph,
   Twitter card, structured data, and the route the page's own script reads. */
function render(tpl, m) {
  let h = tpl;
  const head = [
    '<base href="/">',
    `<link rel="canonical" href="${esc(m.canonical)}">`,
    m.noindex ? '<meta name="robots" content="noindex,follow">' : '<meta name="robots" content="index,follow,max-image-preview:large">',
    `<meta property="og:site_name" content="Firmcop">`, `<meta property="og:locale" content="en_KE">`,
    `<meta property="og:type" content="${esc(m.type || 'website')}">`, `<meta property="og:title" content="${esc(m.ogTitle || m.title)}">`,
    `<meta property="og:description" content="${esc(m.description)}">`, `<meta property="og:url" content="${esc(m.canonical)}">`,
    m.image ? `<meta property="og:image" content="${esc(m.image)}"><meta property="og:image:width" content="1200"><meta name="twitter:image" content="${esc(m.image)}">` : '',
    `<meta name="twitter:card" content="${m.image ? 'summary_large_image' : 'summary'}">`, `<meta name="twitter:title" content="${esc(m.ogTitle || m.title)}">`, `<meta name="twitter:description" content="${esc(m.description)}">`,
    m.published ? `<meta property="article:published_time" content="${esc(m.published)}">` : '',
    ...(m.jsonld || []).filter(Boolean).map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`),
    `<script>window.FC_ROUTE=${JSON.stringify(m.route || {}).replace(/</g, '\\u003c')};${m.data ? 'window.' + m.data[0] + '=' + JSON.stringify(m.data[1]).replace(/</g, '\\u003c') + ';' : ''}</script>`,
  ].filter(Boolean).join('\n');
  h = h.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(m.title)}</title>`);
  h = h.replace(/<meta name="description"[^>]*>/i, `<meta name="description" content="${esc(m.description)}">`);
  h = h.replace(/<meta charset="utf-8">/i, (x) => x + '\n' + head);
  if (m.body) h = h.replace('<!--SSR-->', m.body);
  return h;
}
function send(res, status, html, opt) {
  opt = opt || {};
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', opt.cache || 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400');
  if (opt.noindex) res.setHeader('X-Robots-Tag', 'noindex');
  res.end(html);
}
function notFound(res, s) {
  let h = read('404.html');
  return send(res, 404, h, { noindex: true, cache: 'public, max-age=0, s-maxage=60' });
}
const ORG = (s) => ({ '@context': 'https://schema.org', '@type': 'Organization', name: 'Firmcop', url: s.base + '/', logo: s.base + '/img/container.jpg', address: { '@type': 'PostalAddress', addressLocality: 'Nairobi', addressCountry: 'KE' } });
const crumbs = (s, list) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: list.map(([n, u], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: s.base + u })) });
module.exports = { CFG, rest, settings, site, esc, text, clip, img, clean, read, render, send, notFound, ORG, crumbs };
