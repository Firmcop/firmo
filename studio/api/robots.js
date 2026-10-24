// /robots.txt: closed to search engines until staff switch indexing on (Site settings, seo_allow_index),
// so the preview address never competes with firmcop.com in search results.
const L = require('./_lib.js');
module.exports = async (req, res) => {
  const s = L.site(req, await L.settings());
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600');
  res.end(s.index
    ? `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /admin.html\nDisallow: /Portal.dc.html\nDisallow: /Team.dc.html\nDisallow: /api/\n\nSitemap: ${s.base}/sitemap.xml\n`
    : `# This site is not open to search engines yet. Switch it on in the admin (Site settings) when it replaces firmcop.com.\nUser-agent: *\nDisallow: /\n`);
};
