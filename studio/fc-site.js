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
  FC.order = function (items, totalText, onPlaced) {
    return FC.dialog({
      eyebrow: 'Atelier', title: 'Place your order', intro: 'We confirm stock and delivery, then send an M-Pesa payment request or bank details. Nothing is charged now.',
      summary: `${items.length} line${items.length === 1 ? '' : 's'} · Total <b>KES ${esc(totalText)}</b> before delivery`,
      fields: contactFields({ emailRequired: true }).concat([{ name: 'address', label: 'Delivery or collection', placeholder: 'Delivery address, or "collect from the yard"', required: true }, { name: 'notes', label: 'Notes', type: 'textarea' }]),
      submit: 'Send order',
      onSubmit: async (v) => {
        const r = await FC.rpc('site_submit_order', { _name: v.name, _phone: v.phone, _email: v.email, _address: v.address, _notes: v.notes || null, _items: items });
        if (onPlaced) try { onPlaced(r); } catch (e) { /* the order is in; the cart tidy-up is not critical */ }
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

  // ---------- product prices (same rules as public.catalog_price) ----------
  FC.price = function (p, params, choices) {
    choices = choices || {}; let w = null, h = null, len = null, mult = 1, adds = 0; const picked = {};
    (params || []).slice().sort((a, b) => (a.sort || 0) - (b.sort || 0)).forEach((pr) => {
      const v = choices[pr.key] != null ? String(choices[pr.key]) : pr.default_value;
      if (pr.kind === 'number') {
        let n = Number(v); if (!isFinite(n)) n = Number(pr.default_value) || Number(pr.min) || 0;
        if (pr.step > 0) n = (Number(pr.min) || 0) + Math.round((n - (Number(pr.min) || 0)) / pr.step) * pr.step;
        if (pr.min != null && n < pr.min) n = Number(pr.min); if (pr.max != null && n > pr.max) n = Number(pr.max);
        if (pr.geometry === 'w') w = n; else if (pr.geometry === 'h') h = n; else if (pr.geometry === 'len') len = n;
        picked[pr.key] = n;
      } else {
        const opts = pr.options || []; const o = opts.find((x) => x.value === v) || opts[0];
        if (o) { adds += Number(o.price_add) || 0; if (o.price_mult != null) mult *= Number(o.price_mult); picked[pr.key] = o.value; }
      }
    });
    const area = w != null && h != null ? Math.round(w * h / 1000) / 1000 : null;
    const base = Number(p.base_price) || 0, rate = Number(p.rate) || 0;
    const price = p.price_mode === 'per_m2' ? base + rate * (area == null ? 1 : area) : (p.price_mode === 'per_m' ? base + rate * (len == null ? 1 : len / 1000) : base);
    return { unit_price: Math.round(price * mult + adds), area_m2: area, choices: picked, quote_only: p.price_mode === 'quote' };
  };

  // ---------- live lists for the DC pages ----------
  const TYPE_IMG = { 'A-frame': '/_blob/6bbd5d303917960ea2a0c0ac7ba546a7', Cabin: '/_blob/934cee1933bb4f74580e99cf52bfbbdc', Steel: '/_blob/ad198461426af454fde500cf62dc0e6d', Container: '/_blob/e25e7e96e47c5616c4fdc8c27059a5ac', Other: '/_blob/ad198461426af454fde500cf62dc0e6d' };
  const LOADERS = {
    works: () => FC.rest('works?select=*&published=eq.true&order=featured.desc,sort.asc').then((rows) => rows.map((w) => ({
      name: w.title, type: w.type === 'Other' ? 'Steel' : w.type, place: w.location || 'Kenya', area: w.area_m2 ? Math.round(w.area_m2) : '', weeks: w.weeks || '',
      client: w.client || w.category || '', design: w.design || w.category || '', finishes: w.finishes || 'On request', story: w.story || '', img: (w.images && w.images[0]) || TYPE_IMG[w.type], images: w.images || [], slug: w.slug, quote: w.client_quote ? '“' + w.client_quote + '”' + (w.quote_by ? ' ' + w.quote_by : '') : ''
    }))),
    store: () => FC.rest('catalog_products?select=id,slug,sku,name,kind,unit,price_mode,base_price,rate,stock,summary,specs,shape,cover_url,model_url,category:catalog_categories!inner(name,slug,scopes),params:product_params(key,label,kind,unit,min,max,step,default_value,geometry,options,sort)'
      + '&published=eq.true&kind=in.(material,fitting,furniture)&category.scopes=cs.{atelier}&price_mode=neq.quote&order=sort.asc,name.asc').then((rows) => rows.map((x) => {
      const pat = { plank: 'boards', vplank: 'boards', tile: 'grid', none: 'none' };
      return { sku: x.sku || x.slug, slug: x.slug, name: x.name, cat: x.category.name, catSlug: x.category.slug, unit: x.unit, price: FC.price(x, x.params).unit_price,
        stock: x.stock == null ? 9999 : Number(x.stock), fits: x.summary || '', bg: (x.specs && x.specs.swatch) || (x.shape && x.shape.color) || '#8F8A80',
        tex: (x.specs && (x.specs.texture || pat[x.specs.pat])) || 'none', img: x.cover_url || '', params: x.params || [], product: x };
    })),
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



  // ---------- shared header for pages outside the canvas prototype ----------
  const NAV = [['collection.html', 'Collection'], ['Invest.dc.html', 'Invest'], ['Projects.dc.html', 'Works'], ['atelier.html', 'Atelier'], ['3d-studio.html', '3D Studio'], ['Portal.dc.html', 'My builds']];
  FC.header = function (el, active) {
    if (!el) return;
    el.className = 'fc-head';
    el.innerHTML = '<div class="bar"><a class="brand" href="Main.dc.html"><b>FIRMCOP</b><small>Modular' + (FC.settings.founded_year ? ' · Est. ' + esc(FC.settings.founded_year) : '') + '</small></a>'
      + '<nav aria-label="Main">' + NAV.map(([h, l]) => '<a href="' + h + '"' + (h === active ? ' aria-current="page"' : '') + '>' + l + '</a>').join('') + '</nav>'
      + '<a class="ghost" href="Main.dc.html#visit">Visit the yard</a></div>';
  };

  // ---------- catalogue reads ----------
  const memo = {};
  FC.cats = (scope) => memo['c' + scope] || (memo['c' + scope] = FC.rest('catalog_categories?select=id,slug,name,parent_id,image_url,description,sort&published=eq.true&scopes=cs.%7B' + scope + '%7D&order=sort.asc,name.asc'));
  FC.subtree = (cats, id) => { const ids = [id]; let grew = true; while (grew) { grew = false; cats.forEach((c) => { if (c.parent_id && ids.includes(c.parent_id) && !ids.includes(c.id)) { ids.push(c.id); grew = true; } }); } return ids; };
  FC.FAMILY_IMG = { containers: '/_blob/34e98516af54244cb1e1a80f0a5f434d', aframes: '/_blob/6bbd5d303917960ea2a0c0ac7ba546a7', cabins: '/_blob/934cee1933bb4f74580e99cf52bfbbdc', steel: '/_blob/ad198461426af454fde500cf62dc0e6d' };
  FC.priceText = function (p) {
    if (p.price_mode === 'quote') return 'Price on request';
    const n = p.params && p.params.length ? FC.price(p, p.params).unit_price : Number(p.base_price);
    if (!n) return 'Price on request';
    const u = p.unit && !/^(no\.|per unit|unit)$/i.test(p.unit) ? ' ' + p.unit : '';
    return 'From KES ' + fmt(n) + u;
  };

  // ---------- mega menu (desktop) ----------
  const MEGA_CSS = `.fc-mega{position:fixed;left:0;right:0;z-index:9000;background:#15130F;color:#E8DFD0;border-top:1px solid #2A2621;border-bottom:1px solid #2A2621;box-shadow:0 30px 60px rgba(0,0,0,.45);font-family:'Manrope',system-ui,sans-serif}
.fc-mega .in{max-width:1360px;margin:0 auto;padding:26px 32px 30px;display:grid;grid-template-columns:repeat(var(--cols,4),minmax(0,1fr));gap:28px}
.fc-mega .fam{display:flex;flex-direction:column;gap:6px;min-width:0}
.fc-mega .fam .img{display:block;aspect-ratio:16/9;background:#2A2621 center/cover no-repeat;border-radius:4px;margin-bottom:8px}
.fc-mega .fam > a.t{font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;color:#F2EBDF;text-decoration:none;line-height:1.1}
.fc-mega .fam > a.t:hover{color:#C9A46A}
.fc-mega ul{list-style:none;margin:4px 0 0;padding:0;display:flex;flex-direction:column;gap:1px}
.fc-mega li a{color:#CFC6B5;text-decoration:none;font-size:14px;display:flex;justify-content:space-between;gap:8px;padding:5px 0}
.fc-mega li a:hover,.fc-mega li a:focus-visible{color:#fff}
.fc-mega li a small{color:#7D7568;font-size:12px}
.fc-mega .all{margin-top:8px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#C9A46A;text-decoration:none}`;
  /* FC.mega({ scope:'collection', match:'collection.html', page:'collection.html', kinds:'building,design' }) */
  FC.mega = function (o) {
    let panel = null, built = null, link = null, timer = 0;
    const wide = () => window.matchMedia('(min-width: 900px)').matches && window.matchMedia('(hover: hover)').matches;
    const build = () => built || (built = Promise.all([FC.cats(o.scope), FC.rest('catalog_products?select=category_id,cover_url,featured&published=eq.true&kind=in.(' + o.kinds + ')')]).then(([cats, prods]) => {
      const count = {}; prods.forEach((p) => { count[p.category_id] = (count[p.category_id] || 0) + 1; });
      const roots = cats.filter((c) => !c.parent_id);
      const famCount = (id) => FC.subtree(cats, id).reduce((a, x) => a + (count[x] || 0), 0);
      const cover = (id) => { const ids = FC.subtree(cats, id); const p = prods.find((x) => x.featured && x.cover_url && ids.includes(x.category_id)) || prods.find((x) => x.cover_url && ids.includes(x.category_id)); return p ? p.cover_url : ''; };
      if (!document.getElementById('fc-mega-css')) { const st = document.createElement('style'); st.id = 'fc-mega-css'; st.textContent = MEGA_CSS; document.head.appendChild(st); }
      panel = document.createElement('div'); panel.className = 'fc-mega'; panel.id = 'fc-mega-' + o.scope; panel.hidden = true;
      panel.setAttribute('role', 'region'); panel.setAttribute('aria-label', o.label || 'Menu');
      panel.style.setProperty('--cols', Math.min(Math.max(roots.length, 4), 6));
      panel.innerHTML = '<div class="in">' + roots.map((r) => {
        const kids = cats.filter((c) => c.parent_id === r.id && (count[c.id] || 0) > 0);
        const img = r.image_url || cover(r.id) || FC.FAMILY_IMG[r.slug] || '';
        return '<div class="fam">' + (img ? '<a class="img" href="' + o.page + '?c=' + encodeURIComponent(r.slug) + '" tabindex="-1" aria-hidden="true" style="background-image:url(\'' + esc(img) + '\')"></a>' : '')
          + '<a class="t" href="' + o.page + '?c=' + encodeURIComponent(r.slug) + '">' + esc(r.name) + '</a><ul>'
          + kids.map((k) => '<li><a href="' + o.page + '?c=' + encodeURIComponent(k.slug) + '"><span>' + esc(k.name) + '</span><small>' + count[k.id] + '</small></a></li>').join('')
          + '</ul><a class="all" href="' + o.page + '?c=' + encodeURIComponent(r.slug) + '">All ' + famCount(r.id) + ' →</a></div>';
      }).join('') + '</div>';
      panel.addEventListener('mouseenter', () => clearTimeout(timer));
      panel.addEventListener('mouseleave', () => later());
      panel.addEventListener('focusout', (e) => { if (!panel.contains(e.relatedTarget) && e.relatedTarget !== link) later(0); });
      document.body.appendChild(panel);
      return panel;
    }).catch(() => null));
    const place = () => { if (!panel || !link) return; const h = link.closest('header') || link.parentElement; panel.style.top = Math.round(h.getBoundingClientRect().bottom) + 'px'; };
    const show = (a) => { clearTimeout(timer); link = a; a.setAttribute('aria-expanded', 'true'); build().then((pn) => { if (!pn || link !== a) return; place(); pn.hidden = false; }); };
    const hide = () => { if (panel) panel.hidden = true; if (link) link.setAttribute('aria-expanded', 'false'); };
    const later = (ms) => { clearTimeout(timer); timer = setTimeout(hide, ms == null ? 220 : ms); };
    const sel = 'a[href="' + o.match + '"]';
    document.addEventListener('mouseover', (e) => { const a = e.target.closest && e.target.closest(sel); if (a && a.closest('header,.fc-head') && wide()) show(a); });
    document.addEventListener('mouseout', (e) => { const a = e.target.closest && e.target.closest(sel); if (a && a === link && !(panel && panel.contains(e.relatedTarget))) later(); });
    document.addEventListener('focusin', (e) => { const a = e.target.closest && e.target.closest(sel); if (a && a.closest('header,.fc-head') && wide()) show(a); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panel && !panel.hidden) { hide(); if (link) link.focus(); } if (e.key === 'ArrowDown' && document.activeElement === link && panel && !panel.hidden) { e.preventDefault(); const f = panel.querySelector('a.t'); if (f) f.focus(); } });
    window.addEventListener('scroll', place, { passive: true }); window.addEventListener('resize', () => { if (!wide()) hide(); else place(); });
    // warm the data so the first hover is instant
    if (wide()) setTimeout(build, 1500);
  };
  if (!document.documentElement.hasAttribute('data-fc-admin') && window.top === window) {
    FC.mega({ scope: 'collection', match: 'collection.html', page: 'collection.html', kinds: 'building,design', label: 'Collection' });
    FC.mega({ scope: 'atelier', match: 'atelier.html', page: 'atelier.html', kinds: 'material,fitting,furniture', label: 'Atelier' });
  }

  // ---------- Atelier cart (kept in this browser; prices are checked again by the server) ----------
  const CK = 'fc-cart';
  const readCart = () => { try { const v = JSON.parse(localStorage.getItem(CK) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return FC._cart || []; } };
  const writeCart = (l) => { FC._cart = l; try { localStorage.setItem(CK, JSON.stringify(l)); } catch (e) { /* private mode: memory only */ } paintCart(); document.dispatchEvent(new CustomEvent('fc-cart', { detail: l })); };
  FC.cart = {
    lines: readCart,
    count: () => readCart().reduce((a, l) => a + (Number(l.qty) || 0), 0),
    total: () => readCart().reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.price) || 0), 0),
    /* line = { slug, sku, name, img, choices, desc, unit, price, qty } */
    add(line) {
      const l = readCart(), id = line.slug + '|' + JSON.stringify(line.choices || {}), q = Math.max(1, Number(line.qty) || 1), ex = l.find((x) => x.id === id);
      if (ex) { ex.qty = (Number(ex.qty) || 0) + q; ex.price = line.price; } else l.push(Object.assign({}, line, { id, qty: q }));
      writeCart(l);
    },
    set(id, qty) { writeCart(readCart().map((x) => (x.id === id ? Object.assign({}, x, { qty: Math.max(0, Math.round(Number(qty) || 0)) }) : x)).filter((x) => x.qty > 0)); },
    clear() { writeCart([]); },
    open: () => openCart()
  };
  const CART_CSS = `.fc-cartbtn{position:fixed;right:18px;bottom:18px;z-index:80;display:inline-flex;align-items:center;gap:10px;min-height:52px;padding:0 20px;border:0;border-radius:999px;background:#0D0C0A;color:#F2EBDF;font:600 15px Manrope,system-ui,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.28);cursor:pointer}
.fc-cartbtn[hidden]{display:none}
.fc-cartbtn b{background:#C9A46A;color:#0D0C0A;border-radius:999px;min-width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;font-size:13px;padding:0 6px}
.fc-cartbtn:focus-visible{outline:3px solid #C9A46A;outline-offset:2px}
dialog.fc-cart{border:0;padding:0;margin:0 0 0 auto;height:100%;max-height:none;width:min(460px,100vw);background:#F4F1EB;color:#1B1A17;font:15px/1.5 Manrope,system-ui,sans-serif}
dialog.fc-cart::backdrop{background:rgba(13,12,10,.55)}
.fc-cart .hd{display:flex;justify-content:space-between;align-items:center;padding:18px 20px;border-bottom:1px solid #DDD6CA;background:#fff}
.fc-cart .hd h2{margin:0;font:500 28px 'Cormorant Garamond',Georgia,serif}
.fc-cart button{font:inherit;cursor:pointer}
.fc-cart .x{min-width:44px;min-height:44px;border:1px solid #CFC6B5;border-radius:4px;background:#fff;font-size:20px}
.fc-cart ul{list-style:none;margin:0;padding:8px 20px;display:grid;gap:12px}
.fc-cart li{display:grid;grid-template-columns:64px 1fr;gap:12px;background:#fff;border:1px solid #DDD6CA;border-radius:6px;padding:10px}
.fc-cart li .im{overflow:hidden;width:64px;height:64px;border-radius:4px;background:#E7E1D6 center/cover no-repeat}
.fc-cart li h3{margin:0;font-size:15px}
.fc-cart li p{margin:2px 0 0;color:#5C5850;font-size:13px}
.fc-cart .row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px}
.fc-cart .qty{display:inline-flex;align-items:center;border:1.5px solid #BDB29C;border-radius:4px;background:#fff}
.fc-cart .qty button{min-width:40px;min-height:40px;border:0;background:transparent;font-size:18px}
.fc-cart .qty input{width:56px;min-height:40px;border:0;text-align:center;font:inherit}
.fc-cart .rm{border:0;background:none;color:#8C2B1E;text-decoration:underline;min-height:40px}
.fc-cart .ft{align-content:start;position:sticky;bottom:0;background:#fff;border-top:1px solid #DDD6CA;padding:16px 20px;display:grid;gap:10px}
.fc-cart .tot{display:flex;justify-content:space-between;align-items:baseline;font-size:15px}
.fc-cart .tot b{font:500 28px 'Cormorant Garamond',Georgia,serif}
.fc-cart .go{min-height:50px;border:0;border-radius:4px;background:#8A6A33;color:#fff;font-weight:600}
.fc-cart .go:hover{background:#6B4F22}
.fc-cart .alt{min-height:46px;border:1.5px solid #1B1A17;border-radius:4px;background:transparent;font-weight:600}
.fc-cart .empty{padding:40px 20px;text-align:center;color:#5C5850}`;
  let cartBtn = null, cartDlg = null;
  const cartAllowed = () => !document.documentElement.hasAttribute('data-fc-admin') && window.top === window && !(document.querySelector('meta[name="fc-cart"]') || {}).content && !/Store\.dc\.html$/.test(location.pathname);
  function cartCss() { if (!document.getElementById('fc-cart-css')) { const st = document.createElement('style'); st.id = 'fc-cart-css'; st.textContent = CART_CSS; document.head.appendChild(st); } }
  function paintCart() {
    if (!cartAllowed() || !document.body) return;
    const n = FC.cart.count();
    if (!cartBtn && n > 0) { cartCss(); cartBtn = document.createElement('button'); cartBtn.type = 'button'; cartBtn.className = 'fc-cartbtn'; cartBtn.onclick = () => openCart(); document.body.appendChild(cartBtn); }
    if (cartBtn) { cartBtn.hidden = n === 0; document.body.style.paddingBottom = n ? '84px' : ''; cartBtn.innerHTML = 'Cart <b>' + fmt(n) + '</b>'; cartBtn.setAttribute('aria-label', 'Open your cart, ' + n + ' item' + (n === 1 ? '' : 's')); }
    if (cartDlg && cartDlg.open) drawCart();
  }
  function drawCart() {
    const l = readCart();
    cartDlg.innerHTML = '<div style="display:flex;flex-direction:column;min-height:100%"><div class="hd"><h2 id="fc-cart-h">Your cart</h2><button type="button" class="x" data-x aria-label="Close cart">×</button></div>'
      + (l.length ? '<ul>' + l.map((x) => '<li data-id="' + esc(x.id) + '"><span class="im" style="background-image:url(\'' + esc(x.img || '') + '\')">' + (!x.img && x.draw && /^<svg[\s\S]*<\/svg>$/.test(x.draw) ? x.draw : '') + '</span><div><h3><a href="product.html?p=' + encodeURIComponent(x.slug) + '" style="color:inherit">' + esc(x.name) + '</a></h3>'
        + (x.desc ? '<p>' + esc(x.desc) + '</p>' : '') + '<p>KES ' + fmt(x.price) + (x.unit && !/^(no\.|unit|per unit)$/i.test(x.unit) ? ' ' + esc(x.unit) : ' each') + '</p>'
        + '<div class="row"><span class="qty"><button type="button" data-d="-1" aria-label="One less">−</button><input type="number" min="0" inputmode="numeric" value="' + esc(x.qty) + '" aria-label="Quantity of ' + esc(x.name) + '"><button type="button" data-d="1" aria-label="One more">+</button></span>'
        + '<b>KES ' + fmt(x.qty * x.price) + '</b></div><button type="button" class="rm" data-rm>Remove</button></div></li>').join('') + '</ul>'
        : '<div class="empty">Your cart is empty.<br><a href="atelier.html">Browse the Atelier</a></div>')
      + '<div style="flex:1"></div>' + (l.length ? '<div class="ft"><div class="tot"><span>Total before delivery</span><b>KES ' + fmt(FC.cart.total()) + '</b></div>'
        + '<button type="button" class="go" data-order>Place order</button><button type="button" class="alt" data-deliv>Ask for a delivery quote first</button>'
        + '<p style="margin:0;font-size:13px;color:#5C5850">Nothing is charged now. We confirm stock and delivery, then send an M-Pesa request or bank details.</p></div>' : '') + '</div>';
    cartDlg.querySelector('[data-x]').onclick = () => cartDlg.close();
    cartDlg.querySelectorAll('li').forEach((li) => {
      const id = li.dataset.id, inp = li.querySelector('input'), cur = () => Number(inp.value) || 0;
      li.querySelectorAll('[data-d]').forEach((b) => b.onclick = () => FC.cart.set(id, cur() + Number(b.dataset.d)));
      inp.onchange = () => FC.cart.set(id, cur());
      li.querySelector('[data-rm]').onclick = () => FC.cart.set(id, 0);
    });
    const ord = cartDlg.querySelector('[data-order]');
    if (ord) ord.onclick = () => {
      const lines = readCart(); cartDlg.close();
      FC.order(lines.map((x) => ({ slug: x.slug, sku: x.sku || null, qty: x.qty, choices: x.choices || {} })), fmt(FC.cart.total()), () => FC.cart.clear());
    };
    const dv = cartDlg.querySelector('[data-deliv]');
    if (dv) dv.onclick = () => { const lines = readCart(); cartDlg.close(); FC.lead('delivery_quote', { location: true, summary: lines.length + ' line' + (lines.length === 1 ? '' : 's') + ' in your cart · KES ' + fmt(FC.cart.total()), context: { cart: lines.map((x) => ({ slug: x.slug, name: x.name, desc: x.desc, qty: x.qty, price: x.price })) } }); };
  }
  function openCart() {
    cartCss();
    if (!cartDlg) { cartDlg = document.createElement('dialog'); cartDlg.className = 'fc-cart'; cartDlg.setAttribute('aria-labelledby', 'fc-cart-h'); cartDlg.addEventListener('click', (e) => { if (e.target === cartDlg) cartDlg.close(); }); document.body.appendChild(cartDlg); }
    drawCart(); if (cartDlg.showModal) cartDlg.showModal(); else cartDlg.setAttribute('open', '');
    const f = cartDlg.querySelector('.go') || cartDlg.querySelector('[data-x]'); if (f) f.focus();
  }
  window.addEventListener('storage', (e) => { if (e.key === CK) paintCart(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paintCart); else paintCart();

  // ---------- simple to-scale drawings, until real 3D models are uploaded ----------
  /* FC.shape({ kind:'door'|'window'|'panel'|'box', w, h, d (mm), color, glass, leaves }) -> svg string */
  FC.shape = function (o) {
    const kind = o.kind || 'box', col = o.color || '#9C8E78', W = 420, H = 300, pad = 46;
    const w = Math.max(1, Number(o.w) || (kind === 'panel' ? 1000 : 900)), h = Math.max(1, Number(o.h) || (kind === 'panel' ? 600 : kind === 'window' ? 1200 : 2100));
    const s = Math.min((W - pad * 2) / w, (H - pad * 2) / h), rw = w * s, rh = h * s, x = (W - rw) / 2 + 10, y = (H - rh) / 2 - 6;
    const mm = (v) => fmt(Math.round(v)) + ' mm', line = '#5C5850';
    let body = '';
    if (kind === 'door') {
      const f = Math.max(4, rw * 0.05), leaves = o.leaves || (w >= 1500 ? 2 : 1), lw = (rw - f * 2) / leaves;
      body = `<rect x="${x}" y="${y}" width="${rw}" height="${rh}" fill="#3B3832"/>`;
      for (let i = 0; i < leaves; i++) {
        const lx = x + f + i * lw;
        body += `<rect x="${lx + 1}" y="${y + f}" width="${lw - 2}" height="${rh - f}" fill="${esc(col)}" stroke="rgba(0,0,0,.25)"/>`;
        if (o.glass) body += `<rect x="${lx + lw * 0.18}" y="${y + f + rh * 0.08}" width="${lw * 0.64}" height="${rh * 0.62}" fill="#CFE0E8" opacity=".85" stroke="rgba(0,0,0,.2)"/>`;
        else body += `<rect x="${lx + lw * 0.16}" y="${y + f + rh * 0.08}" width="${lw * 0.68}" height="${rh * 0.36}" fill="none" stroke="rgba(0,0,0,.18)"/><rect x="${lx + lw * 0.16}" y="${y + f + rh * 0.5}" width="${lw * 0.68}" height="${rh * 0.38}" fill="none" stroke="rgba(0,0,0,.18)"/>`;
        const hx = leaves === 2 ? (i === 0 ? lx + lw - 8 : lx + 5) : lx + lw - 10;
        body += `<rect x="${hx}" y="${y + rh * 0.5}" width="3.5" height="${Math.max(10, rh * 0.07)}" rx="1.5" fill="#C9A46A"/>`;
      }
    } else if (kind === 'window') {
      const f = Math.max(4, Math.min(rw, rh) * 0.06), panes = w >= 1400 ? 3 : w >= 800 ? 2 : 1, pw = (rw - f * 2) / panes;
      body = `<rect x="${x}" y="${y}" width="${rw}" height="${rh}" fill="${esc(col)}"/>`;
      for (let i = 0; i < panes; i++) body += `<rect x="${x + f + i * pw + 1.5}" y="${y + f}" width="${pw - 3}" height="${rh - f * 2}" fill="#CFE0E8" stroke="rgba(0,0,0,.2)"/><line x1="${x + f + i * pw + pw * 0.2}" y1="${y + f + rh * 0.15}" x2="${x + f + i * pw + pw * 0.45}" y2="${y + f + rh * 0.05}" stroke="#fff" stroke-width="2" opacity=".7"/>`;
      body += `<rect x="${x - 6}" y="${y + rh}" width="${rw + 12}" height="6" fill="#8F877A"/>`;
    } else if (kind === 'panel') {
      body = `<rect x="${x}" y="${y}" width="${rw}" height="${rh}" fill="${esc(col)}" stroke="rgba(0,0,0,.2)"/>`;
      const n = Math.max(4, Math.min(40, Math.round(w / 76)));
      for (let i = 1; i < n; i++) body += `<line x1="${x + (rw * i) / n}" y1="${y}" x2="${x + (rw * i) / n}" y2="${y + rh}" stroke="rgba(0,0,0,.14)" stroke-width="2"/>`;
    } else {
      const d = Math.max(0, Number(o.d) || 0) * s, dx = Math.min(d * 0.5, 50), dy = Math.min(d * 0.35, 36);
      body = (d ? `<polygon points="${x},${y} ${x + dx},${y - dy} ${x + rw + dx},${y - dy} ${x + rw},${y}" fill="${esc(col)}" opacity=".7" stroke="rgba(0,0,0,.25)"/><polygon points="${x + rw},${y} ${x + rw + dx},${y - dy} ${x + rw + dx},${y + rh - dy} ${x + rw},${y + rh}" fill="${esc(col)}" opacity=".55" stroke="rgba(0,0,0,.25)"/>` : '')
        + `<rect x="${x}" y="${y}" width="${rw}" height="${rh}" fill="${esc(col)}" stroke="rgba(0,0,0,.3)"/>`;
    }
    const dim = `<g stroke="${line}" stroke-width="1" fill="${line}" font-family="IBM Plex Mono,monospace" font-size="12">`
      + `<line x1="${x}" y1="${y + rh + 22}" x2="${x + rw}" y2="${y + rh + 22}"/><line x1="${x}" y1="${y + rh + 16}" x2="${x}" y2="${y + rh + 28}"/><line x1="${x + rw}" y1="${y + rh + 16}" x2="${x + rw}" y2="${y + rh + 28}"/>`
      + `<text x="${x + rw / 2}" y="${y + rh + 40}" text-anchor="middle" stroke="none">${mm(w)}</text>`
      + `<line x1="${x - 22}" y1="${y}" x2="${x - 22}" y2="${y + rh}"/><line x1="${x - 28}" y1="${y}" x2="${x - 16}" y2="${y}"/><line x1="${x - 28}" y1="${y + rh}" x2="${x - 16}" y2="${y + rh}"/>`
      + `<text x="${x - 30}" y="${y + rh / 2}" text-anchor="middle" stroke="none" transform="rotate(-90 ${x - 30} ${y + rh / 2})">${mm(h)}</text>`
      + (kind === 'box' && o.d ? `<text x="${x + rw + 8}" y="${y - 8}" stroke="none">depth ${mm(o.d)}</text>` : '') + '</g>';
    return `<svg viewBox="0 0 ${W} ${H + 20}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Drawing to scale: ${mm(w)} wide by ${mm(h)} high${o.d ? ' by ' + mm(o.d) + ' deep' : ''}" style="width:100%;height:100%;display:block"><rect width="100%" height="100%" fill="#F7F4EE"/>${body}${dim}</svg>`;
  };

  // ---------- staff sign-in icon in the footer ----------
  const LOCK = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10.5" width="16" height="10" rx="2"></rect><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"></path></svg>';
  FC.staffLink = (color) => '<a href="admin.html" class="fc-staff" aria-label="Staff sign in" title="Staff sign in" style="display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border:1px solid currentColor;border-radius:50%;color:' + (color || '#A89E8E') + ';text-decoration:none;opacity:.8">' + LOCK + '</a>';
  // pages without a footer of their own get a slim one carrying the icon
  function slimFooter() {
    const m = document.querySelector('meta[name="fc-footer"]');
    if ((m && m.content !== 'auto') || window.top !== window || document.documentElement.hasAttribute('data-fc-admin') || document.getElementById('fc-foot')) return;
    const f = document.createElement('footer'); f.id = 'fc-foot';
    f.setAttribute('style', 'background:#0D0C0A;color:#A89E8E;font:13px/1.5 Manrope,system-ui,sans-serif;border-top:1px solid #1E1B17');
    f.innerHTML = '<div style="max-width:1360px;margin:0 auto;padding:18px 24px;display:flex;flex-wrap:wrap;gap:10px 24px;align-items:center;justify-content:space-between">'
      + '<span><span style="font-family:\'Cormorant Garamond\',Georgia,serif;font-size:20px;letter-spacing:.18em;color:#F2EBDF;margin-right:14px">FIRMCOP</span><span data-fc="addr"></span></span>'
      + '<span style="display:flex;gap:18px;align-items:center;flex-wrap:wrap"><a href="Main.dc.html" style="color:#D8CFC0">Home</a><a href="#" data-fc-wa style="color:#D8CFC0">WhatsApp us</a>' + FC.staffLink() + '</span></div>';
    document.body.appendChild(f);
    FC.ready.then((st) => { const a = f.querySelector('[data-fc="addr"]'); if (a) a.textContent = [st.contact_address, st.contact_phone].filter(Boolean).join(' · '); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', slimFooter); else slimFooter();

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
