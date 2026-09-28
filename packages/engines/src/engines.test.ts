import { describe, it, expect } from 'vitest';
import { amortize, financingCalculator } from './financing';
import { irr, npv } from './math';
import { runFinancialModel, runScenarios, FinancialInputs } from './financial';
import { landedCost, importVsLocal } from './landedCost';
import { scoreOpportunity, SCORE_DIMENSIONS, ScoreInputs } from './scoring';
import { evaluateHardStops } from './hardStops';
import { assertTransition, allowedTransitions, OPPORTUNITY_MACHINE, SUPPLIER_MACHINE, hasPermission, TransitionError } from './workflow';

describe('math', () => {
  it('npv at 0% equals sum', () => expect(npv(0, [-100, 50, 60])).toBe(10));
  it('irr of [-100, 60, 60] ≈ 13.07%', () => expect(irr([-100, 60, 60])!).toBeCloseTo(0.130662, 5));
  it('irr returns null without sign change', () => expect(irr([100, 10])).toBeNull());
});

describe('amortize', () => {
  it('matches the standard annuity: 1,000,000 at 12% over 1 year', () => {
    const r = amortize({ principal: 1_000_000, annualRatePct: 12, tenureYears: 1, graceMonths: 0 });
    expect(r.monthlyPayment).toBeCloseTo(88848.79, 2);
    expect(r.schedule.at(-1)!.balance).toBeCloseTo(0, 2);
  });
  it('charges interest only during grace', () => {
    const r = amortize({ principal: 1_200_000, annualRatePct: 12, tenureYears: 2, graceMonths: 6 });
    expect(r.schedule[0].principal).toBe(0);
    expect(r.schedule[0].payment).toBeCloseTo(12000, 2);
    expect(r.schedule.at(-1)!.balance).toBeCloseTo(0, 2);
  });
  it('zero-rate loan divides evenly', () => {
    expect(amortize({ principal: 1200, annualRatePct: 0, tenureYears: 1, graceMonths: 0 }).monthlyPayment).toBe(100);
  });
  it('rejects grace ≥ tenure', () => {
    expect(() => amortize({ principal: 1, annualRatePct: 10, tenureYears: 1, graceMonths: 12 })).toThrow();
  });
});

describe('financingCalculator', () => {
  it('splits equity/debt and computes DSCR', () => {
    const r = financingCalculator({ projectCost: 10_000_000, equityPct: 30, annualRatePct: 14, tenureYears: 5, graceMonths: 0, annualEbitda: 3_000_000 });
    expect(r.equityRequired).toBe(3_000_000);
    expect(r.loanAmount).toBe(7_000_000);
    expect(r.dscr).toBeGreaterThan(1);
    expect(r.disclaimer).toMatch(/Illustrative/);
  });
});

const base: FinancialInputs = {
  years: 10,
  capex: { land: 5e6, civilWorks: 10e6, building: 15e6, machinery: 40e6, utilities: 5e6, installation: 3e6, automation: 2e6, engineering: 2e6, commissioning: 1e6, contingency: 4e6 },
  depreciationYears: 10,
  revenue: { capacityUnitsPerYear: 20_000, pricePerUnit: 62_000, utilization: 0.75, rampUp: [0.6, 0.85] },
  opex: { rawMaterialPerUnit: 38_000, packagingPerUnit: 1_500, logisticsPerUnit: 1_200, labourPerYear: 18e6, powerPerYear: 14e6, waterPerYear: 1e6, fuelPerYear: 3e6, maintenancePctOfMachinery: 0.03, overheadsPerYear: 12e6 },
  workingCapitalMonths: 2,
  financing: { equityPct: 30, annualRatePct: 14, tenureYears: 7, graceMonths: 12 },
  taxRatePct: 30,
  discountRatePct: 15,
};

