/** Shared numeric helpers. Money is rounded only at output boundaries. */
export const ENGINE_VERSION = '0.1.0';

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;
export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Net present value; flows[0] is at t=0. */
export function npv(rate: number, flows: number[]): number {
  return flows.reduce((acc, f, t) => acc + f / Math.pow(1 + rate, t), 0);
}

/** IRR via Newton-Raphson with bisection fallback. Returns null when no sign change exists. */
export function irr(flows: number[], guess = 0.1): number | null {
  const hasPos = flows.some(f => f > 0), hasNeg = flows.some(f => f < 0);
  if (!hasPos || !hasNeg) return null;
  let r = guess;
  for (let i = 0; i < 50; i++) {
    const v = npv(r, flows);
    const d = flows.reduce((acc, f, t) => acc - (t * f) / Math.pow(1 + r, t + 1), 0);
    if (Math.abs(d) < 1e-12) break;
    const next = r - v / d;
    if (!isFinite(next) || next <= -0.99) break;
    if (Math.abs(next - r) < 1e-10) return next;
    r = next;
  }
  let lo = -0.99, hi = 10;
  if (npv(lo, flows) * npv(hi, flows) > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2, v = npv(mid, flows);
    if (Math.abs(v) < 1e-9) return mid;
    if (npv(lo, flows) * v < 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

/** Simple stable hash of engine inputs, stored alongside outputs for reproducibility. */
export function inputHash(obj: unknown): string {
  const stable = (v: unknown): string =>
    Array.isArray(v) ? '[' + v.map(stable).join(',') + ']'
    : v && typeof v === 'object' ? '{' + Object.keys(v as object).sort().map(k => JSON.stringify(k) + ':' + stable((v as Record<string, unknown>)[k])).join(',') + '}'
    : JSON.stringify(v);
  const s = stable(obj);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
