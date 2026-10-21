"""Deploy-time patches that connect the canvas pages to the Firmcop2 backend (fc-site.js).
Every replacement must match exactly once, so a change in the canvas source fails the build loudly."""
import os, re

HERE = os.path.dirname(os.path.abspath(__file__))


def rep(s, old, new, page, count=1):
    n = s.count(old)
    assert n == count, f'{page}: expected {count}× {old[:70]!r}, found {n}'
    return s.replace(old, new)


def split(s):
    i = s.index('<script type="text/x-dc" data-dc-script')
    return s[:i], s[i:]


def scripts(s, page, with_core=False):
    tag = '<script src="./support.js"></script>'
    extra = '<script src="./ds-config.js"></script>\n<script src="./fc-site.js"></script>\n'
    if with_core:
        # Catalog already gets ds-config + ds-core from build_site.py
        return rep(s, '<script src="./ds-core.js"></script>\n' + tag, '<script src="./ds-core.js"></script>\n<script src="./fc-site.js"></script>\n' + tag, page)
    return rep(s, tag, extra + tag, page)


LOCK = ('<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '
        'stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10.5" width="16" height="10" rx="2"></rect><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"></path></svg>')
STAFF = ('<a href="admin.html" class="fc-staff" aria-label="Staff sign in" title="Staff sign in" style="display:inline-flex;align-items:center;justify-content:center;'
         'width:40px;height:40px;border:1px solid currentColor;border-radius:50%;color:#A89E8E;text-decoration:none;opacity:.8;vertical-align:middle">' + LOCK + '</a>')


def staff_links(s):
    """Staff entry lives only in the footer, as a lock icon; public menus lose 'Team portal'. Collection links go to the new Collection page."""
    s = s.replace('href="Team.dc.html"', 'href="admin.html"')
    s = s.replace('href="Catalog.dc.html"', 'href="collection.html"')
    s = s.replace('href="Store.dc.html"', 'href="atelier.html"')
    # Configure is now part of the 3D Studio: the menu item goes, every other link opens the Studio
    s = s.replace('<a href="Configurator.dc.html">Configure</a>\n', '').replace('<a href="Configurator.dc.html">Configure</a>', '')
    s = s.replace('<a href="Configurator.dc.html" aria-current="page" style="color:#C9A46A;box-shadow:inset 0 -1px 0 #C9A46A">Configure</a>\n', '')
    s = s.replace('>Configurator</a>', '>3D Studio</a>').replace('>Configure this design</a>', '>Design it in 3D</a>').replace('>Configure a unit</a>', '>Design a unit in 3D</a>').replace('>Begin configuring</a>', '>Open the 3D Studio</a>')
    s = s.replace('href="Configurator.dc.html"', 'href="3d-studio.html"')
    s = s.replace('<a href="admin.html">Team portal</a>\n</nav>', '</nav>')          # header menus
    s = s.replace(' · <a href="admin.html">Team portal</a>', ' · ' + STAFF)             # Catalog, DesignDetail footers
    s = s.replace('<a href="admin.html" style="color:#D8CFC0;text-decoration:none;padding:4px 0">Team portal</a>', '')  # Main resources column
    s = s.replace('<span>© [Year] Firmcop Modular</span>', '<span style="display:inline-flex;gap:14px;align-items:center">© [Year] Firmcop Modular ' + STAFF + '</span>')  # Main bottom bar
    has_footer = 'fc-staff' in s
    return s.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name="fc-footer" content="' + ('own' if has_footer else 'auto') + '">', 1)


def array_list(js, page, key, dst='all'):
    """const all = [ ... ];  ->  const <dst> = FC.list(this, key, [ ... ]);"""
    head = '    const all = [\n'
    assert js.count(head) == 1, f'{page}: static list not found'
    start = js.index(head)
    end = js.index('\n    ];\n', start)
    return js[:start] + f'    const {dst} = FC.list(this, \'{key}\', [\n' + js[start + len(head):end] + '\n    ]);\n' + js[end + len('\n    ];\n'):]


