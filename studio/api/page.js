// Server-rendered pages: /collection/<slug>, /atelier/<slug>, /works/<slug>, /blog, /blog/category/<cat>, /blog/<slug>.
// Each one is the normal page with its own title, description, canonical link, share preview and structured data
// written into the HTML, so search engines and WhatsApp/Facebook/LinkedIn previews see the right page.
const L = require('./_lib.js');
const enc = encodeURIComponent;
const BUILDING = { building: 1, design: 1 };

module.exports = async (req, res) => {
  const u = new URL(req.url, 'http://x'), q = u.searchParams;
  const kind = q.get('kind'), slug = (q.get('slug') || '').trim(), cat = (q.get('cat') || '').trim();
  try {
    const set = await L.settings(), s = L.site(req, set);
    const pathOf = { product: '/' + (q.get('scope') || 'collection') + '/' + slug, work: '/works/' + slug, post: '/blog/' + slug, blog: cat ? '/blog/category/' + cat : '/blog', invest: '/invest', model: '/invest/' + slug }[kind];
    if (!pathOf) return L.notFound(res, s);
    const ov = (await L.rest('seo_overrides?select=*&path=eq.' + enc(pathOf)).catch(() => []))[0] || {};
    const base = { canonical: ov.canonical_url || s.base + pathOf, noindex: !s.index || !!ov.noindex };
    const done = (tpl, m, status) => L.send(res, status || 200, L.render(L.read(tpl), Object.assign({}, base, m, {
      title: ov.title || m.title, ogTitle: ov.title || m.ogTitle || m.title, description: ov.description || m.description, image: ov.og_image_url ? L.img(ov.og_image_url, 1200) : m.image,
      jsonld: ov.json_ld ? (m.jsonld || []).concat([ov.json_ld]) : m.jsonld,
    })), { noindex: base.noindex });

    if (kind === 'product') {
      const p = (await L.rest('catalog_products?select=slug,name,kind,summary,description,seo_title,seo_description,cover_url,images,price_mode,base_price,unit,lead_time_weeks,updated_at,category:catalog_categories(name,slug)&published=eq.true&slug=eq.' + enc(slug)))[0];
      if (!p) return L.notFound(res, s);
      const scope = BUILDING[p.kind] ? 'collection' : 'atelier';
      if (q.get('scope') && q.get('scope') !== scope) { res.statusCode = 301; res.setHeader('Location', '/' + scope + '/' + enc(slug)); return res.end(); }
      const desc = p.seo_description || L.clip(p.summary || L.text(p.description) || `${p.name} from Firmcop, Nairobi.`, 158);
      const image = L.img(p.cover_url || (p.images || [])[0], 1200), listName = scope === 'collection' ? 'Collection' : 'Atelier';
      const offer = p.price_mode !== 'quote' && Number(p.base_price) > 0 ? { '@type': 'Offer', priceCurrency: 'KES', price: Math.round(Number(p.base_price)), availability: 'https://schema.org/InStock', url: base.canonical, seller: { '@type': 'Organization', name: 'Firmcop' } } : undefined;
      return done('product.html', {
        title: p.seo_title || `${p.name} · ${p.category ? p.category.name + ' · ' : ''}Firmcop`, ogTitle: p.seo_title || p.name, description: desc, image, type: 'product',
        route: { kind: 'product', slug: p.slug, scope },
        jsonld: [{ '@context': 'https://schema.org', '@type': 'Product', name: p.name, description: desc, image: image ? [image] : undefined, brand: { '@type': 'Brand', name: 'Firmcop' }, category: p.category && p.category.name, offers: offer },
          L.crumbs(s, [['Home', '/'], [listName, '/' + scope], ...(p.category ? [[p.category.name, '/' + scope + '?c=' + enc(p.category.slug)]] : []), [p.name, '/' + scope + '/' + p.slug]])],
      });
    }
    if (kind === 'work') {
      const w = (await L.rest('works?select=slug,title,type,location,brief,story,outcome,seo_title,seo_description,images,updated_at,created_at&published=eq.true&slug=eq.' + enc(slug)))[0];
      if (!w) return L.notFound(res, s);
      const desc = w.seo_description || L.clip(w.brief || L.text(w.story) || `${w.title}: a Firmcop ${String(w.type || '').toLowerCase()} project${w.location ? ' in ' + w.location : ''}.`, 158);
      const image = L.img((w.images || [])[0], 1200);
      return done('work.html', {
        title: w.seo_title || `${w.title} · Works · Firmcop`, ogTitle: w.seo_title || w.title, description: desc, image, type: 'article', route: { kind: 'work', slug: w.slug },
        jsonld: [{ '@context': 'https://schema.org', '@type': 'CreativeWork', name: w.title, description: desc, image: image || undefined, locationCreated: w.location ? { '@type': 'Place', name: w.location } : undefined, creator: { '@type': 'Organization', name: 'Firmcop' }, dateModified: w.updated_at },
          L.crumbs(s, [['Home', '/'], ['Works', '/works'], [w.title, '/works/' + w.slug]])],
      });
    }
    if (kind === 'blog') {
      const cats = await L.rest('blog_categories?select=slug,name,description&order=sort.asc'), c = cats.find((x) => x.slug === cat);
      if (cat && !c) return L.notFound(res, s);
      const posts = await L.rest('blog_posts?select=slug,title,excerpt,cover_url,published_at' + (c ? '&category=eq.' + enc(c.slug) : '') + '&order=published_at.desc&limit=30');
      const desc = c && c.description ? `${c.description}. Articles from Firmcop, Nairobi.` : 'Guides, prices and project stories on container homes, A-frames, cabins and steel structures in Kenya, from the Firmcop team in Nairobi.';
      // a plain list for crawlers; the page script replaces it with the designed version
      const body = `<section class="bhero"><p class="eyebrow">Firmcop journal</p><h1>${L.esc(c ? c.name : 'Guides, prices and builds')}</h1><p>${L.esc(desc)}</p></section><section class="posts">${posts.map((p) => `<a class="post" href="/blog/${L.esc(p.slug)}"><div class="bd"><h3>${L.esc(p.title)}</h3>${p.excerpt ? `<p>${L.esc(p.excerpt)}</p>` : ''}</div></a>`).join('')}</section>`;
      return done('blog.html', {
        title: (c ? c.name + ' · ' : '') + 'Blog · Firmcop Modular', description: L.clip(desc, 158), image: L.img((posts[0] || {}).cover_url, 1200), route: { kind: 'blog', cat: c ? c.slug : '' }, body,
        jsonld: [{ '@context': 'https://schema.org', '@type': 'Blog', name: 'Firmcop journal', url: s.base + '/blog', publisher: L.ORG(s), blogPost: posts.slice(0, 10).map((p) => ({ '@type': 'BlogPosting', headline: p.title, url: s.base + '/blog/' + p.slug, datePublished: p.published_at })) },
          L.crumbs(s, [['Home', '/'], ['Blog', '/blog'], ...(c ? [[c.name, '/blog/category/' + c.slug]] : [])])],
      });
    }
    if (kind === 'post') {
      const p = (await L.rest('blog_posts?select=*&slug=eq.' + enc(slug)))[0];
      if (!p) return L.notFound(res, s);
      const c = p.category ? (await L.rest('blog_categories?select=slug,name&slug=eq.' + enc(p.category)))[0] : null;
      const desc = p.seo_description || L.clip(p.excerpt || L.text(p.body_html), 158), image = L.img(p.og_image_url || p.cover_url, 1200), html = L.clean(p.body_html);
      const day = p.published_at ? new Date(p.published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
      const body = `<article class="art"><p class="meta"><a href="/blog${c ? '/category/' + L.esc(c.slug) : ''}" style="color:inherit;text-decoration:none">${L.esc(c ? c.name : 'Blog')}</a> · ${L.esc(day)}${p.reading_minutes ? ' · ' + p.reading_minutes + ' min read' : ''}</p><h1>${L.esc(p.title)}</h1>${p.excerpt ? `<p class="lede">${L.esc(p.excerpt)}</p>` : ''}${p.cover_url ? `<img class="cover" src="${L.esc(L.img(p.cover_url, 1600))}" alt="${L.esc(p.cover_alt || '')}" fetchpriority="high">` : ''}<div class="body">${html}</div></article>`;
      const data = Object.assign({}, p, { body_html: html, ai: undefined, brief: undefined, created_by: undefined });
      return done('blog.html', {
        title: p.seo_title || `${p.title} · Firmcop`, ogTitle: p.seo_title || p.title, description: desc, image, type: 'article', published: p.published_at, body, noindex: base.noindex || p.noindex,
        route: { kind: 'post', slug: p.slug }, data: ['FC_POST', data],
        jsonld: [{ '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.title, description: desc, image: image ? [image] : undefined, datePublished: p.published_at, dateModified: p.updated_at, author: { '@type': p.author_name && p.author_name !== 'Firmcop Team' ? 'Person' : 'Organization', name: p.author_name || 'Firmcop' }, publisher: L.ORG(s), mainEntityOfPage: base.canonical, keywords: (p.tags || []).join(', ') || undefined, articleSection: c ? c.name : undefined },
          L.crumbs(s, [['Home', '/'], ['Blog', '/blog'], ...(c ? [[c.name, '/blog/category/' + c.slug]] : []), [p.title, '/blog/' + p.slug]])],
      });
    }
    if (kind === 'invest') {
      const rows = await L.rest('investment_opportunities?select=slug,name,stage,place,summary,price,image_url,media&published=eq.true&order=sort.asc,name.asc');
      const desc = 'Buy units in Firmcop modular buildings that earn: off-plan, building now, ready, or completed and already let. Photos, video, units and payment plans for each model.';
      const cov = (o) => ((o.media || []).find((x) => x && x.type !== 'video' && x.url) || {}).url || o.image_url;
      const body = `<section class="ihero"><p class="eyebrow">Invest with Firmcop</p><h1>Own units in modular buildings that earn</h1><p>${L.esc(desc)}</p></section><section class="models">${rows.map((o) => `<a class="model" href="/invest/${L.esc(o.slug)}"><div class="bd"><h2>${L.esc(o.name)}</h2>${o.summary ? `<p>${L.esc(o.summary)}</p>` : ''}<p>KES ${Math.round(Number(o.price) || 0).toLocaleString('en-GB')} per unit</p></div></a>`).join('')}</section>`;
      return done('invest.html', { title: 'Invest in modular buildings · Firmcop', description: L.clip(desc, 158), image: L.img(cov(rows[0] || {}), 1200), route: { kind: 'invest' }, body,
        jsonld: [{ '@context': 'https://schema.org', '@type': 'ItemList', name: 'Firmcop investment models', itemListElement: rows.map((o, i) => ({ '@type': 'ListItem', position: i + 1, url: s.base + '/invest/' + o.slug, name: o.name })) },
          L.crumbs(s, [['Home', '/'], ['Invest', '/invest']])] });
    }
    if (kind === 'model') {
      const o = (await L.rest('investment_opportunities?select=*&published=eq.true&slug=eq.' + enc(slug)))[0];
      if (!o) return L.notFound(res, s);
      const STAGE = { offplan: 'Off-plan', building: 'Building now', ready: 'Ready to buy', completed: 'Completed and earning' };
      const ph = (o.media || []).filter((x) => x && x.type !== 'video' && x.url), vids = (o.media || []).filter((x) => x && x.type === 'video' && x.url);
      const coverU = (ph[0] || {}).url || o.image_url;
      const desc = o.seo_description || L.clip(o.summary || L.text(o.story) || `${o.name}: units from KES ${Math.round(Number(o.price) || 0).toLocaleString('en-GB')}.`, 158);
      const image = L.img(coverU, 1200);
      const body = `<div class="mhero"><div>${coverU ? `<img src="${L.esc(L.img(coverU, 1600))}" alt="${L.esc(o.name)}" style="width:100%;border-radius:6px" fetchpriority="high">` : ''}</div><aside class="facts"><span class="badge-st">${L.esc(STAGE[o.stage] || '')}</span><h1>${L.esc(o.name)}</h1>${o.summary ? `<p>${L.esc(o.summary)}</p>` : ''}<p class="price">KES ${Math.round(Number(o.price) || 0).toLocaleString('en-GB')} per unit</p></aside></div><div class="icols"><div>${(o.story || '').split(/\n{2,}/).filter(Boolean).map((t) => `<p>${L.esc(t)}</p>`).join('')}</div></div>`;
      const offer = Number(o.price) > 0 ? { '@type': 'Offer', priceCurrency: 'KES', price: Math.round(Number(o.price)), url: base.canonical, availability: Math.max(0, (o.units || 0) - (o.taken || 0)) > 0 ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut', seller: { '@type': 'Organization', name: 'Firmcop' } } : undefined;
      const data = Object.assign({}, o);
      return done('invest.html', { title: o.seo_title || `${o.name} · ${STAGE[o.stage] || 'Invest'} · Firmcop`, ogTitle: o.seo_title || o.name, description: desc, image, type: 'product', route: { kind: 'model', slug: o.slug }, body, data: ['FC_MODEL', data],
        jsonld: [{ '@context': 'https://schema.org', '@type': 'Product', name: o.name, description: desc, image: ph.slice(0, 6).map((x) => L.img(x.url, 1200)), brand: { '@type': 'Brand', name: 'Firmcop' }, category: 'Investment property: ' + (o.sector || ''), offers: offer },
          ...vids.slice(0, 1).map((v) => ({ '@context': 'https://schema.org', '@type': 'VideoObject', name: v.caption || o.name + ' video', description: desc, thumbnailUrl: [image || ''], uploadDate: o.updated_at, contentUrl: /\.(mp4|webm|mov)/i.test(v.url) ? v.url : undefined, embedUrl: /\.(mp4|webm|mov)/i.test(v.url) ? undefined : v.url })),
          L.crumbs(s, [['Home', '/'], ['Invest', '/invest'], [o.name, '/invest/' + o.slug]])] });
    }
    return L.notFound(res, s);
  } catch (e) {
    // never leave a visitor on an error: fall back to the plain page, which loads its own data
    const tpl = { product: 'product.html', work: 'work.html', post: 'blog.html', blog: 'blog.html', invest: 'invest.html', model: 'invest.html' }[kind];
    if (!tpl) { res.statusCode = 500; return res.end('Error'); }
    return L.send(res, 200, L.render(L.read(tpl), { title: 'Firmcop Modular', description: 'Firmcop modular buildings, Nairobi.', canonical: '', noindex: true, route: { kind, slug, cat, scope: q.get('scope') || undefined } }), { noindex: true, cache: 'no-store' });
  }
};
