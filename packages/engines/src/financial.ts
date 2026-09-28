import { amortize } from './financing';
import { irr, npv, round2, round4, sum, inputHash, ENGINE_VERSION } from './math';

export const CAPEX_LINES = ['land', 'civilWorks', 'building', 'machinery', 'utilities', 'installation', 'automation', 'engineering', 'commissioning', 'contingency'] as const;
export type CapexLine = typeof CAPEX_LINES[number];

export interface FinancialInputs {
  years: number;                         // projection horizon, e.g. 10
  capex: Record<CapexLine, number>;
  depreciationYears: number;             // straight line, excludes land
  revenue: {
    capacityUnitsPerYear: number;
    pricePerUnit: number;
    utilization: number;                 // 0..1 steady state
    rampUp?: number[];                   // multipliers for first years, e.g. [0.6, 0.85]
  };
  opex: {
    rawMaterialPerUnit: number;
    packagingPerUnit: number;
    logisticsPerUnit: number;
    labourPerYear: number;
    powerPerYear: number;
    waterPerYear: number;
    fuelPerYear: number;
    maintenancePctOfMachinery: number;   // 0..1
    overheadsPerYear: number;
  };
  workingCapitalMonths: number;          // of revenue
  financing: { equityPct: number; annualRatePct: number; tenureYears: number; graceMonths: number };
  taxRatePct: number;
  discountRatePct: number;
}

export interface YearRow {
  year: number; volume: number; revenue: number; cogs: number; grossProfit: number; ebitda: number;
  depreciation: number; ebit: number; interest: number; tax: number; workingCapitalChange: number;
  cfads: number; debtService: number; dscr: number | null; projectCashFlow: number; equityCashFlow: number;
}

export interface FinancialOutputs {
  engineVersion: string; inputHash: string;
  capexTotal: number; workingCapital: number; equity: number; debt: number;
  rows: YearRow[];
  summary: {
    steadyRevenue: number; steadyEbitda: number; grossMarginPct: number; ebitdaMarginPct: number;
    projectIrrPct: number | null; equityIrrPct: number | null; npv: number;
    paybackYears: number | null; minDscr: number | null; avgDscr: number | null;
    breakEvenUtilizationPct: number | null;
  };
}