def projects(s):
    p = 'Projects'
    html, js = split(s)
    html = rep(html, '{{p.area}} m² · {{p.weeks}} weeks · {{p.client}}', '{{p.meta}}', p)
    html = rep(html, '<dd style="margin:0">{{sel.area}} m²</dd>', '<dd style="margin:0">{{sel.areaText}}</dd>', p)
    html = rep(html, '<dd style="margin:0">{{sel.weeks}} weeks, yard to handover</dd>', '<dd style="margin:0">{{sel.weeksText}}</dd>', p)
    html = rep(html, '<blockquote style="margin:0;padding:14px 16px;background:#F4F1EB;border-radius:4px;font-size:15px;line-height:1.5;font-style:italic;color:#3D3A34">[Client quote about the build]</blockquote>',
               '<sc-if value="{{sel.hasQuote}}" hint-placeholder-val="{{false}}"><blockquote style="margin:0;padding:14px 16px;background:#F4F1EB;border-radius:4px;font-size:15px;line-height:1.5;font-style:italic;color:#3D3A34">{{sel.quote}}</blockquote></sc-if>', p)
    html = rep(html, '<p style="margin:0;font-size:15px;line-height:1.55;color:#3D3A34">{{sel.story}}</p>',
               '<p style="margin:0;font-size:15px;line-height:1.55;color:#3D3A34">{{sel.story}}</p>\n<sc-if value="{{sel.hasPage}}" hint-placeholder-val="{{false}}"><p style="margin:10px 0 0"><a href="{{sel.href}}" style="font-weight:600">See the full project, photos and specs →</a></p></sc-if>', p)
    js = array_list(js, p, 'works', 'all0')
    js = rep(js, "    const labels = ['All', 'Container', 'A-frame', 'Cabin', 'Steel'];",
             "    const all = all0.map((p) => Object.assign({}, p, { meta: [p.area ? p.area + ' m²' : '', p.weeks ? p.weeks + ' weeks' : '', p.client].filter(Boolean).join(' · '), areaText: p.area ? p.area + ' m²' : 'On request', weeksText: p.weeks ? p.weeks + ' weeks, yard to handover' : 'On request', hasQuote: !!p.quote, quote: p.quote || '', hasPage: !!p.slug, href: p.slug ? 'work.html?w=' + encodeURIComponent(p.slug) : '' }));\n"
             "    const labels = ['All', 'Container', 'A-frame', 'Cabin', 'Steel'];", p)
    js = rep(js, 'const imgFor = (p) => IMG[p.name]', 'const imgFor = (p) => (p && p.img) || IMG[p.name]', p)
    js = rep(js, '    const s0 = all[this.state.sel];', '    const s0 = all[this.state.sel] || all[0];', p)
    return scripts(staff_links(html), p) + js


