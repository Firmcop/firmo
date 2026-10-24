// Anything that is not a file on the site lands here: old firmcop.com addresses are sent to their new pages
// (from the SEO redirects table, which staff edit in the admin), everything else gets the 404 page.
const L = require('./_lib.js');
// whole families of old addresses that have no one-to-one match
const PATTERNS = [[/^\/products\/.+/, '/collection'], [/^\/gallery\/.+/, '/works'], [/^\/leasing\/.+/, '/collection?c=container-dry'], [/^\/industries\/.+/, '/collection'], [/^\/blog\/.+/, '/blog']];
module.exports = async (req, res) => {
  const u = new URL(req.url, 'http://x');
  let p = '/' + String(u.searchParams.get('path') || '').replace(/^\/+/, '');
  try { p = decodeURIComponent(p); } catch (e) { /* keep as is */ }
  const trimmed = p.length > 1 ? p.replace(/\/+$/, '') : p;
  // IndexNow key file: /<key>.txt proves to Bing and others that the site owns the key
  if (/^\/[A-Za-z0-9-]{8,128}\.txt$/.test(p)) {
    const set = await L.settings().catch(() => ({})), key = String(set.seo_indexnow_key || '').trim();
    if (key && p === '/' + key + '.txt') { res.statusCode = 200; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.setHeader('Cache-Control', 'public, max-age=3600'); return res.end(key); }
  }
  try {
    const rows = await L.rest('seo_redirects?select=source_path,destination_path,status_code&active=eq.true&source_path=in.(' + [p, trimmed, trimmed.toLowerCase()].map((x) => '"' + x.replace(/"/g, '') + '"').join(',') + ')');
    const r = rows.find((x) => x.source_path === p) || rows[0];
    if (r) {
      if (L.CFG) await Promise.race([fetch(L.CFG.url + '/rest/v1/rpc/seo_redirect_hit', { method: 'POST', headers: { apikey: L.CFG.key, Authorization: 'Bearer ' + L.CFG.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ _path: r.source_path }) }).catch(() => {}), new Promise((ok) => setTimeout(ok, 800))]);
      res.statusCode = r.status_code || 301; res.setHeader('Location', r.destination_path); res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600'); return res.end();
    }
  } catch (e) { /* fall through */ }
  const pat = PATTERNS.find(([re]) => re.test(trimmed));
  if (pat) { res.statusCode = 301; res.setHeader('Location', pat[1]); res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600'); return res.end(); }
  return L.notFound(res);
};
