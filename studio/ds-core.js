/* Firmcop Design Studio — core model: presets, catalogues, starters, rooms, lining, BOQ and checks.
   Pure logic, no DOM. window.DS. All prices KES (sample price book). Coordinates in metres:
   x along the length (0..L, west→east), z across (0..W, north→south), y up from the floor. */
(function (root) {
  'use strict';
  const C = 0.1; // raster cell (m)

  const PRESETS = {
    c20: { sys: 'container', name: '20′ container', sub: 'Studio', L: 6.06, W: 2.44, H: 2.59, t: 0.1, ih: 2.3, yF: 0.35, shell: 780000, deliver: 95000, weeks: 7 },
    c40: { sys: 'container', name: '40′ container', sub: 'One bed', L: 12.19, W: 2.44, H: 2.59, t: 0.1, ih: 2.3, yF: 0.35, shell: 1240000, deliver: 140000, weeks: 9 },
    tw40: { sys: 'container', name: 'Twin 40′', sub: 'Two bed', L: 12.19, W: 4.88, H: 2.59, t: 0.1, ih: 2.3, yF: 0.35, shell: 2450000, deliver: 260000, weeks: 11, twin: true },
    af8: { sys: 'aframe', name: 'A-frame 8 × 6', sub: 'Retreat', L: 8, W: 6, ridge: 6.2, t: 0.2, ih: 2.4, yF: 0.45, shell: 2100000, deliver: 180000, weeks: 10 },
    af12: { sys: 'aframe', name: 'A-frame 12 × 6', sub: 'One bed', L: 12, W: 6, ridge: 6.2, t: 0.2, ih: 2.4, yF: 0.45, shell: 2950000, deliver: 220000, weeks: 12 },
    cb9: { sys: 'cabin', name: 'Cabin 9 × 6', sub: 'Two bed', L: 9, W: 6, H: 2.7, t: 0.2, ih: 2.6, yF: 0.45, shell: 1900000, deliver: 150000, weeks: 9, veranda: 2.0 },
    cb12: { sys: 'cabin', name: 'Cabin 12 × 6', sub: 'Three bed', L: 12, W: 6, H: 2.7, t: 0.2, ih: 2.6, yF: 0.45, shell: 2500000, deliver: 190000, weeks: 11, veranda: 2.0 },
  };
  const SYS = {
    container: { name: 'Container', sides: ['N', 'S', 'W', 'E'], colours: [['#2f4a45', 'Forest'], ['#d9d4c7', 'Bone'], ['#3b3d40', 'Graphite'], ['#8a3b2c', 'Oxide']] },
    aframe: { name: 'A-frame', sides: ['W', 'E'], colours: [['#2b2b2b', 'Charcoal'], ['#5b3a29', 'Bronze'], ['#3e4a3d', 'Moss']] },
    cabin: { name: 'Cabin', sides: ['N', 'S', 'W', 'E'], colours: [['#7a5232', 'Cypress'], ['#3a3330', 'Ebony'], ['#a88a63', 'Natural']] },
  };
  const SIDE_NAME = { N: 'North wall', S: 'South wall', W: 'West end', E: 'East end' };

  const OPEN = {
    dSteel: { name: 'Steel security door', w: 0.9, h: 2.05, sill: 0, door: true, price: 38000, stock: 12 },
    dMahog: { name: 'Mahogany door', w: 0.9, h: 2.05, sill: 0, door: true, price: 52000, stock: 6 },
    dGlass: { name: 'Glazed French door', w: 1.4, h: 2.1, sill: 0, door: true, glass: true, price: 85000, stock: 4 },
    slider: { name: 'Sliding door 2.4 m', w: 2.4, h: 2.1, sill: 0, door: true, glass: true, price: 145000, stock: 3, not: ['aframe'] },
    wAlu: { name: 'Aluminium window 1.2 m', w: 1.2, h: 1.2, sill: 0.9, glass: true, price: 32000, stock: 22 },
    wWide: { name: 'Aluminium sliding window 1.8 m', w: 1.8, h: 1.2, sill: 0.9, glass: true, price: 38000, stock: 8 },
    wSmall: { name: 'Bathroom window 0.6 m', w: 0.6, h: 0.6, sill: 1.5, glass: true, price: 14000, stock: 30 },
    w900: { name: 'Top-hung window 0.9 m', w: 0.9, h: 1.2, sill: 0.9, glass: true, price: 21000, stock: 20 },
    gable: { name: 'Full glass gable', w: 1.4, h: 2.1, sill: 0, door: true, glass: true, gable: true, price: 260000, stock: 2, only: ['aframe'] },
  };

  const FIN = {
    floor: {
      spc: { name: 'SPC vinyl, oak look', price: 2800, stock: 180, col: '#b48a5c', pat: 'plank' },
      oak: { name: 'Engineered oak', price: 6800, stock: 60, col: '#9a6b3f', pat: 'plank' },
      tile: { name: 'Porcelain tile 600', price: 1950, stock: 240, col: '#d6d0c4', pat: 'tile', wet: true },
      slate: { name: 'Slate-look tile', price: 3400, stock: 25, col: '#5a5e61', pat: 'tile', wet: true },
      screed: { name: 'Polished screed', price: 3200, stock: 999, col: '#a7a29a', pat: 'none', wet: true },
    },
    wall: {
      gyp: { name: 'Gypsum, painted', price: 1300, stock: 400, col: '#ece7de' },
      pine: { name: 'Pine tongue and groove', price: 2600, stock: 120, col: '#d9b37c', pat: 'vplank' },
      cypress: { name: 'Cypress feature wall', price: 3800, stock: 30, col: '#a8754a', pat: 'vplank' },
      mrtile: { name: 'MR board and wall tile', price: 4200, stock: 90, col: '#e3e5e2', pat: 'tile', wet: true },
      fcement: { name: 'Fibre cement, sealed', price: 1900, stock: 150, col: '#9b9d9a' },
    },
    ceil: {
      gyp: { name: 'Gypsum ceiling', price: 1300, stock: 400, col: '#f1ede6' },
      pine: { name: 'Pine T&G ceiling', price: 2600, stock: 120, col: '#d9b37c', pat: 'vplank' },
    },
  };

  const KU = {
    base: { name: 'Base, doors', w: 0.6, price: 24000 },
    drawer: { name: 'Base, drawers', w: 0.6, price: 31000 },
    sink: { name: 'Sink unit + tap', w: 0.8, price: 52000, wet: true },
    hob: { name: 'Hob unit + 4-zone hob', w: 0.6, price: 58000 },
    dw: { name: 'Dishwasher space', w: 0.6, price: 6000 },
    filler: { name: 'Narrow base 300', w: 0.3, price: 12000 },
    fridge: { name: 'Tall, fridge housing', w: 0.6, price: 48000, tall: true },
    oven: { name: 'Tall, oven and pantry', w: 0.6, price: 56000, tall: true },
  };
  const WU = {
    hang: { name: 'Hanging 500', w: 0.5, price: 22000, tall: true },
    shelf: { name: 'Shelves 500', w: 0.5, price: 19000, tall: true },
    drawers: { name: 'Drawers 500', w: 0.5, price: 27000, tall: true },
    double: { name: 'Double hanging 1000', w: 1.0, price: 38000, tall: true },
  };
  const FRONTS = { white: { name: 'Matt white', mult: 1, col: '#ece9e2' }, oak: { name: 'Oak veneer', mult: 1.35, col: '#b98b5e' }, sage: { name: 'Sage lacquer', mult: 1.25, col: '#8c9a84' }, graph: { name: 'Graphite', mult: 1.15, col: '#3b3d40' } };
  const TOPS = { lam: { name: 'Laminate', perM: 7500, col: '#d9d4ca' }, quartz: { name: 'Quartz', perM: 28000, col: '#f2f1ed' }, granite: { name: 'Black granite', perM: 22000, col: '#26272a' }, timber: { name: 'Solid mvule', perM: 15000, col: '#8a5a35' } };
  const WALLCAB_PER_M = 26700;

  const ITEMS = {
    bedD: { name: 'Double bed 1.6 m', w: 1.6, d: 2.05, h: 0.55, cat: 'Bedroom', price: 68000, stock: 9, tag: 'bed' },
    bedS: { name: 'Single bed 0.9 m', w: 0.95, d: 2.0, h: 0.5, cat: 'Bedroom', price: 36000, stock: 14, tag: 'bed' },
    night: { name: 'Bedside table', w: 0.45, d: 0.4, h: 0.5, cat: 'Bedroom', price: 9500, stock: 30 },
    sofa: { name: 'Sofa, 3 seat', w: 2.1, d: 0.9, h: 0.8, cat: 'Living', price: 95000, stock: 5, tag: 'living' },
    arm: { name: 'Armchair', w: 0.8, d: 0.8, h: 0.8, cat: 'Living', price: 38000, stock: 8 },
    coffee: { name: 'Coffee table', w: 1.1, d: 0.55, h: 0.4, cat: 'Living', price: 18000, stock: 10 },
    tv: { name: 'TV console', w: 1.6, d: 0.4, h: 0.5, cat: 'Living', price: 26000, stock: 6 },
    rug: { name: 'Rug 2.0 × 1.4', w: 2, d: 1.4, h: 0.01, cat: 'Living', price: 14000, stock: 12, flat: true },
    plant: { name: 'Planter', w: 0.45, d: 0.45, h: 1.2, cat: 'Living', price: 6500, stock: 40 },
    dining: { name: 'Dining table + 4', w: 1.4, d: 0.8, h: 0.75, cat: 'Dining', price: 58000, stock: 6, tag: 'dining' },
    desk: { name: 'Desk and chair', w: 1.2, d: 0.6, h: 0.75, cat: 'Work', price: 32000, stock: 7, tag: 'study' },
    wc: { name: 'WC and handwash set', w: 0.4, d: 0.7, h: 0.8, cat: 'Bathroom', sanitary: true, wet: true, price: 25000, stock: 14, tag: 'bath' },
    basin: { name: 'Vanity basin', w: 0.6, d: 0.45, h: 0.85, cat: 'Bathroom', sanitary: true, wet: true, price: 21000, stock: 9, tag: 'bath' },
    shower: { name: 'Shower 900', w: 0.9, d: 0.9, h: 2.0, cat: 'Bathroom', sanitary: true, wet: true, tallItem: true, price: 46000, stock: 4, tag: 'bath' },
  };

  // exterior: cladding (per m², colours [hex, name, add per m²]), lights (each), porches (per m²), shades (per m of opening), extensions
  const CLAD = {
    crg: { name: 'Corrugated steel profile, painted', price: 1450, col: '#B5462A', pat: 'ribs', colours: [['#B5462A', 'Oxide red', 0], ['#3B3D40', 'Charcoal', 0], ['#2F5741', 'Forest green', 0], ['#E6E2D8', 'Off-white', 0]], systems: ['container', 'cabin'] },
    fcb9: { name: 'Fibre cement board 9 mm', price: 2300, col: '#8F8A80', pat: 'panels', colours: [['#8F8A80', 'Primed, paint on site', 0], ['#3B3D40', 'Factory painted charcoal', 350], ['#C9B79C', 'Factory painted sand', 350]], systems: ['container', 'cabin'] },
    tmb: { name: 'Cypress shiplap, treated', price: 2900, col: '#A9744A', pat: 'boards', colours: [['#A9744A', 'Natural', 0], ['#5C3B24', 'Dark stain', 300], ['#1F1B18', 'Charred (shou sugi ban)', 900]], systems: ['container', 'cabin'] },
    wpc: { name: 'Composite WPC cladding', price: 3600, col: '#6B5644', pat: 'boards', colours: [['#6B5644', 'Walnut', 0], ['#9A6E45', 'Teak', 0], ['#7D7A74', 'Stone grey', 0]], systems: ['container', 'cabin'] },
  };
  const LIGHT = {
    updown: { name: 'Up-and-down wall light', price: 6500, stock: 40, col: '#2b2b2b', w: 0.1, h: 0.25 },
    bulkhead: { name: 'Bulkhead light, outdoor rated', price: 3800, stock: 60, col: '#e9e4da', w: 0.25, h: 0.12 },
    sensor: { name: 'Sensor floodlight', price: 7800, stock: 25, col: '#3b3d40', w: 0.2, h: 0.15 },
  };
  const PORCH = {
    deck: { name: 'Timber deck, treated cypress', price: 6500, col: '#9a6b3f' },
    patio: { name: 'Concrete patio, broom finish', price: 3200, col: '#a7a29a', ground: true },
    pergola: { name: 'Steel pergola with timber slats, on deck', price: 9500, col: '#9a6b3f', roof: 'slats', posts: true, frame: '#2b2b2b' },
    canopy: { name: 'Polycarbonate canopy on steel posts, on deck', price: 8200, col: '#9a6b3f', roof: 'solid', posts: true, frame: '#3b3d40', glass: '#cfe0e8' },
  };
  const SHADE = {
    awning: { name: 'Fabric awning', price: 9000, col: '#8a6a33', style: 'awning' },
    hood: { name: 'Steel window hood', price: 6500, col: '#2b2b2b', style: 'hood' },
    louvre: { name: 'Aluminium louvre shade', price: 12500, col: '#9da3a6', style: 'louvre' },
    shutter: { name: 'Timber shutters, pair', price: 14000, col: '#5c3b24', style: 'shutter' },
  };
  const EXT = {
    cut: { name: 'Side wall cut-out with welded steel frame', price: 26000 },
    bump: { name: 'Side bump-out: floor, walls, insulated roof', price: 42000, minDepth: 0.6, maxDepth: 2.4 },
    doorEnclosed: { name: 'Door-end extension, enclosed (cargo doors as side walls, glazed front)', price: 165000, depth: 1.2 },
    doorDeck: { name: 'Door-end extension, covered deck (cargo doors open)', price: 78000, depth: 1.2 },
  };
  // the furniture library: category tree and items from the catalogue (filled from the package)
  const LIB = { cats: [], items: {} };
  const CAT_TAG = { beds: 'bed', sofas: 'living', 'dining-tables': 'dining', desks: 'study', 'bath-sanitary': 'bath', 'bath-showers': 'bath' };
  let PART_PER_M = 9500, PART_DOOR = 18500;
  const DOOR_W = 0.8, DOOR_H = 2.05, WIDE_FRAME = 38000, DESIGN_FEE = 45000, VAT = 0.16;
  const SERVICES = {
    electrical: { name: 'Electrical first and second fix', price: 37800, per_m2: 30 },
    plumbing: { name: 'Plumbing, supply and drainage', price: 75000, when: 'wet' },
  };
  let DESIGNS = [], SOURCE = { kind: 'builtin', label: 'Built-in sample catalogue' };

  const clone = o => JSON.parse(JSON.stringify(o));
  const PR = P => PRESETS[P.preset];
  const hr = (P, z) => { const p = PR(P); if (p.sys !== 'aframe') return p.ih; return p.ridge * (1 - Math.abs(z - p.W / 2) / (p.W / 2)) - p.yF; };
  const sideLen = (P, s) => { const p = PR(P); return s === 'N' || s === 'S' ? p.L : p.W; };

  // ---------- exterior and extensions ----------
  /* P.ext = { widen: [{ id, side:'N'|'S', u0, u1, d }], doorEnd: { side:'E'|'W', k:'doorEnclosed'|'doorDeck' } | null,
               clad: { k, col, sides:['N','S','W','E'] } | null, lights: [{ id, k, side, u }], porch: { k, side, u, w, d } | null }
     openings may carry o.shade = SHADE key */
  function normExt(P) {
    const e = P.ext && typeof P.ext === 'object' ? P.ext : (P.ext = {});
    if (!Array.isArray(e.widen)) e.widen = []; if (!Array.isArray(e.lights)) e.lights = [];
    if (e.doorEnd === undefined) e.doorEnd = null; if (e.clad === undefined) e.clad = null; if (e.porch === undefined) e.porch = null;
    if (PR(P).sys !== 'container') { e.widen = []; e.doorEnd = null; }
    if (Array.isArray(P.items)) P.items = P.items.filter(it => ITEMS[it.k]);
    return e;
  }
  const r1 = v => Math.round(v * 100) / 100;
  // the extra boxes added to the main shell; floor counts as inside only when the box is enclosed
  function annexes(P) {
    const p = PR(P), e = normExt(P), out = [];
    e.widen.forEach(w => {
      const u0 = Math.max(0, Math.min(w.u0, w.u1)), u1 = Math.min(p.L, Math.max(w.u0, w.u1)), d = Math.max(0.3, w.d || 1.2);
      if (u1 - u0 < 0.6) return;
      out.push({ kind: 'widen', id: w.id, side: w.side, u0, u1, d, enclosed: true, x0: u0, x1: u1, z0: w.side === 'N' ? -d : p.W, z1: w.side === 'N' ? 0 : p.W + d });
    });
    if (e.doorEnd && EXT[e.doorEnd.k]) {
      const dd = EXT[e.doorEnd.k].depth || 1.2, side = e.doorEnd.side === 'W' ? 'W' : 'E';
      out.push({ kind: 'doorEnd', k: e.doorEnd.k, side, d: dd, enclosed: e.doorEnd.k === 'doorEnclosed', x0: side === 'W' ? -dd : p.L, x1: side === 'W' ? 0 : p.L + dd, z0: 0, z1: p.W });
    }
    return out;
  }
  // wall stretch removed from the main shell on a side: [[u0,u1], ...]
  function removedSpans(P, side) {
    const p = PR(P);
    return annexes(P).filter(a => a.side === side).map(a => a.kind === 'widen' ? [a.u0, a.u1] : [0, p.W]);
  }
  // a partition that meets an opened wall carries on to the extension's outer wall
  function partSpan(P, q) {
    const p = PR(P), t = p.t; let s0 = q.s0, s1 = q.s1;
    annexes(P).filter(a => a.enclosed).forEach(a => {
      if (a.kind === 'widen' && q.a === 'z' && q.at > a.u0 + t && q.at < a.u1 - t + C) {
        if (a.side === 'N' && q.s0 <= t + 0.05) s0 = Math.min(s0, a.z0 + t);
        if (a.side === 'S' && q.s1 >= p.W - t - 0.05) s1 = Math.max(s1, a.z1 - t);
      }
      if (a.kind === 'doorEnd' && q.a === 'x') {
        if (a.side === 'E' && q.s1 >= p.L - t - 0.05) s1 = Math.max(s1, a.x1 - t);
        if (a.side === 'W' && q.s0 <= t + 0.05) s0 = Math.min(s0, a.x0 + t);
      }
    });
    return [s0, s1];
  }
  function bbox(P) {
    const p = PR(P); let x0 = 0, x1 = p.L, z0 = 0, z1 = p.W;
    annexes(P).forEach(a => { x0 = Math.min(x0, a.x0); x1 = Math.max(x1, a.x1); z0 = Math.min(z0, a.z0); z1 = Math.max(z1, a.z1); });
    return { x0, x1, z0, z1 };
  }
  // outside face of each side at a point along it, including annexes (for shades, lights and porches)
  function wallHeight(P) { const p = PR(P); return p.sys === 'aframe' ? 2.4 : (p.H || 2.6); }

  // ---------- geometry helpers ----------
  // an item's chosen options: it.opt = { key: value }; sizes come from params with a geometry, finishes from colour params
  const libOf = k => (ITEMS[k] && ITEMS[k].lib) || null;
  function optVal(it, q) { const v = it.opt && it.opt[q.key] != null ? it.opt[q.key] : q.default; return v == null ? '' : String(v); }
  function itemDims(it) {
    const d = ITEMS[it.k], lb = libOf(it.k); let w = d.w, dd = d.d, h = d.h;
    if (lb) (lb.params || []).forEach(q => {
      if (!q.geometry) return; const v = optVal(it, q);
      if (q.kind === 'number') { let n = Number(v) || Number(q.default) || 0; if (q.min != null) n = Math.max(+q.min, n); if (q.max != null) n = Math.min(+q.max, n); n /= 1000; if (q.geometry === 'w' || q.geometry === 'len') w = n; else if (q.geometry === 'd') dd = n; else if (q.geometry === 'h') h = n; return; }
      const m = v.match(/^(\d+(?:\.\d+)?)(?:x(\d+(?:\.\d+)?))?$/); if (!m) return;
      const a = +m[1] / 1000, b = m[2] ? +m[2] / 1000 : null;
      if (q.geometry === 'w' || q.geometry === 'len') { w = a; if (b) dd = b; } else if (q.geometry === 'd') dd = a; else if (q.geometry === 'h') h = a;
    });
    return { w, d: dd, h };
  }
  // same rules as public.catalog_price: option add-ons and multipliers, per m or per m² on the sizes
  function itemPrice(it) {
    const d = ITEMS[it.k], lb = libOf(it.k); if (!lb) return d.price;
    let adds = 0, mult = 1; (lb.params || []).forEach(q => { if (q.kind === 'number') return; const o = (q.options || []).find(x => String(x.value) === optVal(it, q)) || (q.options || [])[0]; if (!o) return; adds += Number(o.price_add) || 0; if (o.price_mult != null) mult *= Number(o.price_mult); });
    const dm = itemDims(it), base = Number(lb.price != null ? lb.price : d.price) || 0, rate = Number(lb.rate) || 0;
    const p = lb.price_mode === 'per_m2' ? base + rate * dm.w * dm.d : lb.price_mode === 'per_m' ? base + rate * dm.w : base;
    return Math.round(p * mult + adds);
  }
  function itemOptText(it) {
    const lb = libOf(it.k); if (!lb) return '';
    return (lb.params || []).map(q => { const v = optVal(it, q); if (q.kind === 'number') return (q.label || q.key) + ' ' + v + (q.unit ? ' ' + q.unit : ''); const o = (q.options || []).find(x => String(x.value) === v); return o ? o.label : ''; }).filter(Boolean).join(', ');
  }
  function itemColour(it) {
    const lb = libOf(it.k); if (!lb) return null;
    for (const q of lb.params || []) if (q.kind === 'color') { const o = (q.options || []).find(x => String(x.value) === optVal(it, q)); if (o && o.swatch) return o.swatch; }
    return (lb.specs && lb.specs.swatch) || null;
  }
  function itemRect(it) {
    const d = itemDims(it), odd = (it.rot || 0) % 2 === 1, w = odd ? d.d : d.w, dd = odd ? d.w : d.d;
    return { x0: it.x - w / 2, x1: it.x + w / 2, z0: it.z - dd / 2, z1: it.z + dd / 2 };
  }
  const runCat = r => (r.kind === 'kitchen' ? KU : WU);
  const runLen = r => r.units.reduce((a, k) => a + runCat(r)[k].w, 0);
  // where a run sits: exterior side N/S/E/W, or a partition face 'P:<id>:+|-'
  function runBase(P, r) {
    const p = PR(P), t = p.t;
    if (r.side.startsWith('P:')) {
      const [, id, f] = r.side.split(':'), q = P.parts.find(x => x.id === id);
      if (!q) return null;
      if (q.a === 'z') return { axis: 'z', start: q.s0, line: f === '+' ? q.at : q.at - C, dir: f === '+' ? 1 : -1 };
      return { axis: 'x', start: q.s0, line: f === '+' ? q.at : q.at - C, dir: f === '+' ? 1 : -1 };
    }
    if (r.side === 'N') return { axis: 'x', start: t, line: t, dir: 1, ext: 'N' };
    if (r.side === 'S') return { axis: 'x', start: t, line: p.W - t, dir: -1, ext: 'S' };
    if (r.side === 'W') return { axis: 'z', start: t, line: t, dir: 1, ext: 'W' };
    return { axis: 'z', start: t, line: p.L - t, dir: -1, ext: 'E' };
  }
  function runRect(P, r) {
    const b = runBase(P, r); if (!b) return null;
    const a0 = b.start + r.u0, a1 = a0 + runLen(r), d0 = b.dir > 0 ? b.line : b.line - 0.6, d1 = d0 + 0.6;
    return b.axis === 'x' ? { x0: a0, x1: a1, z0: d0, z1: d1, b } : { x0: d0, x1: d1, z0: a0, z1: a1, b };
  }
  function runUnits(P, r) {
    const b = runBase(P, r); if (!b) return [];
    let a = b.start + r.u0; const cat = runCat(r);
    return r.units.map(k => { const u = { k, a0: a, a1: a + cat[k].w, tall: !!cat[k].tall, wet: !!cat[k].wet }; a = u.a1; return u; });
  }
  function openSpan(P, o) {
    const d = OPEN[o.k];
    if (d.gable) return { u0: PR(P).W / 2 - d.w / 2, u1: PR(P).W / 2 + d.w / 2, v0: 0, v1: d.h, gable: true };
    return { u0: o.u - d.w / 2, u1: o.u + d.w / 2, v0: d.sill, v1: d.sill + d.h };
  }
  const area = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0));

  // ---------- rooms (raster flood fill; partition doors count as wall for room detection) ----------
  function grid(P) {
    const p = PR(P), bb = bbox(P), ox = Math.floor(bb.x0 / C + 1e-6) * C, oz = Math.floor(bb.z0 / C + 1e-6) * C;
    const nx = Math.round((bb.x1 - ox) / C), nz = Math.round((bb.z1 - oz) / C), N = nx * nz;
    const g = new Int16Array(N), pg = new Int16Array(N), t = p.t;
    // inside = main box inside its walls, or an enclosed annex inside its own walls (its joining wall is open)
    const inner = annexes(P).filter(a => a.enclosed).map(a => a.kind === 'widen'
      ? { x0: a.x0 + t, x1: a.x1 - t, z0: a.side === 'N' ? a.z0 + t : p.W - t, z1: a.side === 'N' ? t : a.z1 - t }
      : { x0: a.side === 'W' ? a.x0 + t : p.L - t, x1: a.side === 'W' ? t : a.x1 - t, z0: t, z1: p.W - t });
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const cx = ox + (i + 0.5) * C, cz = oz + (j + 0.5) * C;
      const inMain = cx > t && cx < p.L - t && cz > t && cz < p.W - t;
      if (!inMain && !inner.some(r => cx > r.x0 && cx < r.x1 && cz > r.z0 && cz < r.z1)) g[j * nx + i] = -1;
    }
    P.parts.forEach((q, qi) => {
      const [ps0, ps1] = partSpan(P, q);
      if (q.a === 'x') { const k = Math.round((q.at - oz) / C) - 1; if (k < 0 || k >= nz) return; for (let i = 0; i < nx; i++) { const cx = ox + (i + 0.5) * C; if (cx > ps0 && cx < ps1 && g[k * nx + i] === 0) { g[k * nx + i] = -1; pg[k * nx + i] = qi + 1; } } }
      else { const k = Math.round((q.at - ox) / C) - 1; if (k < 0 || k >= nx) return; for (let j = 0; j < nz; j++) { const cz = oz + (j + 0.5) * C; if (cz > ps0 && cz < ps1 && g[j * nx + k] === 0) { g[j * nx + k] = -1; pg[j * nx + k] = qi + 1; } } }
    });
    const rooms = []; let id = 0;
    for (let s = 0; s < N; s++) {
      if (g[s] !== 0) continue;
      id++; const cells = [], st = [s]; g[s] = id;
      while (st.length) {
        const c = st.pop(); cells.push(c); const i = c % nx, j = (c / nx) | 0;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= nz) continue; const n = b * nx + a; if (g[n] === 0) { g[n] = id; st.push(n); } }
      }
      let sx = 0, sz = 0; cells.forEach(c => { sx += (c % nx + 0.5) * C; sz += (((c / nx) | 0) + 0.5) * C; });
      const cx = sx / cells.length, cz = sz / cells.length;
      let best = cells[0], bd = 1e9; cells.forEach(c => { const d = ((c % nx + 0.5) * C - cx) ** 2 + ((((c / nx) | 0) + 0.5) * C - cz) ** 2; if (d < bd) { bd = d; best = c; } });
      rooms.push({ id, cells, area: cells.length * C * C, ax: ox + (best % nx + 0.5) * C, az: oz + (((best / nx) | 0) + 0.5) * C });
    }
    const at = (x, z) => { const i = Math.floor((x - ox) / C + 1e-9), j = Math.floor((z - oz) / C + 1e-9); if (i < 0 || j < 0 || i >= nx || j >= nz) return -1; return g[j * nx + i]; };
    return { nx, nz, g, pg, ox, oz, x1: ox + nx * C, z1: oz + nz * C, rooms: rooms.filter(r => r.area >= 0.6), at };
  }

  const TYPE_NAMES = { bath: 'Bathroom', kitchen: 'Kitchen', bed: 'Bedroom', living: 'Living', dining: 'Dining', study: 'Study', closet: 'Dressing', room: 'Room' };
  function roomInfo(P, G) {
    const counts = {};
    const R = G.rooms.map(r => {
      const items = P.items.filter(it => G.at(it.x, it.z) === r.id);
      const runs = P.runs.filter(rn => { const q = runRect(P, rn); return q && G.at((q.x0 + q.x1) / 2, (q.z0 + q.z1) / 2) === r.id; });
      const tags = new Set(items.map(it => ITEMS[it.k].tag).filter(Boolean));
      runs.forEach(rn => tags.add(rn.kind === 'kitchen' ? 'kitchen' : 'closet'));
      let type = 'room';
      if (tags.has('bath')) type = 'bath'; else if (tags.has('kitchen')) type = 'kitchen'; else if (tags.has('bed')) type = 'bed'; else if (tags.has('living')) type = 'living'; else if (tags.has('dining')) type = 'dining'; else if (tags.has('study')) type = 'study'; else if (tags.has('closet')) type = 'closet';
      const cfg = P.roomCfg.find(c => G.at(c.x, c.z) === r.id) || null;
      const wet = type === 'bath';
      let label = TYPE_NAMES[type];
      if (type === 'kitchen' && tags.has('living')) label = 'Kitchen and living';
      counts[label] = (counts[label] || 0) + 1;
      return { ...r, type, items, runs, cfg, autoName: label, n: counts[label], floor: (cfg && cfg.floor) || (wet ? 'tile' : 'spc'), wall: (cfg && cfg.wall) || (wet ? 'mrtile' : 'gyp') };
    });
    R.forEach(r => { r.name = (r.cfg && r.cfg.name) || (counts[r.autoName] > 1 ? `${r.autoName} ${r.n}` : r.autoName); });
    return R;
  }
  function setRoom(P, G, room, patch) {
    let c = P.roomCfg.find(c => G.at(c.x, c.z) === room.id);
    if (!c) { c = { x: room.ax, z: room.az }; P.roomCfg.push(c); }
    Object.assign(c, patch);
    P.roomCfg = P.roomCfg.filter(c => G.at(c.x, c.z) > 0);
  }

  // ---------- wall lining pieces (drives the 3D linings and the wall-finish m²) ----------
  function lining(P, G) {
    const p = PR(P), { nx, nz, g, pg } = G, ox = G.ox || 0, oz = G.oz || 0, ids = new Set(G.rooms.map(r => r.id)), pieces = [];
    const isA = p.sys === 'aframe';
    const near = (a, b) => Math.abs(a - b) <= C + 1e-6;
    const snapExt = (v, n, len) => (n > 0 && near(v, p.t) ? p.t : n < 0 && near(v, len - p.t) ? len - p.t : v);
    const snapEnd = (v, len) => (near(v, p.t) ? p.t : near(v, len - p.t) ? len - p.t : v);
    const runs = {}; // key → [a0,a1]
    const push = (key, a0, a1) => { const r = runs[key]; if (r && Math.abs(r[r.length - 1][1] - a0) < 1e-6) r[r.length - 1][1] = a1; else (runs[key] = r || []).push([a0, a1]); };
    // horizontal lines z = j*C (strips run along x)
    for (let j = 0; j <= nz; j++) for (let i = 0; i < nx; i++) {
      const a = j > 0 ? g[(j - 1) * nx + i] : -1, b = j < nz ? g[j * nx + i] : -1;
      if (a === b) continue;
      if (b > 0 && ids.has(b)) { const nb = j > 0 ? pg[(j - 1) * nx + i] : 0; push(`x|${j}|1|${b}|${nb}`, ox + i * C, ox + (i + 1) * C); }
      if (a > 0 && ids.has(a)) { const nb = j < nz ? pg[j * nx + i] : 0; push(`x|${j}|-1|${a}|${nb}`, ox + i * C, ox + (i + 1) * C); }
    }
    for (let i = 0; i <= nx; i++) for (let j = 0; j < nz; j++) {
      const a = i > 0 ? g[j * nx + i - 1] : -1, b = i < nx ? g[j * nx + i] : -1;
      if (a === b) continue;
      if (b > 0 && ids.has(b)) { const nb = i > 0 ? pg[j * nx + i - 1] : 0; push(`z|${i}|1|${b}|${nb}`, oz + j * C, oz + (j + 1) * C); }
      if (a > 0 && ids.has(a)) { const nb = i < nx ? pg[j * nx + i] : 0; push(`z|${i}|-1|${a}|${nb}`, oz + j * C, oz + (j + 1) * C); }
    }
    const top = (axis, line, a) => (isA ? Math.min(p.ih, hr(P, axis === 'x' ? line : a)) : p.ih);
    const add = (o, a0, a1, y0, y1) => {
      if (a1 - a0 < 0.02) return;
      if (isA && o.axis === 'z') { for (let a = a0; a < a1 - 1e-6; a += 0.3) { const b = Math.min(a1, a + 0.3), t1 = Math.min(y1, top('z', o.line, a), top('z', o.line, b)); if (t1 - y0 > 0.02) pieces.push({ ...o, a0: a, a1: b, y0, y1: t1 }); } return; }
      const t1 = Math.min(y1, top('x', o.line, 0));
      if (t1 - y0 > 0.02) pieces.push({ ...o, a0, a1, y0, y1: t1 });
    };
    for (const key in runs) {
      const [axis, li, ns, rs, nbs] = key.split('|'), n = +ns, room = +rs, pid = +nbs, len = axis === 'x' ? p.L : p.W, wid = axis === 'x' ? p.W : p.L;
      let line = (axis === 'x' ? oz : ox) + +li * C; const ext = pid === 0;
      if (ext) line = snapExt(line, n, wid);
      if (ext && isA && axis === 'x') continue; // A-frame long sides are the roof (ceiling finish)
      const side = ext ? (axis === 'x' ? (n > 0 ? 'N' : 'S') : (n > 0 ? 'W' : 'E')) : null;
      for (let [a0, a1] of runs[key]) {
        a0 = snapEnd(a0, len); a1 = snapEnd(a1, len);
        const o = { axis, line, n, room, ext, side, pid: ext ? null : P.parts[pid - 1].id };
        const cuts = [];
        const mainFace = { N: p.t, S: p.W - p.t, W: p.t, E: p.L - p.t }[side];
        if (ext) { if (near(line, mainFace)) P.opens.filter(q => q.side === side).forEach(q => { const s = openSpan(P, q); cuts.push([s.u0, s.u1, s.v0, s.v1]); }); }
        else { const q = P.parts[pid - 1]; if (q.door != null) { const c = q.s0 + q.door; cuts.push([c - DOOR_W / 2, c + DOOR_W / 2, 0, DOOR_H]); } }
        cuts.sort((x, y) => x[0] - y[0]);
        let cur = a0;
        for (const [u0, u1, v0, v1] of cuts) {
          if (u1 <= a0 || u0 >= a1) continue;
          const c0 = Math.max(a0, u0), c1 = Math.min(a1, u1);
          add(o, cur, c0, 0, 9); if (v0 > 0.02) add(o, c0, c1, 0, v0); add(o, c0, c1, v1, 9); cur = c1;
        }
        add(o, cur, a1, 0, 9);
      }
    }
    return pieces;
  }

  // ---------- reachability ----------
  function doorLinks(P, G, R) {
    const p = PR(P), links = [], outside = new Set();
    P.parts.forEach(q => {
      if (q.door == null) return;
      const c = q.s0 + q.door, k = Math.round(q.at / C) - 1;
      const a = q.a === 'x' ? G.at(c, (k - 0.5) * C) : G.at((k - 0.5) * C, c), b = q.a === 'x' ? G.at(c, (k + 1.5) * C) : G.at((k + 1.5) * C, c);
      if (a > 0 && b > 0) links.push([a, b]);
    });
    P.opens.forEach(o => {
      const d = OPEN[o.k]; if (!d.door) return; const s = openSpan(P, o), m = (s.u0 + s.u1) / 2, e = 0.25;
      const pt = { N: [m, p.t + e], S: [m, p.W - p.t - e], W: [p.t + e, m], E: [p.L - p.t - e, m] }[o.side];
      const r = G.at(pt[0], pt[1]); if (r > 0) outside.add(r);
    });
    annexes(P).filter(a => a.kind === 'doorEnd' && a.enclosed).forEach(a => { const r = G.at((a.x0 + a.x1) / 2, p.W / 2); if (r > 0) outside.add(r); });
    const seen = new Set(outside), st = [...outside];
    while (st.length) { const r = st.pop(); links.forEach(([a, b]) => { const o = a === r ? b : b === r ? a : 0; if (o && !seen.has(o)) { seen.add(o); st.push(o); } }); }
    return { seen, hasEntrance: outside.size > 0 };
  }

  // ---------- quote / BOQ ----------
  function quote(P, G, R, L) {
    const p = PR(P), lines = [], use = {};
    const add = (grp, name, qty, unit, rate, x = {}) => { if (qty > 0) lines.push({ grp, name, qty, unit, rate, total: qty * rate, ...x }); };
    add('Shell', `${p.name} shell, insulated and wired`, 1, 'lot', p.shell);
    // openings
    const oc = {}; P.opens.forEach(o => { oc[o.k] = (oc[o.k] || 0) + 1; });
    for (const k in oc) add('Doors and windows', OPEN[k].name, oc[k], 'ea', OPEN[k].price, { stock: OPEN[k].stock, short: oc[k] > OPEN[k].stock });
    if (p.sys === 'container') { const n = P.opens.filter(o => (o.side === 'N' || o.side === 'S') && OPEN[o.k].w > 1.2).length; add('Doors and windows', 'Steel frame for wide side cut', n, 'ea', WIDE_FRAME, { eng: true }); }
    // partitions
    const pm = P.parts.reduce((a, q) => a + (q.s1 - q.s0), 0), pd = P.parts.filter(q => q.door != null).length;
    add('Partitions', 'Stud partition, boarded both sides', Math.round(pm * 10) / 10, 'm', PART_PER_M);
    add('Partitions', 'Internal door set', pd, 'ea', PART_DOOR);
    // extensions
    const AX = annexes(P), H = wallHeight(P);
    AX.filter(a => a.kind === 'widen').forEach(a => {
      const len = r1(a.u1 - a.u0), sd = a.side === 'N' ? 'north' : 'south';
      add('Extensions', `${EXT.cut.name}, ${sd} wall`, len, 'm', EXT.cut.price, { eng: true });
      add('Extensions', `${EXT.bump.name}, ${len.toFixed(1)} × ${a.d.toFixed(1)} m`, r1(len * a.d), 'm²', EXT.bump.price);
    });
    AX.filter(a => a.kind === 'doorEnd').forEach(a => add('Extensions', `${EXT[a.k].name}, ${a.side === 'W' ? 'west' : 'east'} end`, 1, 'lot', EXT[a.k].price));
    // exterior: cladding on the chosen walls (less openings and removed wall), lights, porch, shades
    const e = normExt(P);
    if (e.clad && CLAD[e.clad.k]) {
      const cd = CLAD[e.clad.k], add1 = ((cd.colours || []).find(c => c[0] === e.clad.col) || [0, 0, 0])[2] || 0, sides = e.clad.sides && e.clad.sides.length ? e.clad.sides : ['N', 'S', 'W', 'E'];
      let a2 = 0;
      sides.forEach(sd => {
        if (p.sys === 'aframe' && (sd === 'N' || sd === 'S')) return;
        const len = sideLen(P, sd), gone = removedSpans(P, sd).reduce((a, [u0, u1]) => a + (u1 - u0), 0);
        const holes = P.opens.filter(o => o.side === sd && !OPEN[o.k].gable).reduce((a, o) => { const sp = openSpan(P, o); return a + (sp.u1 - sp.u0) * (sp.v1 - sp.v0); }, 0);
        a2 += Math.max(0, (len - gone) * H - holes);
        AX.filter(x => x.kind === 'widen' && x.side === sd).forEach(x => { a2 += (x.u1 - x.u0) * H; });
        AX.filter(x => x.kind === 'widen' && (sd === 'W' || sd === 'E')).forEach(x => { a2 += x.d * H; });
      });
      const q = Math.ceil(a2 * 1.1 * 10) / 10, cname = ((cd.colours || []).find(c => c[0] === e.clad.col) || [0, ''])[1];
      use['clad:' + e.clad.k] = q;
      add('Exterior', `${cd.name}${cname ? ', ' + cname.toLowerCase() : ''} (incl. 10% waste)`, q, 'm²', cd.price + add1, { fin: true });
    }
    const lc = {}; e.lights.forEach(l => { if (LIGHT[l.k]) lc[l.k] = (lc[l.k] || 0) + 1; });
    for (const k in lc) add('Exterior', LIGHT[k].name, lc[k], 'ea', LIGHT[k].price, { stock: LIGHT[k].stock, short: LIGHT[k].stock != null && lc[k] > LIGHT[k].stock });
    if (e.porch && PORCH[e.porch.k]) add('Exterior', `${PORCH[e.porch.k].name}, ${r1(e.porch.w).toFixed(1)} × ${r1(e.porch.d).toFixed(1)} m`, r1(e.porch.w * e.porch.d), 'm²', PORCH[e.porch.k].price);
    const sh = {}; P.opens.forEach(o => { if (o.shade && SHADE[o.shade] && !OPEN[o.k].gable) sh[o.shade] = (sh[o.shade] || 0) + OPEN[o.k].w; });
    for (const k in sh) add('Exterior', SHADE[k].name, r1(sh[k]), 'm', SHADE[k].price);
    // floors and walls by finish
    const fl = {}, wl = {};
    R.forEach(r => { fl[r.floor] = (fl[r.floor] || 0) + r.area; });
    L.forEach(pc => { const r = R.find(x => x.id === pc.room); if (!r) return; wl[r.wall] = (wl[r.wall] || 0) + (pc.a1 - pc.a0) * (pc.y1 - pc.y0); });
    for (const k in fl) { const q = Math.ceil(fl[k] * 1.08 * 10) / 10; use['floor:' + k] = q; add('Floors', FIN.floor[k].name + ' (incl. 8% waste)', q, 'm²', FIN.floor[k].price, { stock: FIN.floor[k].stock, short: q > FIN.floor[k].stock, fin: true }); }
    for (const k in wl) { const q = Math.ceil(wl[k] * 1.08 * 10) / 10; use['wall:' + k] = q; add('Walls', FIN.wall[k].name + ' (incl. 8% waste)', q, 'm²', FIN.wall[k].price, { stock: FIN.wall[k].stock, short: q > FIN.wall[k].stock, fin: true }); }
    const ca = p.sys === 'aframe' ? 2 * (p.L - 2 * p.t) * Math.hypot(p.W / 2, p.ridge - p.yF) * 0.92 : (p.L - 2 * p.t) * (p.W - 2 * p.t);
    const cq = Math.ceil(ca * 1.05 * 10) / 10, cf = FIN.ceil[P.ceil];
    use['ceil:' + P.ceil] = cq;
    add('Ceiling', (p.sys === 'aframe' ? 'Roof lining, ' : '') + cf.name, cq, 'm²', cf.price, { stock: cf.stock, short: cq > cf.stock, fin: true });
    // joinery
    P.runs.forEach(r => {
      const f = FRONTS[r.front] || FRONTS.white, cat = runCat(r), u = runUnits(P, r), nm = r.kind === 'kitchen' ? 'Kitchen' : 'Wardrobe';
      const base = r.units.reduce((a, k) => a + cat[k].price, 0);
      add('Joinery', `${nm} run, ${r.units.length} units, ${f.name} fronts`, 1, 'set', base * f.mult);
      if (r.kind === 'kitchen') {
        const wt = u.filter(x => !x.tall).reduce((a, x) => a + x.a1 - x.a0, 0), top = TOPS[r.top] || TOPS.lam;
        add('Joinery', `${top.name} worktop`, Math.round(wt * 100) / 100, 'm', top.perM);
        if (r.wallCab) add('Joinery', `Wall cabinets, ${f.name}`, Math.round(wt * 100) / 100, 'm', WALLCAB_PER_M * f.mult);
      }
    });
    // sanitary (always priced) and furniture package (optional)
    const sc = {}, fc = {};
    const byK = {};
    P.items.forEach(it => { const d = ITEMS[it.k], ot = itemOptText(it), key = it.k + '|' + ot, g = d.sanitary ? sc : fc; byK[it.k] = (byK[it.k] || 0) + 1; (g[key] = g[key] || { k: it.k, ot, n: 0, price: itemPrice(it) }).n++; });
    const itemLine = (grp, x) => add(grp, ITEMS[x.k].name + (x.ot ? ` (${x.ot})` : ''), x.n, 'ea', x.price, { stock: ITEMS[x.k].stock, short: ITEMS[x.k].stock != null && byK[x.k] > ITEMS[x.k].stock });
    Object.values(sc).forEach(x => itemLine('Sanitary ware', x));
    if (P.furnPkg) Object.values(fc).forEach(x => itemLine('Furniture package', x));
    const floorA = R.reduce((a, r) => a + r.area, 0), hasWet = P.items.some(it => ITEMS[it.k] && ITEMS[it.k].wet) || P.runs.some(r => r.units.includes('sink'));
    if (SERVICES.electrical) add('Services', SERVICES.electrical.name, Math.max(1, Math.ceil(floorA / (SERVICES.electrical.per_m2 || 30))), 'set', SERVICES.electrical.price);
    if (SERVICES.plumbing && hasWet) add('Services', SERVICES.plumbing.name, 1, 'set', SERVICES.plumbing.price);
    add('Site and delivery', 'Delivery, crane and set', 1, 'lot', p.deliver);
    add('Site and delivery', 'Design and engineering review', 1, 'lot', DESIGN_FEE);
    const sub = lines.reduce((a, l) => a + l.total, 0), vat = sub * VAT, total = sub + vat;
    const shortfall = lines.filter(l => l.short);
    const weeks = p.weeks + (shortfall.length ? 2 : 0) + (P.runs.some(r => r.front !== 'white') ? 1 : 0) + (AX.length ? 1 : 0) + (e.porch && PORCH[e.porch.k] && PORCH[e.porch.k].roof ? 1 : 0);
    return { lines, sub, vat, total, deposit: total * 0.3, weeks, shortfall, use };
  }

  // ---------- checks ----------
  function analyze(P, G, R) {
    const p = PR(P), out = [], E = (lvl, text, ref) => out.push({ lvl, text, ref });
    const things = [];
    P.items.forEach(it => things.push({ ref: { kind: 'item', id: it.id }, name: ITEMS[it.k].name, r: itemRect(it), flat: !!ITEMS[it.k].flat }));
    P.runs.forEach(rn => { const r = runRect(P, rn); if (r) things.push({ ref: { kind: 'run', id: rn.id }, name: rn.kind === 'kitchen' ? 'Kitchen run' : 'Wardrobe run', r }); else E('error', 'A run is attached to a partition that no longer exists', { kind: 'run', id: rn.id }); });
    for (let i = 0; i < things.length; i++) for (let j = i + 1; j < things.length; j++) {
      const a = things[i], b = things[j]; if (a.flat || b.flat) continue;
      if (area(a.r, b.r) > 0.01) E('error', `${a.name} overlaps ${b.name}`, a.ref);
    }
    things.forEach(o => {
      const { x0, x1, z0, z1 } = o.r;
      const bb = bbox(P); if (x0 < bb.x0 - 1e-6 || z0 < bb.z0 - 1e-6 || x1 > bb.x1 + 1e-6 || z1 > bb.z1 + 1e-6) return E('error', `${o.name} sits outside the floor`, o.ref);
      let hit = false;
      for (let x = Math.floor(x0 / C) * C + C / 2; x < x1 && !hit; x += C) for (let z = Math.floor(z0 / C) * C + C / 2; z < z1 && !hit; z += C) if (x > x0 && z > z0 && G.at(x, z) === -1) hit = true;
      if (hit) E('error', `${o.name} runs into a wall`, o.ref);
    });
    // openings
    const sides = {};
    P.opens.forEach(o => {
      const d = OPEN[o.k], s = openSpan(P, o), len = sideLen(P, o.side);
      if (d.only && !d.only.includes(p.sys)) E('error', `${d.name} is not available on this system`, { kind: 'open', id: o.id });
      if (!d.gable && (s.u0 < p.t + 0.15 || s.u1 > len - p.t - 0.15)) E('error', `${d.name} is too close to the corner`, { kind: 'open', id: o.id });
      (sides[o.side] = sides[o.side] || []).push([s, o]);
      if (p.sys === 'aframe' && !d.gable) { const h = Math.min(hr(P, s.u0), hr(P, s.u1)); if (s.v1 > h - 0.1) E('error', `${d.name} is taller than the roof allows at this point`, { kind: 'open', id: o.id }); }
      if (p.sys === 'container' && (o.side === 'N' || o.side === 'S') && d.w > 1.2) E('eng', `${d.name}: a side cut over 1.2 m needs a welded steel frame (added to the quote)`, { kind: 'open', id: o.id });
      // clash with partition junctions
      P.parts.forEach(q => {
        let j = null;
        if (q.a === 'z' && (o.side === 'N' && q.s0 <= p.t + 0.05 || o.side === 'S' && q.s1 >= p.W - p.t - 0.05)) j = [q.at - C, q.at];
        if (q.a === 'x' && (o.side === 'W' && q.s0 <= p.t + 0.05 || o.side === 'E' && q.s1 >= p.L - p.t - 0.05)) j = [q.at - C, q.at];
        if (j && s.u0 < j[1] && s.u1 > j[0]) E('error', `${d.name} clashes with a partition`, { kind: 'open', id: o.id });
      });
      if (d.door) {
        const z = 0.9, R0 = { N: { x0: s.u0, x1: s.u1, z0: p.t, z1: p.t + z }, S: { x0: s.u0, x1: s.u1, z0: p.W - p.t - z, z1: p.W - p.t }, W: { x0: p.t, x1: p.t + z, z0: s.u0, z1: s.u1 }, E: { x0: p.L - p.t - z, x1: p.L - p.t, z0: s.u0, z1: s.u1 } }[o.side];
        things.forEach(t => { if (!t.flat && area(t.r, R0) > 0.05) E('warn', `Keep the space inside the ${d.name.toLowerCase()} clear (${t.name})`, t.ref); });
      }
    });
    // extensions and exterior
    const AX = annexes(P), e = normExt(P);
    P.opens.forEach(o => { const d = OPEN[o.k]; if (d.gable) return; const sp = openSpan(P, o);
      removedSpans(P, o.side).forEach(([u0, u1]) => { if (sp.u0 < u1 - 0.01 && sp.u1 > u0 + 0.01) E('error', AX.some(a => a.kind === 'doorEnd' && a.side === o.side) ? `${d.name} is in the end opened for the door-end extension. Move it to another wall` : `${d.name} is in the wall section opened for the extension. Move it or shorten the opening`, { kind: 'open', id: o.id }); }); });
    AX.filter(a => a.kind === 'widen').forEach(a => {
      const len = a.u1 - a.u0;
      E('eng', `${a.side === 'N' ? 'North' : 'South'} wall opened for ${len.toFixed(1)} m: the welded frame and the bump-out roof need an engineer's sign-off (in the quote)`, null);
      if (len > p.L - 0.2 && !p.twin) E('eng', 'The whole side wall is removed. Add a mid-span post or confirm the frame size with the engineer', null);
      if (a.d > (EXT.bump.maxDepth || 2.4) + 1e-6) E('error', `The bump-out is deeper than ${(EXT.bump.maxDepth || 2.4).toFixed(1)} m. Use a second unit instead`, null);
    });
    const ws = {}; e.widen.forEach(w => { ws[w.side] = (ws[w.side] || 0) + 1; }); for (const k in ws) if (ws[k] > 1) E('error', `Only one widening per side. Merge the ${k === 'N' ? 'north' : 'south'} wall openings`, null);
    if (e.porch && PORCH[e.porch.k]) {
      const pc = e.porch, len = sideLen(P, pc.side);
      if (pc.u - pc.w / 2 < -0.01 || pc.u + pc.w / 2 > len + 0.01) E('warn', 'The porch runs past the corner of the building', null);
      if (AX.some(a => a.side === pc.side)) E('warn', 'The porch is on the same side as an extension. Check where they meet', null);
      if (!P.opens.some(o => o.side === pc.side && OPEN[o.k].door)) E('warn', 'There is no door onto the porch', null);
    }
    e.lights.forEach(l => { if (LIGHT[l.k] && AX.some(a => a.kind === 'doorEnd' && a.side === l.side)) E('warn', `${LIGHT[l.k].name} is on the opened door end. Move it to a side wall`, null); });
    for (const sd in sides) { const L = sides[sd]; for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) if (L[i][0].u0 < L[j][0].u1 && L[j][0].u0 < L[i][0].u1) E('error', `${OPEN[L[i][1].k].name} overlaps ${OPEN[L[j][1].k].name}`, { kind: 'open', id: L[i][1].id }); }
    // runs vs windows, headroom
    P.runs.forEach(rn => {
      const b = runBase(P, rn); if (!b) return; const U = runUnits(P, rn), ref = { kind: 'run', id: rn.id };
      if (b.ext) P.opens.filter(o => o.side === b.ext).forEach(o => {
        const s = openSpan(P, o), d = OPEN[o.k];
        U.forEach(u => { if (u.a0 < s.u1 && u.a1 > s.u0) { if (u.tall || d.door) E('error', `${u.tall ? 'A tall unit' : 'The run'} blocks the ${d.name.toLowerCase()}`, ref); else if (rn.kind === 'kitchen' && s.v0 < 0.95) E('warn', `${d.name} sill is below the worktop. Use a sill of 0.95 m or more`, ref); } });
      });
      if (p.sys === 'aframe') U.forEach(u => {
        const z0 = b.axis === 'z' ? u.a0 : Math.min(b.line, b.line + 0.6 * b.dir), z1 = b.axis === 'z' ? u.a1 : Math.max(b.line, b.line + 0.6 * b.dir);
        const h = Math.min(hr(P, z0), hr(P, z1)), need = u.tall ? 2.2 : rn.wallCab ? 2.2 : 0.95;
        if (h < need) E('error', `${(runCat(rn)[u.k] || {}).name} does not fit under the roof here`, ref);
      });
    });
    if (p.sys === 'aframe') P.items.forEach(it => {
      const d = ITEMS[it.k], r = itemRect(it), h = d.tallItem ? Math.min(hr(P, r.z0), hr(P, r.z1)) : hr(P, it.z);
      if (h < itemDims(it).h + (d.tallItem ? 0 : 0.2)) E(d.tallItem ? 'error' : 'warn', `${d.name}: low headroom under the roof`, { kind: 'item', id: it.id });
    });
    P.parts.forEach(q => {
      if (q.door == null) return; const c = q.s0 + q.door;
      if (c - DOOR_W / 2 < q.s0 + 0.05 || c + DOOR_W / 2 > q.s1 - 0.05) E('error', 'Partition door runs past the end of its partition', { kind: 'part', id: q.id });
      if (p.sys === 'aframe') { const h = q.a === 'x' ? hr(P, q.at) : Math.min(hr(P, c - DOOR_W / 2), hr(P, c + DOOR_W / 2)); if (h < DOOR_H + 0.05) E('error', 'Partition door is taller than the roof allows here', { kind: 'part', id: q.id }); }
    });
    // rooms
    const reach = doorLinks(P, G, R);
    if (!reach.hasEntrance) E('error', 'Add an entrance door on an outside wall', null);
    R.forEach(r => {
      const ref = { kind: 'room', id: r.id };
      if (reach.hasEntrance && !reach.seen.has(r.id)) E('error', `${r.name} has no way in. Add a door to its partition`, ref);
      if (r.type === 'bath') { if (!FIN.floor[r.floor].wet) E('warn', `${r.name}: use a wet-rated floor`, ref); if (!FIN.wall[r.wall].wet) E('warn', `${r.name}: walls need MR board and tile`, ref); }
      if (r.type === 'bed' && r.area < 6.5) E('warn', `${r.name} is under 6.5 m²`, ref);
    });
    const wet = [];
    P.items.forEach(it => { if (ITEMS[it.k].wet) wet.push([it.x, it.z]); });
    P.runs.forEach(rn => { const r = runRect(P, rn); if (r && rn.units.includes('sink')) wet.push([(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2]); });
    let far = 0; for (let i = 0; i < wet.length; i++) for (let j = i + 1; j < wet.length; j++) far = Math.max(far, Math.hypot(wet[i][0] - wet[j][0], wet[i][1] - wet[j][1]));
    if (far > 12) E('eng', `Wet points are ${far.toFixed(1)} m apart. Engineering to confirm the drainage run`, null);
    return out;
  }

  // ---------- starter layouts ----------
  const part = (id, a, at, s0, s1, door) => ({ id, a, at, s0, s1, door: door == null ? null : door });
  const op = (k, side, u) => ({ id: 'o' + Math.random().toString(36).slice(2, 7), k, side, u });
  const it = (k, x, z, rot = 0) => ({ id: 'i' + Math.random().toString(36).slice(2, 7), k, x, z, rot });
  const run = (kind, side, u0, units, x = {}) => ({ id: 'r' + Math.random().toString(36).slice(2, 7), kind, side, u0, units, front: 'white', top: 'quartz', wallCab: false, ...x });
  const STARTERS = {
    c20: () => ({
      parts: [part('p1', 'z', 4.6, 0.1, 2.34, 0.55)],
      opens: [op('dGlass', 'W', 1.22), op('wAlu', 'S', 3.7), op('wSmall', 'S', 5.3)],
      runs: [run('kitchen', 'N', 1.0, ['fridge', 'sink', 'hob', 'drawer'])],
      items: [it('shower', 5.5, 1.85), it('wc', 5.6, 0.45), it('basin', 4.95, 0.325), it('sofa', 2.2, 1.85, 2)],
    }),
    c40: () => ({
      parts: [part('p1', 'z', 5.8, 1.2, 2.34), part('p2', 'x', 1.2, 5.8, 8.0, 0.7), part('p3', 'z', 8.0, 0.1, 2.34, 0.55)],
      opens: [op('dGlass', 'W', 1.22), op('wWide', 'S', 4.0), op('wSmall', 'S', 6.6), op('wAlu', 'S', 11.0)],
      runs: [run('kitchen', 'N', 1.0, ['fridge', 'sink', 'drawer', 'hob', 'base']), run('wardrobe', 'S', 7.9, ['double', 'hang'], { front: 'oak' })],
      items: [it('wc', 6.02, 1.95, 2), it('basin', 6.6, 2.075, 2), it('shower', 7.42, 1.75), it('bedD', 11.03, 1.2, 1), it('dining', 4.9, 1.2, 1), it('sofa', 2.4, 1.85, 2)],
    }),
    tw40: () => ({
      parts: [part('p1', 'z', 3.2, 0.1, 2.6, 1.2), part('p2', 'z', 3.2, 2.6, 4.78, 1.1), part('p3', 'x', 2.6, 0.1, 3.2), part('p4', 'z', 9.0, 0.1, 4.78, 3.5)],
      opens: [op('slider', 'S', 4.5), op('wAlu', 'N', 1.6), op('wSmall', 'S', 2.2), op('wAlu', 'S', 11.0), op('wAlu', 'E', 2.4)],
      runs: [run('kitchen', 'N', 3.1, ['fridge', 'oven', 'sink', 'dw', 'hob', 'drawer'], { wallCab: true }), run('wardrobe', 'N', 8.9, ['double', 'double'], { front: 'oak' })],
      items: [it('shower', 0.55, 4.35), it('wc', 1.4, 4.45, 2), it('basin', 2.2, 4.575, 2), it('bedD', 1.6, 1.125, 0), it('bedD', 11.03, 2.4, 1), it('night', 11.65, 1.35, 1), it('night', 11.65, 3.45, 1), it('dining', 4.9, 2.0), it('sofa', 7.6, 4.35, 2), it('coffee', 7.6, 3.2), it('rug', 7.6, 3.4)],
    }),
    af8: () => ({
      parts: [part('p1', 'z', 6.0, 3.6, 5.8, 0.6), part('p2', 'x', 3.6, 6.0, 7.8)],
      opens: [op('gable', 'W', 3.0), op('wSmall', 'E', 2.2)],
      runs: [run('kitchen', 'E', 1.05, ['hob', 'sink', 'oven'], { front: 'sage', top: 'timber' })],
      items: [it('shower', 7.35, 4.15), it('basin', 6.6, 3.825, 0), it('wc', 7.45, 5.0, 1), it('dining', 5.0, 2.2, 1), it('sofa', 3.2, 3.0, 1), it('coffee', 2.0, 3.0, 1), it('rug', 2.3, 3.0, 1), it('arm', 1.2, 4.4, 1)],
    }),
    af12: () => ({
      parts: [part('pF', 'z', 8.2, 0.2, 5.8, 2.9), part('p2', 'z', 6.2, 3.6, 5.8, 0.6), part('p3', 'x', 3.6, 6.2, 8.2)],
      opens: [op('gable', 'W', 3.0), op('wAlu', 'E', 3.0)],
      runs: [run('kitchen', 'P:pF:-', 1.05, ['hob', 'sink'], { front: 'sage', top: 'timber' }), run('wardrobe', 'P:pF:+', 3.4, ['double'], { front: 'oak' })],
      items: [it('shower', 7.65, 4.15), it('basin', 6.9, 3.825, 0), it('wc', 7.75, 5.0, 1), it('dining', 5.0, 2.2, 1), it('sofa', 3.2, 3.0, 1), it('coffee', 2.0, 3.0, 1), it('rug', 2.3, 3.0, 1), it('arm', 1.2, 4.4, 1), it('bedD', 10.775, 3.0, 1), it('night', 11.6, 1.95, 1), it('night', 11.6, 4.05, 1)],
    }),
    cb9: () => ({
      parts: [part('p1', 'z', 3.4, 0.2, 3.0, 2.2), part('p2', 'z', 3.4, 3.0, 5.8, 0.5), part('p3', 'x', 3.0, 0.2, 3.4), part('p4', 'z', 7.0, 0.2, 2.4), part('p5', 'x', 2.4, 7.0, 8.8, 0.9)],
      opens: [op('slider', 'S', 5.2), op('wAlu', 'N', 2.4), op('wAlu', 'S', 2.4), op('wSmall', 'N', 7.5), op('wAlu', 'E', 4.2)],
      runs: [run('kitchen', 'N', 3.2, ['fridge', 'oven', 'sink', 'dw', 'hob']), run('wardrobe', 'N', 0, ['double'], { front: 'oak' }), run('wardrobe', 'S', 0, ['double'], { front: 'oak' })],
      items: [it('shower', 8.35, 0.65), it('wc', 7.35, 0.6, 3), it('basin', 7.225, 1.65, 3), it('dining', 5.0, 2.0), it('sofa', 8.35, 4.2, 1), it('coffee', 7.2, 4.2, 1), it('rug', 7.3, 4.2, 1), it('bedD', 1.225, 1.65, 3), it('bedD', 1.225, 4.4, 3)],
    }),
    cb12: () => ({
      parts: [part('p1', 'z', 3.4, 0.2, 3.0, 2.2), part('p2', 'z', 3.4, 3.0, 5.8, 0.5), part('p3', 'x', 3.0, 0.2, 3.4), part('p4', 'z', 7.0, 0.2, 2.4), part('p5', 'x', 2.4, 7.0, 9.2, 0.9), part('p6', 'z', 9.2, 0.2, 5.8, 3.3)],
      opens: [op('slider', 'S', 5.2), op('wAlu', 'N', 2.4), op('wAlu', 'S', 2.4), op('wSmall', 'N', 7.6), op('wAlu', 'N', 10.5), op('wAlu', 'E', 4.6)],
      runs: [run('kitchen', 'N', 3.2, ['fridge', 'oven', 'sink', 'dw', 'hob']), run('wardrobe', 'N', 0, ['double'], { front: 'oak' }), run('wardrobe', 'S', 0, ['double'], { front: 'oak' })],
      items: [it('shower', 8.65, 0.65), it('wc', 7.35, 0.6, 3), it('basin', 7.225, 1.65, 3), it('dining', 5.0, 2.0), it('sofa', 8.65, 4.2, 1), it('coffee', 7.5, 4.2, 1), it('rug', 7.6, 4.2, 1), it('bedD', 1.225, 1.65, 3), it('bedD', 1.225, 4.4, 3), it('bedD', 10.775, 4.6, 1), it('desk', 10.5, 0.5, 0)],
    }),
  };
  function starter(key, name) {
    const s = STARTERS[key](), p = PRESETS[key];
    return { v: 1, name: name || `${p.name} · ${p.sub}`, preset: key, colour: SYS[p.sys].colours[0][0], ceil: p.sys === 'aframe' ? 'pine' : 'gyp', furnPkg: true, roomCfg: [], ext: { widen: [], doorEnd: null, clad: null, lights: [], porch: null }, ...s };
  }

  // ---------- load a design package from the database (ds_package) ----------
  function fill(target, src, map) { Object.keys(target).forEach(k => delete target[k]); Object.entries(src || {}).sort((a, b) => (a[1].sort || 0) - (b[1].sort || 0)).forEach(([k, v]) => { target[k] = map ? map(v) : v; }); }
  function applyPackage(pkg, source) {
    if (!pkg || !pkg.shells || !pkg.catalog) throw new Error('Not a design package');
    const c = pkg.catalog, ALL = 3;
    fill(PRESETS, pkg.shells, v => ({ ...v }));
    if (c.opening) fill(OPEN, c.opening, v => { const o = { ...v }; if (v.systems && v.systems.length < ALL) o.only = v.systems; return o; });
    ['floor', 'wall', 'ceil'].forEach(g => { if (c[g]) fill(FIN[g], c[g]); });
    if (c.kitchen_unit) fill(KU, c.kitchen_unit);
    if (c.wardrobe_unit) fill(WU, c.wardrobe_unit);
    if (c.front) fill(FRONTS, c.front);
    if (c.worktop) fill(TOPS, c.worktop, v => ({ ...v, perM: v.price }));
    if (c.item) fill(ITEMS, c.item);
    if (c.service) fill(SERVICES, c.service);
    if (c.cladding) fill(CLAD, c.cladding, v => ({ ...v, colours: v.colours || [[v.col, 'Standard', 0]] }));
    if (c.light) fill(LIGHT, c.light);
    if (c.porch) fill(PORCH, c.porch, v => ({ ...v, ground: v.ground || (!v.roof && /patio/i.test(v.name || '')) }));
    if (c.shade) fill(SHADE, c.shade);
    if (c.extension) Object.entries(c.extension).forEach(([k, v]) => { EXT[k] = { ...(EXT[k] || {}), ...v }; });
    if (pkg.library && pkg.library.items) {
      LIB.cats = pkg.library.cats || []; LIB.items = pkg.library.items;
      const famOf = slug => { let c = LIB.cats.find(x => x.slug === slug), n = 0; while (c && c.parent && n++ < 6) c = LIB.cats.find(x => x.slug === c.parent); return c; };
      Object.entries(LIB.items).forEach(([k, e]) => {
        const sp = e.specs || {}, fam = famOf(e.cat), bath = /^bath-(sanitary|showers)$/.test(e.cat);
        const base = ITEMS[k] || { name: e.name, w: +sp.w || 0.6, d: +sp.d || 0.6, h: +sp.h || 0.8, cat: fam ? fam.name : 'Other', price: +e.price || 0, stock: e.stock, tag: sp.tag || CAT_TAG[e.cat], sanitary: !!sp.sanitary || bath, wet: !!sp.wet || bath, flat: !!sp.flat, tallItem: !!sp.tallItem };
        ITEMS[k] = { ...base, name: e.name || base.name, price: e.price != null ? +e.price : base.price, stock: e.stock != null ? e.stock : base.stock, lib: e };
      });
    }
    if (c.partition) { if (c.partition.stud) PART_PER_M = c.partition.stud.price; if (c.partition.door) PART_DOOR = c.partition.door.price; root.DS.PART_PER_M = PART_PER_M; root.DS.PART_DOOR = PART_DOOR; }
    DESIGNS = pkg.designs || []; root.DS.DESIGNS = DESIGNS;
    SOURCE = { ...(source || { kind: 'db', label: 'Live database' }), generated_at: pkg.generated_at }; root.DS.SOURCE = SOURCE;
    return pkg;
  }

  root.DS = { LIB, itemDims, itemPrice, itemOptText, itemColour, partSpan, CLAD, LIGHT, PORCH, SHADE, EXT, normExt, annexes, removedSpans, bbox, wallHeight, applyPackage, SERVICES, DESIGNS, SOURCE, C, PRESETS, SYS, SIDE_NAME, OPEN, FIN, KU, WU, FRONTS, TOPS, ITEMS, PART_PER_M, PART_DOOR, DOOR_W, DOOR_H, clone, PR, hr, sideLen, itemRect, runCat, runLen, runBase, runRect, runUnits, openSpan, grid, roomInfo, setRoom, lining, quote, analyze, starter, doorLinks };
})(typeof window !== 'undefined' ? window : globalThis);