def store(s):
    p = 'Store'
    html, js = split(s)
    js = rep(js, "this.state = { cat: 'All', cart: { 'CLD-FCB9': 24, 'WIN-ALU12': 2 }, toast: '' };", "this.state = { cat: 'All', cart: {}, toast: '' };", p)
    js = array_list(js, p, 'store')
    js = rep(js, "    const labels = ['All', 'Doors', 'Windows', 'Cladding', 'Insulation', 'Flooring', 'Roofing'];",
             "    const labels = ['All'].concat(all.map((p) => p.cat).filter((c, i, a) => a.indexOf(c) === i));", p)
    js = rep(js, "      else st = { t: fmt(p.stock) + ' ' + p.unit + ' in stock', s: pill + 'background:#E3F1E6;color:#1F5A2E' };",
             "      else if (p.stock >= 9999) st = { t: 'Made to order', s: pill + 'background:#ECE8E0;color:#4A463F' };\n      else st = { t: fmt(p.stock) + ' ' + p.unit + ' in stock', s: pill + 'background:#E3F1E6;color:#1F5A2E' };", p)
    js = rep(js, "    const lines = Object.keys(cart).filter((k) => cart[k] > 0).map((k) => {",
             "    const lines = Object.keys(cart).filter((k) => cart[k] > 0 && all.some((x) => x.sku === k)).map((k) => {", p)
    js = rep(js, "swatch: 'position:relative;height:120px;background-color:' + p.bg + ';' + tex[p.tex],",
             "swatch: 'position:relative;height:120px;background-color:' + p.bg + ';' + (p.img ? 'background-image:url(' + p.img + ');background-size:cover;background-position:center;' : (tex[p.tex] || '')),", p)
    js = rep(js, "      checkout: () => this.setState({ toast: lines.length ? 'Order sent. Stock reserved and the yard has been notified (prototype).' : 'Add something to your cart first.' }),",
             "      checkout: () => { if (!lines.length) { this.setState({ toast: 'Add something to your cart first.' }); return; } FC.order(Object.keys(cart).filter((k) => cart[k] > 0 && all.some((x) => x.sku === k)).map((k) => ({ sku: k, qty: cart[k] })), fmt(total)).then((r) => { if (r) this.setState({ cart: {}, toast: 'Order ' + r.code + ' received. We will confirm stock and delivery, then send the payment request.' }); }); },", p)
    js = rep(js, "      delivery: () => this.setState({ toast: 'Delivery quote requested. We will message you with options (prototype).' }),",
             "      delivery: () => FC.lead('delivery_quote', { context: { cart: cart }, summary: lines.length ? lines.length + ' line' + (lines.length === 1 ? '' : 's') + ' in your cart · KES ' + fmt(total) : '' }),", p)
    return scripts(staff_links(html), p) + js


def opportunities(s):
    p = 'Opportunities'
    html, js = split(s)
    js = array_list(js, p, 'opps')
    js = rep(js, "})[o.name],\n", "})[o.name] || o.img,\n", p)
    js = rep(js, "    const sel = all[s.sel];", "    const sel = all[s.sel] || all[0];", p)
    js = rep(js, "    const sectorLabels = ['All', 'Hospitality', 'Retail', 'Residential'];", "    const sectorLabels = ['All'].concat(all.map((o) => o.sector).filter((c, i, a) => a.indexOf(c) === i));", p)
    js = rep(js, "      reserve: () => this.setState({ toast: soldOut ? 'You are on the waitlist. We will tell you if a unit is released or a similar project opens (prototype).' : 'Reservation started. An investment advisor will call to walk you through the documents before any payment (prototype).' }),",
             "      reserve: () => FC.lead(soldOut ? 'waitlist' : 'reservation', { eyebrow: sel.name, context: { opportunity: sel.name, slug: sel.slug || '', units: soldOut ? 0 : s.qty, amount: sel.price * s.qty }, summary: soldOut ? 'Fully reserved. Join the waitlist for ' + sel.name + '.' : s.qty + ' unit' + (s.qty > 1 ? 's' : '') + ' · KES ' + fmt(sel.price * s.qty) + ' · 20% deposit KES ' + fmt(sel.price * s.qty * 0.2), onDone: (r) => this.setState({ toast: (soldOut ? 'You are on the waitlist. ' : 'Reservation started. ') + 'Reference ' + r.code + '.' }) }),", p)
    js = rep(js, "      pack: () => this.setState({ toast: 'Information pack downloaded: site plan, projections, legal structure and operator agreement (prototype).' }),",
             "      pack: () => { if (sel.pack) window.open(sel.pack, '_blank', 'noopener'); else FC.lead('info_pack', { eyebrow: sel.name, context: { opportunity: sel.name, slug: sel.slug || '' } }); },", p)
    return scripts(staff_links(html), p) + js


def design_detail(s):
    p = 'DesignDetail'
    html, js = split(s)
    js = rep(js, "      bookVisit: () => this.setState({ toast: 'Choose a time at our yard: [Booking calendar] (prototype).' }),",
             "      bookVisit: () => FC.lead('visit', { context: { design: 'One-Bed Forty' }, intro: 'Walk through a One-Bed Forty at our yard. Tell us when suits you and we will confirm by phone or WhatsApp.' }),", p)
    js = rep(js, "      whatsapp: () => this.setState({ toast: 'Opens WhatsApp with this design in the message (prototype).' }),",
             "      whatsapp: () => FC.wa('Hello Firmcop, I am interested in the One-Bed Forty.'),", p)
    js = rep(js, "      bookSurvey: () => this.setState({ toast: 'Survey requested. A surveyor will call to arrange a visit (prototype).' }),",
             "      bookSurvey: () => FC.lead('survey', { context: { design: 'One-Bed Forty', site_ready: labels.filter((l, i) => s.checks[i]) }, summary: ready + ' of 6 site checks ticked' }),", p)
    return scripts(staff_links(html), p) + js


