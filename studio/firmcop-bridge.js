/* Firmcop bridge — connects the 3D configurators to firmcop.com (host page, quote system, price book).
   Load after platform-rules.js. Messages (window.postMessage, JSON objects with a `type`):
   3D → host : firmcop:ready {version, design} · firmcop:estimate {design, total, currency} · firmcop:quote-request {requestId, payload}
   host → 3D : firmcop:price-book {currency?:{code,symbol,rate}, prices:{key|sku: value}} · firmcop:quote-created {requestId, ref, trackUrl}
               firmcop:customer {name, phone, email, location}  (prefill)
   Without a host: POSTs to <meta name="firmcop-quote-endpoint" content="…">, else falls back to WhatsApp / email. */
(function () {
  const VERSION = 1;
  const meta = n => (document.querySelector(`meta[name="${n}"]`) || {}).content || '';
  const CFG = Object.assign({
    allowedOrigins: ['https://www.firmcop.com', 'https://firmcop.com', location.origin],
    endpoint: meta('firmcop-quote-endpoint'),
    trackUrl: 'https://www.firmcop.com/track-quote',
    whatsapp: '254714521170', email: 'info@firmcop.com',
  }, window.FIRMCOP_CONFIG || {});
  // Firmcop price-book SKUs → Factory-rules keys. Keys like "prices.m20" are also accepted directly.
  const SKU = {
    'CONT-10': 'prices.m10', 'CONT-20HC': 'prices.m20', 'CONT-40HC': 'prices.m40', 'CONT-45HC': 'prices.m45', 'HC-UPGRADE': 'prices.hcUpgrade',
    'CONNECTION': 'prices.connection', 'WALL-OPEN': 'prices.openedWall', 'CANTILEVER': 'prices.cantilever', 'FOOTING-PAD': 'prices.footing',
    'FRAME-OPENING': 'prices.wideFrame', 'CRANE-DAY': 'prices.crane', 'ENGINEERING': 'prices.engineering', 'LABOUR-HR': 'prices.labourRate', 'MARGIN-PCT': 'prices.margin',
    'BAL-MESH': 'balustrades.mesh.price', 'BAL-GLASS': 'balustrades.glass.price', 'BAL-BARS': 'balustrades.bars.price', 'BAL-CABLE': 'balustrades.cable.price',
    'BAL-SLATS': 'balustrades.slats.price', 'BAL-PERF': 'balustrades.perf.price', 'BAL-SOLID': 'balustrades.solid.price',
  };
  const embedded = window.parent !== window;
  const pending = {};
  let customer = {}, design = { id: '', name: '' };
  const post = msg => { if (embedded) window.parent.postMessage(msg, '*'); };
  const PR = () => window.PlatformRules;

  function applyPriceBook(pb) {
    if (!PR()) return;
    const patch = {};
    const cur = pb.currency || {};
    if (cur.symbol || cur.code || cur.rate) patch.currency = { ...(cur.code && { code: cur.code }), ...(cur.symbol && { symbol: cur.symbol }), ...(cur.rate && { rate: +cur.rate }) };
    const rate = +(patch.currency && patch.currency.rate) || PR().get().currency.rate || 1;
    for (const [k, v] of Object.entries(pb.prices || {})) {
      const path = SKU[k] || k; if (!/^(prices|balustrades)\./.test(path) || isNaN(+v)) continue;
      const keys = path.split('.'); let o = patch;
      keys.slice(0, -1).forEach(p => o = o[p] = o[p] || {});
      o[keys.at(-1)] = keys.at(-1) === 'margin' ? +v : +v / rate; // host prices arrive in display currency; rules store base
    }
    PR().set(patch);
  }

  window.addEventListener('message', e => {
    const d = e.data; if (!d || typeof d !== 'object' || typeof d.type !== 'string' || !d.type.startsWith('firmcop:')) return;
    if (!CFG.allowedOrigins.includes(e.origin) && e.origin !== 'null') return;
    if (d.type === 'firmcop:price-book') applyPriceBook(d);
    else if (d.type === 'firmcop:customer') customer = { ...customer, ...d };
    else if (d.type === 'firmcop:quote-created' && pending[d.requestId]) { pending[d.requestId](d); delete pending[d.requestId]; }
  });

  async function submit(payload) {
    const requestId = Math.random().toString(36).slice(2);
    payload = { source: 'firmcop-3d', version: VERSION, createdAt: new Date().toISOString(), currency: currency().code, ...payload };
    if (embedded) {
      const r = await new Promise(res => { pending[requestId] = res; post({ type: 'firmcop:quote-request', requestId, payload }); setTimeout(() => { if (pending[requestId]) { delete pending[requestId]; res(null); } }, 10000); });
      if (r) return { via: 'host', ref: r.ref || payload.ref, trackUrl: r.trackUrl || `${CFG.trackUrl}?ref=${encodeURIComponent(r.ref || payload.ref)}` };
    }
    if (CFG.endpoint) {
      try {
        const res = await fetch(CFG.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (res.ok) { const j = await res.json().catch(() => ({})); const ref = j.ref || payload.ref; return { via: 'api', ref, trackUrl: j.trackUrl || `${CFG.trackUrl}?ref=${encodeURIComponent(ref)}` }; }
      } catch (e) { console.warn('Firmcop quote endpoint failed', e); }
    }
    const c = payload.customer || {};
    const text = [`Hi Firmcop, quote request ${payload.ref} for the ${payload.design.name}.`, `Estimate: ${fmt(payload.total)}`, `Name: ${c.name || ''}`, `Phone: ${c.phone || ''}`, `Location: ${c.location || ''}`, c.notes ? `Notes: ${c.notes}` : '', payload.shareUrl ? `Design: ${payload.shareUrl}` : ''].filter(Boolean).join('\n');
    return { via: 'fallback', ref: payload.ref, whatsapp: `https://wa.me/${CFG.whatsapp}?text=${encodeURIComponent(text)}`, mailto: `mailto:${CFG.email}?subject=${encodeURIComponent('Quote request ' + payload.ref)}&body=${encodeURIComponent(text + '\n\n' + (payload.lines || []).map(l => `${l.name}  ${l.qty} ${l.unit}  ${fmt(l.amount)}`).join('\n'))}` };
  }

  const currency = () => (PR() && PR().get().currency) || { code: 'USD', symbol: '$', rate: 1 };
  const fmt = v => { const c = currency(); const n = Math.round(Math.abs(v) * (c.rate || 1)); return (v < 0 ? '−' : '') + c.symbol + (c.symbol.length > 1 ? ' ' : '') + n.toLocaleString('en-US'); };

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function requestQuoteUI(getPayload) {
    const p0 = getPayload();
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(10,11,13,.6);display:flex;align-items:center;justify-content:center;padding:16px;font-family:Archivo,system-ui,sans-serif';
    const inp = 'height:44px;border:1px solid #c6c4be;border-radius:4px;padding:0 12px;font:inherit;font-size:15px;width:100%;box-sizing:border-box;background:#fff;color:#16171a';
    const lab = 'display:flex;flex-direction:column;gap:6px;font-size:13px;color:#3a3c41';
    const btn = 'height:48px;border:none;border-radius:4px;font:inherit;font-weight:700;font-size:15px;cursor:pointer;padding:0 20px';
    wrap.innerHTML = `<form style="background:#fff;color:#16171a;border-radius:6px;max-width:480px;width:100%;padding:24px;display:flex;flex-direction:column;gap:14px;max-height:100%;overflow:auto" novalidate>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px"><div><div style="font:500 11px 'IBM Plex Mono',monospace;letter-spacing:.12em;text-transform:uppercase;color:#d4520b">Firmcop quote request</div><h3 style="margin:6px 0 0;font-size:22px">${esc(p0.design.name)}</h3></div><button type="button" data-x aria-label="Close" style="border:none;background:none;font-size:26px;cursor:pointer;width:44px;height:44px">×</button></div>
      <div style="font-size:14px;color:#3a3c41">Ref <b>${esc(p0.ref)}</b> · estimate <b>${fmt(p0.total)}</b>. Our team confirms site, delivery and final price.</div>
      <label style="${lab}">Full name<input name="name" autocomplete="name" required style="${inp}" value="${esc(customer.name)}"></label>
      <label style="${lab}">Phone / WhatsApp<input name="phone" type="tel" autocomplete="tel" required style="${inp}" value="${esc(customer.phone)}"></label>
      <label style="${lab}">Email<input name="email" type="email" autocomplete="email" style="${inp}" value="${esc(customer.email)}"></label>
      <label style="${lab}">Site location<input name="location" placeholder="Town / county" style="${inp}" value="${esc(customer.location)}"></label>
      <label style="${lab}">Notes<textarea name="notes" rows="3" style="${inp};height:auto;padding:10px 12px"></textarea></label>
      <div data-err style="color:#b3261e;font-size:13px"></div>
      <button type="submit" style="${btn};background:#FF6A1A;color:#16171a">Send quote request</button>
    </form>`;
    document.body.appendChild(wrap);
    const close = () => wrap.remove();
    wrap.addEventListener('click', e => { if (e.target === wrap || e.target.closest('[data-x]')) close(); });
    const form = wrap.querySelector('form');
    form.onsubmit = async e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(form));
      if (!f.name || !f.phone) { wrap.querySelector('[data-err]').textContent = 'Please add your name and phone number.'; return; }
      customer = { ...customer, ...f };
      form.querySelector('[type=submit]').textContent = 'Sending…';
      const r = await submit({ ...getPayload(), customer: f });
      const body = r.via === 'fallback'
        ? `<p style="margin:0;font-size:15px;line-height:1.55">Send your request to our sales team. Reference <b>${esc(r.ref)}</b>.</p><a href="${r.whatsapp}" target="_blank" rel="noopener" style="${btn};background:#FF6A1A;color:#16171a;display:flex;align-items:center;justify-content:center;text-decoration:none">Send on WhatsApp</a><a href="${r.mailto}" style="${btn};background:#fff;border:1px solid #c6c4be;color:#16171a;display:flex;align-items:center;justify-content:center;text-decoration:none">Send by email</a>`
        : `<p style="margin:0;font-size:15px;line-height:1.55">Request received. Your quote reference is <b>${esc(r.ref)}</b>. We'll contact you on ${esc(f.phone)}.</p><a href="${r.trackUrl}" target="_top" style="${btn};background:#16171a;color:#fff;display:flex;align-items:center;justify-content:center;text-decoration:none">Track your quote</a>`;
      form.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><h3 style="margin:0;font-size:22px">${r.via === 'fallback' ? 'Almost there' : 'Thank you'}</h3><button type="button" data-x aria-label="Close" style="border:none;background:none;font-size:26px;cursor:pointer;width:44px;height:44px">×</button></div>${body}`;
    };
  }

  window.FirmcopBridge = {
    VERSION, embedded, config: CFG, SKU,
    init(d) { design = d; post({ type: 'firmcop:ready', version: VERSION, design: d }); if (PR()) PR().onChange(() => post({ type: 'firmcop:rules-changed' })); },
    estimate(total) { post({ type: 'firmcop:estimate', design, total: Math.round(total * (currency().rate || 1)), currency: currency().code }); },
    submit, requestQuoteUI, fmt, currency, applyPriceBook,
  };
})();