describe('financial model', () => {
  const out = runFinancialModel(base);
  it('totals CAPEX and splits financing', () => {
    expect(out.capexTotal).toBe(87e6);
    expect(out.equity).toBeCloseTo(26.1e6, 0);
  });
  it('produces one row per year with ramp-up', () => {
    expect(out.rows).toHaveLength(10);
    expect(out.rows[0].volume).toBeLessThan(out.rows[2].volume);
  });
  it('break-even utilisation is consistent with fixed costs', () => {
    expect(out.summary.breakEvenUtilizationPct).toBeGreaterThan(0);
    expect(out.summary.breakEvenUtilizationPct).toBeLessThan(100);
  });
  it('scenarios are ordered conservative < base < upside', () => {
    const s = runScenarios(base);
    expect(s.conservative.summary.npv).toBeLessThan(s.base.summary.npv);
    expect(s.base.summary.npv).toBeLessThan(s.upside.summary.npv);
  });
  it('is deterministic (same input hash)', () => {
    expect(runFinancialModel(base).inputHash).toBe(out.inputHash);
  });
});

describe('landed cost', () => {
  it('builds up CIF, duty and extras', () => {
    const r = landedCost({ supplierPriceFob: 1000, freight: 120, insurancePctOfCfr: 1.5, dutyPctOfCif: 25, portCharges: 30, clearance: 20, inlandTransport: 85 });
    expect(r.cif).toBeCloseTo(1136.8, 2);
    expect(r.total).toBeCloseTo(1136.8 + 284.2 + 30 + 20 + 85, 2);
  });
  it('classifies advantage', () => {
    expect(importVsLocal(100, 85).verdict).toBe('ADVANTAGE');
    expect(importVsLocal(100, 95).verdict).toBe('MARGINAL');
    expect(importVsLocal(100, 105).verdict).toBe('NO_ADVANTAGE');
  });
});

describe('scoring', () => {
  const full = Object.fromEntries(Object.keys(SCORE_DIMENSIONS).map(k => [k, 1])) as ScoreInputs;
  it('max score is 100', () => expect(scoreOpportunity(full).total).toBe(100));
  it('rejects out-of-range inputs', () => expect(() => scoreOpportunity({ ...full, demand: 1.2 })).toThrow());
});

describe('hard stops', () => {
  const ok = { annualDemandUnits: 100_000, plantCapacityUnits: 15_000, localCostVsLandedRatio: 0.85, hasInputRoute: true, technologyAvailable: true, capex: 80e6, regulatoryBarrier: false, baseMinDscr: 1.4, hasQualityPathway: true };
  it('passes a viable opportunity', () => expect(evaluateHardStops(ok).verdict).toBe('GO'));
  it('NO-GO when local cost is uncompetitive', () => {
    const r = evaluateHardStops({ ...ok, localCostVsLandedRatio: 1.15 });
    expect(r.verdict).toBe('NO_GO');
    expect(r.failures.map(f => f.rule)).toContain('COST');
  });
  it('NO-GO when market cannot absorb capacity', () => {
    expect(evaluateHardStops({ ...ok, plantCapacityUnits: 60_000 }).failures.map(f => f.rule)).toContain('MARKET_ABSORPTION');
  });
});

describe('workflow', () => {
  it('supports wildcard permissions', () => {
    expect(hasPermission(['opportunity:*'], 'opportunity:approve:financial')).toBe(true);
    expect(hasPermission(['lead:read'], 'lead:write')).toBe(false);
  });
  it('blocks skipping research states', () => {
    expect(() => assertTransition(OPPORTUNITY_MACHINE, 'DISCOVERED', 'COMMERCIAL', ['*'])).toThrow(TransitionError);
  });
  it('suppliers cannot self-verify', () => {
    expect(() => assertTransition(SUPPLIER_MACHINE, 'UNDER_REVIEW', 'VERIFIED', ['supplier:self:submit'])).toThrow(TransitionError);
    expect(allowedTransitions(SUPPLIER_MACHINE, 'REGISTERED', ['supplier:self:submit'])).toEqual(['DOCUMENTATION_SUBMITTED']);
  });
});