def invest(s):
    p = 'Invest'
    html, js = split(s)
    js = rep(js, "      feasibility: () => this.setState({ toast: 'Feasibility request sent with this layout and these assumptions. Our team will confirm county rules and costs (prototype).' }),",
             "      feasibility: () => FC.lead('feasibility', { context: { planner: JSON.parse(JSON.stringify(this.state)) }, onDone: (r) => this.setState({ toast: 'Feasibility request ' + r.code + ' sent with this layout and these assumptions.' }) }),", p)
    return scripts(staff_links(html), p) + js


def configurator(s):
    p = 'Configurator'
    html, js = split(s)
    html = rep(html, '<a href="Team.dc.html" style="display:inline-flex;align-items:center;min-height:48px;padding:0 18px;background:#F4F1EB;color:#1B1A17;text-decoration:none;font-weight:600;border-radius:4px">See it in the team portal</a>',
               '<a href="#" data-fc-wa style="display:inline-flex;align-items:center;min-height:48px;padding:0 18px;background:#F4F1EB;color:#1B1A17;text-decoration:none;font-weight:600;border-radius:4px">WhatsApp us about it</a>', p)
    js = rep(js, "{ team: 'Payments', text: 'M-Pesa prompt sent for KES ' + fmt(deposit) + '. Production slot held for 48 hours.' },",
             "{ team: 'Payments', text: 'We call to confirm, then send the M-Pesa request for KES ' + fmt(deposit) + '. Your production slot is held for 48 hours.' },", p)
    js = rep(js, "{ team: 'Sales', text: 'Order SO-0142 created in the CRM with this configuration and BOQ attached.' },",
             "{ team: 'Sales', text: 'Quote ' + (s.qcode || '') + ' saved with this configuration and BOQ.' },", p)
    js = rep(js, "' stocked lines reserved, '", "' stocked lines to reserve and '", p)
    js = rep(js, "(back.length === 1 ? '' : 's') + ' raised.' },", "(back.length === 1 ? '' : 's') + ' to raise once the deposit is in.' },", p)
    js = rep(js, "{ team: 'Marketing', text: 'Tagged as a customer for handover photos and a review request.' }",
             "{ team: 'You', text: 'Keep reference ' + (s.qcode || '') + '. WhatsApp us any time with it.' }", p)
    js = rep(js, "{ team: 'Sales', text: 'Lead L-2291 created in the CRM with quote Q-0142 attached. An advisor calls within one working day.' },",
             "{ team: 'Sales', text: 'Quote ' + (s.qcode || '') + ' saved. An advisor calls within one working day.' },", p)
    js = rep(js, "{ team: 'Engineering', text: 'Review ticket ENG-0318 opened' +", "{ team: 'Engineering', text: 'Engineer review requested' +", p)
    js = rep(js, "{ team: 'Marketing', text: 'Added to the quote follow-up journey by email and WhatsApp.' }",
             "{ team: 'You', text: 'We follow up by email and WhatsApp.' }", p)
    q = ("FC.quote({ source: 'configurator', title: b.name + ' · ' + mod + ' ' + b.unit + (mod > 1 ? 's' : ''), intent: INTENT, "
         "lines: lines.map((l) => ({ label: l.name, detail: l.trade + ' · ' + l.sku, qty: l.qty, unit: l.unit, rate: l.rate, amount: l.amount })), "
         "subtotal: sub, vat: vat, total: total, phone: (document.getElementById('mpesa') || {}).value || '' })")
    js = rep(js, "      payDeposit: () => this.setState({ done: 'deposit', toast: '' }),",
             "      payDeposit: () => " + q.replace('INTENT', "'deposit'") + ".then((r) => { if (r) this.setState({ done: 'deposit', qcode: r.code, toast: '' }); }),", p)
    js = rep(js, "      requestReview: () => this.setState({ done: 'review', toast: '' }),",
             "      requestReview: () => " + q.replace('INTENT', "'review'") + ".then((r) => { if (r) this.setState({ done: 'review', qcode: r.code, toast: '' }); }),", p)
    js = rep(js, "      downloadQuote: () => this.setState({ toast: 'Quote PDF for Q-0142 generated with plans, finishes and payment terms (prototype).' }),",
             "      downloadQuote: () => window.print(),", p)
    js = rep(js, "      save: () => this.setState({ toast: 'Saved to your account. Sales can see this configuration.' }),",
             "      save: () => " + q.replace('INTENT', "'save'") + ".then((r) => { if (r) this.setState({ qcode: r.code, toast: 'Saved as quote ' + r.code + '. Sales can see this configuration.' }); }),", p)
    js = rep(js, "      share: () => this.setState({ toast: 'Share link copied (prototype).' }),",
             "      share: () => { const u = location.href.split('#')[0]; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => this.setState({ toast: 'Link to the configurator copied.' }), () => this.setState({ toast: u })); },", p)
    return scripts(staff_links(html), p) + js


