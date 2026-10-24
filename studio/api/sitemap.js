// /sitemap.xml: every public page, built live from the Collection, the Atelier, Works and the blog.
const L = require('./_lib.js');
const x = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const BUILDING = { building: 1, design: 1 };
module.exports = async (req, res) => {
  const s = L.site(req, await L.settings());
  const [prods, cats, works, posts, bcats, ovs] = await Promise.all([
    L.rest('catalog_products?select=slug,kind,cover_url,updated_at&published=eq.true&limit=5000').catch(() => []),
    L.rest('catalog_categories?select=slug,scopes,published&published=eq.true').catch(() => []),
    L.rest('works?select=slug,images,updated_at&published=eq.true').catch(() => []),
    L.rest('blog_posts?select=slug,category,cover_url,updated_at&noindex=eq.false&order=published_at.desc&limit=5000').catch(() => []),
    L.rest('blog_categories?select=slug').catch(() => []),
    L.rest('seo_overrides?select=path&noindex=eq.true').catch(() => []),
  ]);
  const hidden = new Set(ovs.map((o) => o.path)), day = (d) => (d ? new Date(d) : new Date()).toISOString().slice(0, 10);
  const urls = [];
  const add = (p, lastmod, pri, imgs) => { if (hidden.has(p.split('?')[0])) return; urls.push(`  <url><loc>${x(s.base + p)}</loc><lastmod>${day(lastmod)}</lastmod><priority>${pri}</priority>${(imgs || []).filter(Boolean).slice(0, 5).map((i) => `<image:image><image:loc>${x(i)}</image:loc></image:image>`).join('')}</url>`); };
  [['/', '1.0'], ['/collection', '0.9'], ['/atelier', '0.8'], ['/works', '0.8'], ['/3d-studio', '0.8'], ['/blog', '0.8'], ['/Invest.dc.html', '0.5'], ['/Opportunities.dc.html', '0.5']].forEach(([p, pr]) => add(p, null, pr));
  cats.forEach((c) => { if ((c.scopes || []).includes('collection')) add('/collection?c=' + encodeURIComponent(c.slug), null, '0.7'); else if ((c.scopes || []).includes('atelier')) add('/atelier?c=' + encodeURIComponent(c.slug), null, '0.5'); });
  prods.forEach((p) => add((BUILDING[p.kind] ? '/collection/' : '/atelier/') + encodeURIComponent(p.slug), p.updated_at, BUILDING[p.kind] ? '0.8' : '0.5', [L.img(p.cover_url, 1200)]));
  works.forEach((w) => add('/works/' + encodeURIComponent(w.slug), w.updated_at, '0.7', (w.images || []).map((i) => L.img(i, 1200))));
  bcats.filter((c) => posts.some((p) => p.category === c.slug)).forEach((c) => add('/blog/category/' + encodeURIComponent(c.slug), null, '0.5'));
  posts.forEach((p) => add('/blog/' + encodeURIComponent(p.slug), p.updated_at, '0.7', [L.img(p.cover_url, 1200)]));
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=1800, stale-while-revalidate=86400');
  res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls.join('\n')}\n</urlset>\n`);
};
