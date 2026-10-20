/* Firmcop website ↔ Firmcop2 backend.
   Needs ds-config.js first (window.FC_SUPA = { url, key }).
   Gives every page: enquiry forms (FC.lead), WhatsApp (FC.wa), Atelier checkout (FC.order),
   quote requests (FC.quote), live lists for DC pages (FC.list), and client sign-in (FC.auth). */
(function () {
  'use strict';
  const CFG = window.FC_SUPA || {};
  const FC = (window.FC = window.FC || {});
  const AUTH_KEY = 'fc-site-auth';
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-KE');
  FC.esc = esc; FC.fmt = fmt;

  // ---------- auth (Supabase GoTrue over fetch) ----------
  let session = store.get(AUTH_KEY);
  const listeners = [];
  function setSession(s) { session = s; store.set(AUTH_KEY, s); listeners.forEach((f) => { try { f(s); } catch (e) {} }); }
  async function authFetch(path, body, method) {
    const r = await fetch(CFG.url + '/auth/v1/' + path, {
      method: method || 'POST',
      headers: Object.assign({ apikey: CFG.key, 'Content-Type': 'application/json' }, session && method === 'GET' ? { Authorization: 'Bearer ' + session.access_token } : {}),
      body: body ? JSON.stringify(body) : undefined
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error_description || j.msg || j.message || ('Sign-in failed (' + r.status + ')'));
    return j;
  }
  function keep(j) {
    if (!j || !j.access_token) return null;
    const s = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (Number(j.expires_in) || 3600), user: j.user || null };
    setSession(s); return s;
  }
  async function token() {
    if (!session) return null;
    if (session.expires_at - 60 > Date.now() / 1000) return session.access_token;
    try { keep(await authFetch('token?grant_type=refresh_token', { refresh_token: session.refresh_token })); }
    catch (e) { setSession(null); return null; }
    return session && session.access_token;
  }
  FC.auth = {
    get session() { return session; },
    get email() { return session && session.user ? session.user.email : ''; },
    onChange(f) { listeners.push(f); },
    async signIn(email, password) { return keep(await authFetch('token?grant_type=password', { email, password })); },
    async signUp(email, password) {
      const j = await authFetch('signup?redirect_to=' + encodeURIComponent(location.href.split('#')[0]), { email, password });
      return keep(j) || { confirm: true };
    },
    async magicLink(email) { await authFetch('otp?redirect_to=' + encodeURIComponent(location.href.split('#')[0]), { email, create_user: true }); return true; },
    async resetPassword(email) { await authFetch('recover?redirect_to=' + encodeURIComponent(location.href.split('#')[0]), { email }); return true; },
    async updatePassword(password) { const t = await token(); const r = await fetch(CFG.url + '/auth/v1/user', { method: 'PUT', headers: { apikey: CFG.key, Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) }); if (!r.ok) throw new Error('Could not set the password'); return true; },
    async signOut() { const t = session && session.access_token; setSession(null); if (t) fetch(CFG.url + '/auth/v1/logout', { method: 'POST', headers: { apikey: CFG.key, Authorization: 'Bearer ' + t } }).catch(() => {}); },
    token
  };
  // returning from an email link: #access_token=...&refresh_token=...&type=magiclink|signup|recovery
  (function readHash() {
    if (!/access_token=/.test(location.hash)) return;
    const p = new URLSearchParams(location.hash.slice(1));
    const s = keep({ access_token: p.get('access_token'), refresh_token: p.get('refresh_token'), expires_in: p.get('expires_in') });
    FC.auth.recovery = p.get('type') === 'recovery';
    history.replaceState(null, '', location.pathname + location.search);
    if (s) authFetch('user', null, 'GET').then((u) => { session.user = u; setSession(session); }).catch(() => {});
  })();

  // ---------- data ----------
  async function headers() {
    const t = await token();
    return { apikey: CFG.key, Authorization: 'Bearer ' + (t || CFG.key), 'Content-Type': 'application/json' };
  }
  FC.rest = async function (path, opts) {
    opts = opts || {};
    const h = Object.assign(await headers(), opts.headers || {});
    const r = await fetch(CFG.url + '/rest/v1/' + path, { method: opts.method || 'GET', headers: h, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const txt = await r.text(); let j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = txt; }
    if (!r.ok) throw new Error((j && (j.message || j.hint)) || ('Request failed (' + r.status + ')'));
    return j;
  };
  FC.rpc = (name, args) => FC.rest('rpc/' + name, { method: 'POST', body: args || {} });

  // site settings (phone, WhatsApp, address)
  FC.settings = { contact_phone: '+254 714 521 170', whatsapp_number: '254714521170', contact_email: 'info@firmcop.com' };
  FC.ready = FC.rest('site_settings?select=key,value').then((rows) => {
    (rows || []).forEach((r) => { if (r.value) FC.settings[r.key] = r.value; });
    fillPlaceholders(); return FC.settings;
  }).catch(() => FC.settings);

  // ---------- WhatsApp ----------
  FC.wa = function (text) {
    const n = String(FC.settings.whatsapp_number || FC.settings.contact_phone || '').replace(/\D/g, '');
    window.open('https://wa.me/' + n + (text ? '?text=' + encodeURIComponent(text) : ''), '_blank', 'noopener');
  };

  // ---------- dialog ----------
  const CSS = `
  .fcd-back{position:fixed;inset:0;background:rgba(13,12,10,.62);z-index:9999;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:5vh 16px}
  .fcd{background:#F4F1EB;color:#1B1A17;width:min(520px,100%);border-radius:6px;box-shadow:0 30px 80px rgba(0,0,0,.4);font-family:Manrope,system-ui,sans-serif;font-size:15px;line-height:1.45}
  .fcd header{padding:22px 24px 6px;display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
  .fcd h2{margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-weight:500;font-size:30px;line-height:1.05}
  .fcd .eb{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#6B4F22;margin:0 0 6px}
  .fcd .x{min-width:44px;min-height:44px;border:0;background:transparent;font-size:26px;line-height:1;cursor:pointer;color:#1B1A17}
  .fcd form{padding:6px 24px 24px;display:grid;gap:12px}
  .fcd p.intro{margin:0;color:#4A463F}
  .fcd label{display:grid;gap:4px;font-size:13px;font-weight:600;color:#3B3832}
  .fcd input,.fcd textarea,.fcd select{font:inherit;font-weight:400;font-size:16px;padding:11px 12px;border:1.5px solid #BDB29C;border-radius:4px;background:#fff;color:#1B1A17;min-height:44px;box-sizing:border-box;width:100%}
  .fcd input:focus,.fcd textarea:focus,.fcd select:focus{outline:2px solid #8A6A33;outline-offset:1px;border-color:#8A6A33}
  .fcd .row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  @media (max-width:520px){.fcd .row{grid-template-columns:1fr}}
  .fcd .sum{background:#fff;border:1px solid #DDD6CA;border-radius:4px;padding:10px 12px;font-size:14px;color:#3B3832}
  .fcd .sum b{color:#1B1A17}
  .fcd .acts{display:flex;flex-wrap:wrap;gap:10px;margin-top:4px}
  .fcd .go{min-height:48px;padding:0 20px;background:#8A6A33;color:#fff;border:0;border-radius:4px;font:inherit;font-weight:600;cursor:pointer}
  .fcd .go:hover{background:#6B4F22}.fcd .go[disabled]{opacity:.6;cursor:progress}
  .fcd .alt{min-height:48px;padding:0 18px;background:transparent;color:#1B1A17;border:1.5px solid #1B1A17;border-radius:4px;font:inherit;font-weight:600;cursor:pointer}
  .fcd .err{color:#9B2C1F;font-size:14px;margin:0}
  .fcd .ok{padding:4px 24px 26px}
  .fcd .ok .code{font-family:'IBM Plex Mono',monospace;font-size:20px;background:#fff;border:1px dashed #8A6A33;padding:8px 12px;display:inline-block;margin:6px 0 12px}
  .fcd .fine{font-size:12.5px;color:#5C5850;margin:0}`;
  function ensureCss() { if (document.getElementById('fcd-css')) return; const s = document.createElement('style'); s.id = 'fcd-css'; s.textContent = CSS; document.head.appendChild(s); }

  /* FC.dialog({ eyebrow, title, intro, summary, fields:[{name,label,type,required,placeholder,value,half,options}], submit, onSubmit(values) -> Promise<{title,body,code}> }) */
  FC.dialog = function (o) {
    ensureCss();
    const prev = document.activeElement;
    const back = document.createElement('div'); back.className = 'fcd-back';
    const id = 'fcd-' + Math.random().toString(36).slice(2, 8);
    const field = (f) => {
      const req = f.required ? ' required' : '', v = f.value != null ? f.value : '', ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : '';
      let ctl;
      if (f.type === 'textarea') ctl = `<textarea name="${f.name}" rows="3"${req}${ph}>${esc(v)}</textarea>`;
      else if (f.type === 'select') ctl = `<select name="${f.name}"${req}>${f.options.map((x) => `<option value="${esc(x[0])}"${x[0] === v ? ' selected' : ''}>${esc(x[1])}</option>`).join('')}</select>`;
      else ctl = `<input name="${f.name}" type="${f.type || 'text'}" value="${esc(v)}"${req}${ph}${f.type === 'tel' ? ' inputmode="tel" autocomplete="tel"' : ''}${f.type === 'email' ? ' autocomplete="email"' : ''}${f.name === 'name' ? ' autocomplete="name"' : ''}${f.min ? ` min="${f.min}"` : ''}>`;
      return `<label>${esc(f.label)}${f.required ? '' : ' <span style="font-weight:400;color:#6B665D">(optional)</span>'}${ctl}</label>`;
    };
    const rows = []; const fs = o.fields || [];
    for (let i = 0; i < fs.length; i++) {
      if (fs[i].half && fs[i + 1] && fs[i + 1].half) { rows.push(`<div class="row">${field(fs[i])}${field(fs[i + 1])}</div>`); i++; }
      else rows.push(field(fs[i]));
    }
    back.innerHTML = `<div class="fcd" role="dialog" aria-modal="true" aria-labelledby="${id}">
      <header><div>${o.eyebrow ? `<p class="eb">${esc(o.eyebrow)}</p>` : ''}<h2 id="${id}">${esc(o.title)}</h2></div><button type="button" class="x" aria-label="Close">×</button></header>
      <form novalidate>${o.intro ? `<p class="intro">${o.intro}</p>` : ''}${o.summary ? `<div class="sum">${o.summary}</div>` : ''}${rows.join('')}
      <p class="err" role="alert" hidden></p>
      <div class="acts"><button type="submit" class="go">${esc(o.submit || 'Send')}</button>${o.altLabel ? `<button type="button" class="alt" data-alt>${esc(o.altLabel)}</button>` : ''}</div>
      ${o.fine ? `<p class="fine">${o.fine}</p>` : ''}</form></div>`;
    document.body.appendChild(back);
    const box = back.querySelector('.fcd'), form = back.querySelector('form'), err = back.querySelector('.err'), go = back.querySelector('.go');
    let done = false;
    const close = (val) => { if (done) return; done = true; back.remove(); document.removeEventListener('keydown', onKey, true); if (prev && prev.focus) prev.focus(); res(val); };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(null); }
      if (e.key === 'Tab') { const els = [...box.querySelectorAll('button,input,select,textarea,a[href]')].filter((x) => !x.disabled && x.offsetParent); if (!els.length) return; const a = els[0], z = els[els.length - 1]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } }
    };
    let res; const p = new Promise((r) => { res = r; });
    document.addEventListener('keydown', onKey, true);
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(null); });
    back.querySelector('.x').onclick = () => close(null);
    const alt = back.querySelector('[data-alt]'); if (alt) alt.onclick = () => { close(null); o.onAlt && o.onAlt(); };
    form.onsubmit = async (e) => {
      e.preventDefault(); err.hidden = true;
      const vals = {}; fs.forEach((f) => { vals[f.name] = (form.elements[f.name].value || '').trim(); });
      const miss = fs.find((f) => f.required && !vals[f.name]);
      if (miss) { err.textContent = 'Please fill in ' + miss.label.toLowerCase() + '.'; err.hidden = false; form.elements[miss.name].focus(); return; }
      const bad = fs.find((f) => f.type === 'email' && vals[f.name] && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(vals[f.name]));
      if (bad) { err.textContent = 'That email address does not look right.'; err.hidden = false; form.elements[bad.name].focus(); return; }
      go.disabled = true; const label = go.textContent; go.textContent = 'Sending…';
      try {
        const r = await o.onSubmit(vals);
        if (r === false) { go.disabled = false; go.textContent = label; return; }
        if (r && (r.title || r.body)) {
          box.innerHTML = `<header><div><p class="eb">${esc(o.eyebrow || 'Firmcop')}</p><h2 id="${id}">${esc(r.title || 'Thank you')}</h2></div><button type="button" class="x" aria-label="Close">×</button></header>
            <div class="ok">${r.code ? `<div>Your reference</div><div class="code">${esc(r.code)}</div>` : ''}<p style="margin:0 0 16px">${r.body || ''}</p>
            <div class="acts"><button type="button" class="go" data-close>Done</button>${r.wa ? `<button type="button" class="alt" data-wa>WhatsApp us now</button>` : ''}</div></div>`;
          box.querySelector('.x').onclick = () => close(r); box.querySelector('[data-close]').onclick = () => close(r);
          const w = box.querySelector('[data-wa]'); if (w) w.onclick = () => FC.wa(r.wa);
          box.querySelector('[data-close]').focus();
        } else close(r);
      } catch (ex) { err.textContent = String(ex.message || ex).replace(/^.*?:\s(?=Please|Too|Your|Nothing)/, ''); err.hidden = false; go.disabled = false; go.textContent = label; }
    };
    setTimeout(() => { const f = form.querySelector('input,textarea,select'); (f || go).focus(); }, 30);
    return p;
  };

  const contactFields = (opts) => [
    { name: 'name', label: 'Your name', required: true, half: true, value: (opts && opts.name) || '' },
    { name: 'phone', label: 'Phone or WhatsApp', type: 'tel', required: !(opts && opts.emailRequired), half: true, placeholder: '07XX XXX XXX', value: (opts && opts.phone) || '' },
    { name: 'email', label: 'Email', type: 'email', required: !!(opts && opts.emailRequired), value: FC.auth.email || '' }
  ];

  // ---------- leads ----------
  const LEAD = {
    visit: { title: 'Book a yard visit', intro: 'Walk through finished units and see the materials. Tell us when suits you and we will confirm by phone or WhatsApp.', date: true, submit: 'Request a visit', done: 'We will call or WhatsApp you to confirm the time.' },
    survey: { title: 'Book a site survey', intro: 'A surveyor checks access, levels and services on your plot, then confirms the delivery plan.', date: true, location: true, submit: 'Request a survey', done: 'A surveyor will call to arrange the visit.' },
    feasibility: { title: 'Request a feasibility study', intro: 'We check county rules, costs and the layout you planned, then send a short report.', location: true, submit: 'Send request', done: 'Our team will confirm county rules and costs, usually within three working days.' },
    delivery_quote: { title: 'Get a delivery quote', intro: 'Tell us where the materials are going. We will message delivery options and a price.', location: true, submit: 'Request delivery quote', done: 'We will message you with delivery options.' },
    reservation: { title: 'Reserve units', intro: 'An investment advisor calls to walk you through the documents. No payment is taken until you have read them.', email: true, submit: 'Start reservation', done: 'An investment advisor will call you to go through the documents before any payment.' },
    waitlist: { title: 'Join the waitlist', intro: 'We will tell you if a unit is released or a similar project opens.', email: true, submit: 'Join waitlist', done: 'You are on the waitlist.' },
    info_pack: { title: 'Get the information pack', intro: 'Site plan, projections, legal structure and operator agreement. We send it by email.', email: true, submit: 'Email me the pack', done: 'We will email the information pack shortly.' },
    callback: { title: 'Ask us to call you', intro: 'Leave your number and a short note. A Firmcop advisor will call.', submit: 'Request a call', done: 'An advisor will call you.' },
    contact: { title: 'Talk to Firmcop', intro: 'Ask anything about a build, a design or materials.', submit: 'Send message', done: 'We will reply shortly.' }
  };
  FC.lead = function (kind, o) {
    o = o || {}; const d = LEAD[kind] || LEAD.contact;
    const fields = contactFields({ emailRequired: d.email });
    if (d.location || o.location) fields.push({ name: 'location', label: 'Site location', placeholder: 'Town or area', value: o.locationValue || '' });
    if (d.date) fields.push({ name: 'date', label: 'Preferred date', type: 'date', min: new Date().toISOString().slice(0, 10) });
    fields.push({ name: 'message', label: 'Anything we should know', type: 'textarea', value: o.message || '' });
    return FC.dialog({
      eyebrow: o.eyebrow || 'Firmcop', title: o.title || d.title, intro: o.intro || d.intro, summary: o.summary, fields, submit: d.submit,
      fine: 'We use your details only to reply to this request.',
      onSubmit: async (v) => {
        const ctx = Object.assign({}, o.context || {}, v.location ? { location: v.location } : {});
        const r = await FC.rpc('site_submit_lead', { _kind: kind, _name: v.name, _phone: v.phone, _email: v.email || null, _message: v.message || null, _preferred_date: v.date || null, _page: (document.title || location.pathname).slice(0, 200), _context: ctx });
        if (o.onDone) o.onDone(r);
        return { title: 'Request received', code: r.code, body: esc(d.done), wa: 'Hello Firmcop, my request reference is ' + r.code + '.' };
      }
    });
  };
  FC.subscribe = (email, source) => FC.rpc('site_subscribe', { _email: email, _source: source || location.pathname });

  // ---------- Atelier checkout ----------
  FC.order = function (items, totalText) {
    return FC.dialog({
      eyebrow: 'Atelier', title: 'Place your order', intro: 'We confirm stock and delivery, then send an M-Pesa payment request or bank details. Nothing is charged now.',
      summary: `${items.length} line${items.length === 1 ? '' : 's'} · Total <b>KES ${esc(totalText)}</b> before delivery`,
      fields: contactFields({ emailRequired: true }).concat([{ name: 'address', label: 'Delivery or collection', placeholder: 'Delivery address, or "collect from the yard"', required: true }, { name: 'notes', label: 'Notes', type: 'textarea' }]),
      submit: 'Send order',
      onSubmit: async (v) => {
        const r = await FC.rpc('site_submit_order', { _name: v.name, _phone: v.phone, _email: v.email, _address: v.address, _notes: v.notes || null, _items: items });
        return { title: 'Order received', code: r.code, body: 'Total KES ' + fmt(r.total) + '. We will confirm stock and delivery, then send the payment request to ' + esc(v.phone || v.email) + '.', wa: 'Hello Firmcop, my Atelier order is ' + r.code + '.', order: r };
      }
    }).then((r) => (r && r.order) || null);
  };

  // ---------- quotes (Configure page, Studio proposals) ----------
  /* q = { source, title, intent, lines:[{label,detail,qty,unit,rate,amount}], subtotal, vat, total, design_slug, phone } */
  FC.quote = function (q) {
    const intents = { deposit: 'Reserve with a 30% deposit', review: 'Ask an engineer to review it first', save: 'Save it with Firmcop', proposal: 'Send me this proposal' };
    return FC.dialog({
      eyebrow: q.source === 'studio' ? '3D Studio' : 'Configure', title: q.intent === 'deposit' ? 'Reserve your build' : 'Send this quote to Firmcop',
      intro: q.intent === 'deposit' ? 'We hold your production slot and send an M-Pesa request for the 30% deposit after a quick call to confirm the details.' : 'A Firmcop advisor checks the design and calls you within one working day.',
      summary: `<b>${esc(q.title || 'Your design')}</b><br>${q.lines ? q.lines.length + ' BOQ lines · ' : ''}Total incl. VAT <b>KES ${fmt(q.total)}</b>${q.intent === 'deposit' ? ` · Deposit <b>KES ${fmt(q.total * 0.3)}</b>` : ''}`,
      fields: contactFields({ emailRequired: true, phone: q.phone }).concat([{ name: 'location', label: 'Site location', placeholder: 'Town or area' }, { name: 'notes', label: 'Notes', type: 'textarea' }]),
      submit: intents[q.intent] ? 'Send' : 'Send quote request',
      onSubmit: async (v) => {
        const r = await FC.rpc('site_submit_quote', { _name: v.name, _phone: v.phone, _email: v.email, _location: v.location || null, _source: q.source || 'website', _title: q.title || null, _intent: q.intent || null, _lines: q.lines || [], _subtotal: q.subtotal || 0, _vat: q.vat || 0, _total: q.total || 0, _notes: v.notes || null, _design_slug: q.design_slug || null });
        return { title: q.intent === 'deposit' ? 'Slot on hold' : 'Quote sent', code: r.code, body: q.intent === 'deposit' ? 'We will call to confirm, then send the M-Pesa request for KES ' + fmt(q.total * 0.3) + '.' : 'An advisor will call you within one working day.', wa: 'Hello Firmcop, my quote reference is ' + r.code + '.', quote: r };
      }
    }).then((r) => (r && r.quote) || null);
  };

  // ---------- live lists for the DC pages ----------
  const TYPE_IMG = { 'A-frame': '/_blob/6bbd5d303917960ea2a0c0ac7ba546a7', Cabin: '/_blob/934cee1933bb4f74580e99cf52bfbbdc', Steel: '/_blob/ad198461426af454fde500cf62dc0e6d', Container: '/_blob/e25e7e96e47c5616c4fdc8c27059a5ac', Other: '/_blob/ad198461426af454fde500cf62dc0e6d' };
  const LOADERS = {
    works: () => FC.rest('works?select=*&published=eq.true&order=featured.desc,sort.asc').then((rows) => rows.map((w) => ({
      name: w.title, type: w.type === 'Other' ? 'Steel' : w.type, place: w.location || 'Kenya', area: w.area_m2 ? Math.round(w.area_m2) : '', weeks: w.weeks || '',
      client: w.client || w.category || '', design: w.design || w.category || '', finishes: w.finishes || 'On request', story: w.story || '', img: (w.images && w.images[0]) || TYPE_IMG[w.type], images: w.images || [], slug: w.slug
    }))),
    store: () => FC.rest('store_items?select=*&active=eq.true&order=sort.asc').then((rows) => rows.map((x) => ({
      sku: x.sku, name: x.name, cat: x.category, unit: x.unit, price: Number(x.price), stock: x.stock == null ? 9999 : Number(x.stock), fits: x.fits || '', bg: x.swatch || '#8F8A80', tex: x.texture || 'none', img: x.image_url || ''
    }))),
    opps: () => FC.rest('investment_opportunities?select=*&published=eq.true&order=sort.asc').then((rows) => rows.map((o) => ({
      name: o.name, sector: o.sector, place: o.place || '', spec: o.spec || '', units: o.units, taken: Math.min(o.taken, o.units), price: Number(o.price),
      yLo: Number(o.yield_lo) || 0, yHi: Number(o.yield_hi) || 0, opens: o.opens || '', status: o.status_label || '', own: o.own_terms || '', operator: o.operator || '', split: o.split || '', story: o.story || '', img: o.image_url || '', pack: o.pack_url || '', slug: o.slug
    })))
  };
  /* Use inside a DC renderVals: const all = FC.list(this, 'works', [ ...static fallback ]); */
  FC.list = function (comp, key, fallback) {
    if (!comp.__fc) comp.__fc = {};
    if (!comp.__fc[key]) {
      comp.__fc[key] = 'loading';
      const L = LOADERS[key];
      if (L && CFG.url) L().then((rows) => { if (rows && rows.length) { comp.__fc[key] = rows; comp.setState({ ['__fc_' + key]: Date.now() }); } }).catch((e) => { console.warn('[FC] ' + key + ' stays on built-in content:', e.message); });
    }
    return Array.isArray(comp.__fc[key]) ? comp.__fc[key] : fallback;
  };

  // ---------- page-wide hooks ----------
  function hook(e) {
    if (document.documentElement.hasAttribute('data-fc-admin')) return;
    const a = e.target.closest && e.target.closest('a,button');
    if (!a) return;
    const txt = (a.textContent || '').trim().toLowerCase(), href = a.getAttribute('href') || '';
    if (/whatsapp/.test(txt) && (href === '#visit' || /#visit$/.test(href) || href === '#' || a.hasAttribute('data-fc-wa'))) { e.preventDefault(); FC.wa('Hello Firmcop, I found you on your website.'); return; }
    if (/(book a yard visit|visit the yard|book a visit|walk through one)/.test(txt) && (href === '' || /#visit$/.test(href))) { e.preventDefault(); FC.lead('visit'); return; }
    if (a.hasAttribute('data-fc-lead')) { e.preventDefault(); FC.lead(a.getAttribute('data-fc-lead')); }
  }
  document.addEventListener('click', hook, true);

  // replace the prototype placeholders that come from settings
  function fillPlaceholders() {
    const s = FC.settings, map = { '[Yard address]': s.contact_address, '[Year]': s.founded_year, '[No.]': s.nca_number };
    const walk = (root) => {
      const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n; const hits = [];
      while ((n = it.nextNode())) if (/\[(Yard address|Year|No\.)\]/.test(n.nodeValue)) hits.push(n);
      hits.forEach((t) => { let v = t.nodeValue; Object.keys(map).forEach((k) => { if (map[k]) v = v.split(k).join(map[k]); }); if (v !== t.nodeValue) t.nodeValue = v; });
    };
    const run = () => walk(document.body);
    if (document.body) run();
    if (!FC._obs && window.MutationObserver) { let t = 0; FC._obs = new MutationObserver(() => { clearTimeout(t); t = setTimeout(run, 120); }); document.addEventListener('DOMContentLoaded', () => FC._obs.observe(document.body, { childList: true, subtree: true })); if (document.body) FC._obs.observe(document.body, { childList: true, subtree: true }); }
  }
})();