def portal(s):
    p = 'Portal'
    html, js = split(s)
    html = rep(html, '<span style="font-size:14px;color:#D9D3C7">Signed in as [Customer A]</span>',
               '<span style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><span style="font-size:14px;color:#D9D3C7">{{signedAs}}</span><button type="button" onClick="{{authAction}}" style="min-height:40px;padding:0 14px;background:transparent;color:#F4F1EB;border:1px solid #8C8475;border-radius:4px;font:inherit;font-size:14px;cursor:pointer">{{authLabel}}</button></span>', p)
    html = rep(html, '>My builds · Order SO-0142 · Sample data</p>', '>{{orderLine}}</p>', p)
    html = rep(html, '>Your One-Bed Forty<br>', '>{{heroTitle}}<br>', p)
    html = rep(html, '>Container 40 ft · Fibre cement in charcoal · PIR 100 mm · SPC vinyl · Front deck · Delivering to [Town]</p>', '>{{specLine}}</p>', p)
    html = rep(html, 'line-height:1.1">Week of 16 Nov</div>', 'line-height:1.1">{{deliveryText}}</div>', p)
    signin = ('<sc-if value="{{showSignIn}}" hint-placeholder-val="{{false}}">\n'
              '<section class="card" aria-labelledby="signin-t" style="border:1.5px solid #8A6A33">\n'
              '<h2 id="signin-t" class="h" style="margin-bottom:8px">{{signInTitle}}</h2>\n'
              '<p style="margin:0 0 14px;font-size:15px;line-height:1.5;color:#3D3A34">{{signInText}}</p>\n'
              '<sc-if value="{{notSignedIn}}" hint-placeholder-val="{{true}}"><div style="display:flex;flex-wrap:wrap;gap:8px">'
              '<button type="button" class="btn" onClick="{{openMagic}}">Email me a sign-in link</button>'
              '<button type="button" class="btn-line" onClick="{{openPassword}}">Sign in with a password</button></div></sc-if>\n'
              '</section>\n</sc-if>\n\n')
    html = rep(html, '<div style="display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start">', signin + '<div style="display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start">', p)
    a = html.index('<article style="display:flex;flex-wrap:wrap;gap:16px">')
    z = html.rindex('</article>') + len('</article>')
    upd = ('<sc-for list="{{updates}}" as="u" hint-placeholder-count="3">\n'
           '<article style="display:flex;flex-wrap:wrap;gap:16px">\n'
           '<img src="{{u.img}}" alt="{{u.alt}}" style="flex:0 0 200px;width:200px;aspect-ratio:4/3;object-fit:cover;display:block">\n'
           '<div style="flex:1 1 240px;min-width:0"><time style="font-family:\'IBM Plex Mono\',monospace;font-size:13px;color:#5C5850">{{u.when}}</time><h3 style="margin:4px 0 6px;font-size:17px">{{u.title}}</h3><p style="margin:0;font-size:15px;line-height:1.5;color:#3D3A34">{{u.body}}</p></div>\n'
           '</article>\n</sc-for>\n'
           '<sc-if value="{{noUpdates}}" hint-placeholder-val="{{false}}"><p style="margin:0;color:#5C5850">Photos and notes from the yard appear here as your build progresses.</p></sc-if>')
    html = html[:a] + upd + html[z:]
    va = html.index('<section aria-labelledby="approve"')
    vz = html.index('</section>', va) + len('</section>')
    html = html[:va] + '<sc-if value="{{hasVar}}" hint-placeholder-val="{{true}}">\n' + html[va:vz] + '\n</sc-if>' + html[vz:]
    html = rep(html, '>Burglar bars on 4 windows, powder-coated to match the trims.</p>', '>{{varText}}</p>', p)
    html = rep(html, '>+ KES 32,000 · no change to delivery date</p>', '>{{varAmt}}</p>', p)
    html = rep(html, '>Complete these before the week of 16 Nov. {{siteDone}} of 5 done.</p>', '>{{siteLine}}</p>', p)
    html = rep(html, '<strong>[Project manager]</strong>', '<strong>{{pmName}}</strong>', p)
    head = js[:js.index('class Component extends DCLogic {')]
    tail = js[js.index('</script>'):]
    logic = open(os.path.join(HERE, 'f3d', 'portal-logic.js')).read()
    return scripts(staff_links(html), p) + head + logic + tail