export function runFinancialModel(inp: FinancialInputs): FinancialOutputs {
  const capexTotal = sum(CAPEX_LINES.map(k => inp.capex[k] || 0));
  const depreciable = capexTotal - (inp.capex.land || 0);
  const debt = capexTotal * (1 - inp.financing.equityPct / 100);
  const equity = capexTotal - debt;
  const loan = amortize({ principal: debt, annualRatePct: inp.financing.annualRatePct, tenureYears: inp.financing.tenureYears, graceMonths: inp.financing.graceMonths });
  const interestByYear = Array.from({ length: inp.years }, (_, y) => sum(loan.schedule.slice(y * 12, y * 12 + 12).map(m => m.interest)));
  const o = inp.opex, rv = inp.revenue, tax = inp.taxRatePct / 100;
  const varPerUnit = o.rawMaterialPerUnit + o.packagingPerUnit + o.logisticsPerUnit;
  const fixed = o.labourPerYear + o.powerPerYear + o.waterPerYear + o.fuelPerYear + o.overheadsPerYear + o.maintenancePctOfMachinery * (inp.capex.machinery || 0);

  const rows: YearRow[] = [];
  let prevWc = 0;
  for (let y = 1; y <= inp.years; y++) {
    const ramp = rv.rampUp?.[y - 1] ?? 1;
    const volume = rv.capacityUnitsPerYear * Math.min(1, rv.utilization * ramp);
    const revenue = volume * rv.pricePerUnit;
    const cogs = volume * (o.rawMaterialPerUnit + o.packagingPerUnit) + o.labourPerYear + o.powerPerYear + o.waterPerYear + o.fuelPerYear;
    const ebitda = revenue - volume * varPerUnit - fixed;
    const depreciation = y <= inp.depreciationYears ? depreciable / inp.depreciationYears : 0;
    const ebit = ebitda - depreciation;
    const interest = interestByYear[y - 1] || 0;
    const taxPaid = Math.max(0, ebit - interest) * tax;
    const wc = revenue * inp.workingCapitalMonths / 12;
    const dWc = wc - prevWc; prevWc = wc;
    const cfads = ebitda - taxPaid - dWc;
    const debtService = loan.annualDebtService[y - 1] || 0;
    const unleveredTax = Math.max(0, ebit) * tax;
    rows.push({
      year: y, volume, revenue, cogs, grossProfit: revenue - cogs, ebitda, depreciation, ebit, interest, tax: taxPaid,
      workingCapitalChange: dWc, cfads, debtService, dscr: debtService > 0 ? cfads / debtService : null,
      projectCashFlow: ebitda - unleveredTax - dWc, equityCashFlow: cfads - debtService,
    });
  }

  const projectFlows = [-capexTotal, ...rows.map(r => r.projectCashFlow)];
  const equityFlows = [-equity, ...rows.map(r => r.equityCashFlow)];
  let cum = -capexTotal, payback: number | null = null;
  for (const r of rows) {
    const next = cum + r.projectCashFlow;
    if (payback === null && next >= 0) payback = r.year - 1 + (-cum / r.projectCashFlow);
    cum = next;
  }
  const dscrs = rows.map(r => r.dscr).filter((d): d is number => d !== null);
  const steady = rows[rows.length - 1];
  const contribution = rv.pricePerUnit - varPerUnit;
  const pIrr = irr(projectFlows), eIrr = irr(equityFlows);

  const r2 = (r: YearRow): YearRow => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'number' && k !== 'year' ? (k === 'dscr' ? round4(v) : round2(v)) : v])) as unknown as YearRow;

  return {
    engineVersion: ENGINE_VERSION, inputHash: inputHash(inp),
    capexTotal: round2(capexTotal), workingCapital: round2(steady.revenue * inp.workingCapitalMonths / 12),
    equity: round2(equity), debt: round2(debt),
    rows: rows.map(r2),
    summary: {
      steadyRevenue: round2(steady.revenue), steadyEbitda: round2(steady.ebitda),
      grossMarginPct: steady.revenue ? round2(steady.grossProfit / steady.revenue * 100) : 0,
      ebitdaMarginPct: steady.revenue ? round2(steady.ebitda / steady.revenue * 100) : 0,
      projectIrrPct: pIrr === null ? null : round2(pIrr * 100),
      equityIrrPct: eIrr === null ? null : round2(eIrr * 100),
      npv: round2(npv(inp.discountRatePct / 100, projectFlows)),
      paybackYears: payback === null ? null : round2(payback),
      minDscr: dscrs.length ? round4(Math.min(...dscrs)) : null,
      avgDscr: dscrs.length ? round4(sum(dscrs) / dscrs.length) : null,
      breakEvenUtilizationPct: contribution > 0 ? round2(fixed / (rv.capacityUnitsPerYear * contribution) * 100) : null,
    },
  };
}

export type ScenarioKey = 'conservative' | 'base' | 'upside';
export interface ScenarioAdjustment { price: number; utilization: number; variableCost: number; capex: number; }

export const DEFAULT_SCENARIOS: Record<ScenarioKey, ScenarioAdjustment> = {
  conservative: { price: 0.95, utilization: 0.85, variableCost: 1.05, capex: 1.10 },
  base: { price: 1, utilization: 1, variableCost: 1, capex: 1 },
  upside: { price: 1.03, utilization: 1.10, variableCost: 0.97, capex: 1 },
};

export function applyScenario(inp: FinancialInputs, a: ScenarioAdjustment): FinancialInputs {
  const capex = Object.fromEntries(CAPEX_LINES.map(k => [k, (inp.capex[k] || 0) * a.capex])) as Record<CapexLine, number>;
  return {
    ...inp, capex,
    revenue: { ...inp.revenue, pricePerUnit: inp.revenue.pricePerUnit * a.price, utilization: Math.min(1, inp.revenue.utilization * a.utilization) },
    opex: {
      ...inp.opex,
      rawMaterialPerUnit: inp.opex.rawMaterialPerUnit * a.variableCost,
      packagingPerUnit: inp.opex.packagingPerUnit * a.variableCost,
      logisticsPerUnit: inp.opex.logisticsPerUnit * a.variableCost,
    },
  };
}

export function runScenarios(inp: FinancialInputs, adj: Record<ScenarioKey, ScenarioAdjustment> = DEFAULT_SCENARIOS) {
  return {
    conservative: runFinancialModel(applyScenario(inp, adj.conservative)),
    base: runFinancialModel(applyScenario(inp, adj.base)),
    upside: runFinancialModel(applyScenario(inp, adj.upside)),
    disclaimer: 'Illustrative model based on stated assumptions. Returns are not guaranteed.',
  };
}
