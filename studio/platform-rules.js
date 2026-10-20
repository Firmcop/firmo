/* Shared platform rules — one source of truth for every design, studio and configurator.
   window.PlatformRules.get() / set(patch) / reset() / onChange(fn). Stored in localStorage. */
(function () {
  const KEY = 'firmcop-rules-kes-v1';
  const DEFAULTS = {
    prices: { m10: 9800, m20: 18500, m40: 29500, m45: 33500, hcUpgrade: 1200, connection: 1500, openedWall: 2200, cantilever: 3800, footing: 380, wideFrame: 1200, crane: 3200, engineering: 6500, labourRate: 55, margin: 0 },
    factory: { maxCut: 1.2, maxCantilever: 2.5, frameFraction: 0.5, cutHoursPerM: 1.5, frameWeldHours: 6 },
    structure: { roofQ: 0.75, floorQ: 1.5, balQ: 2.5, wind: 1.0, defl: 360, pad: 0.6, bearing: 100 },
    compliance: { guardBalcony: 1.1, guardStair: 0.9, maxGap: 100, escapeArea: 0.33, escapeSill: 1.1 },
    currency: { code: 'KES', symbol: 'KSh', rate: 129 },
    defaultBal: 'mesh',
    balustrades: {
      mesh: { label: 'Chain-link mesh', price: 240, on: true }, glass: { label: 'Frameless glass', price: 520, on: true },
      bars: { label: 'Vertical bars', price: 310, on: true }, cable: { label: 'Horizontal cable', price: 360, on: true },
      slats: { label: 'Timber slats', price: 280, on: true }, perf: { label: 'Perforated steel', price: 340, on: true },
      solid: { label: 'Solid steel plate', price: 300, on: true },
    },
  };
  const clone = o => JSON.parse(JSON.stringify(o));
  const merge = (a, b) => { for (const k in b) a[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) ? merge(a[k] && typeof a[k] === 'object' ? a[k] : {}, b[k]) : b[k]; return a; };
  let R = clone(DEFAULTS);
  const load = () => { R = clone(DEFAULTS); try { merge(R, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {} };
  load();
  const fns = [];
  const fire = () => fns.forEach(f => { try { f(R); } catch (e) { console.error(e); } });
  window.addEventListener('storage', e => { if (e.key === KEY) { load(); fire(); } });
  window.PlatformRules = {
    DEFAULTS: clone(DEFAULTS),
    get: () => R,
    set(patch) { merge(R, patch); try { localStorage.setItem(KEY, JSON.stringify(R)); } catch (e) {} fire(); },
    reset() { R = clone(DEFAULTS); try { localStorage.setItem(KEY, JSON.stringify(R)); } catch (e) {} fire(); },
    replace(obj) { R = merge(clone(DEFAULTS), obj || {}); try { localStorage.setItem(KEY, JSON.stringify(R)); } catch (e) {} fire(); },
    onChange(fn) { fns.push(fn); return () => fns.splice(fns.indexOf(fn), 1); },
  };
})();