def simple(name):
    def f(s):
        html, js = split(s)
        return scripts(staff_links(html), name) + js
    return f


PATCH = {
    'Main': simple('Main'), 'Projects': projects, 'Store': store, 'Opportunities': opportunities, 'DesignDetail': design_detail,
    'Invest': invest, 'Configurator': configurator, 'Portal': portal, 'Team': simple('Team')
}


def patch_page(name, s):
    if name == 'Catalog':
        return scripts(staff_links(s), name, with_core=True)
    return PATCH[name](s)


def patch_studio(d):
    """design-studio.html: load fc-site.js and add 'Request this quote' to the proposal."""
    d = rep(d, '<script src="ds-core.js"></script>', '<script src="ds-core.js"></script>\n<script src="fc-site.js"></script>', 'design-studio')
    d = rep(d, "<span class=\"eb\">Proposal preview${CLIENT ? ' · client view' : ' · sales view with full BOQ'}</span><button type=\"button\" class=\"tb\" data-a=\"closeModal\">Close</button></div>",
            "<span class=\"eb\">Proposal preview${CLIENT ? ' · client view' : ' · sales view with full BOQ'}</span><span style=\"display:flex;gap:8px\"><button type=\"button\" class=\"tb\" data-a=\"sendQuote\" style=\"background:#C9A46A;color:#0D0C0A;border-color:#C9A46A\">Request this quote</button><button type=\"button\" class=\"tb\" data-a=\"closeModal\">Close</button></span></div>", 'design-studio')
    d = rep(d, "    case 'proposal': return openProposal();", "    case 'proposal': return openProposal();\n    case 'sendQuote': return sendQuote();", 'design-studio')
    d = rep(d, "// ---------------- author: save to the catalogue ----------------",
            "function sendQuote() {\n"
            "  if (!window.FC) return;\n"
            "  FC.quote({ source: 'studio', intent: 'proposal', title: P.name + ' · ' + PRE().name, design_slug: (P.design && P.design.slug) || null,\n"
            "    lines: Q.lines.map(l => ({ label: l.name, detail: l.grp, qty: l.qty, unit: l.unit, rate: l.qty ? Math.round(l.total / l.qty) : null, amount: Math.round(l.total) })),\n"
            "    subtotal: Math.round(Q.sub), vat: Math.round(Q.vat), total: Math.round(Q.total) });\n"
            "}\n\n// ---------------- author: save to the catalogue ----------------", 'design-studio')
    return d
