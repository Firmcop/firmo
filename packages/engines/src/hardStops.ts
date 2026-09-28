/** Hard-stop (NO-GO) rules. Thresholds are loaded from the hard_stop_rules table at runtime. */
export interface HardStopFacts {
  annualDemandUnits: number;
  plantCapacityUnits: number;
  localCostVsLandedRatio: number;   // localCost / landedCost
  hasInputRoute: boolean;
  technologyAvailable: boolean;
  capex: number;
  regulatoryBarrier: boolean;
  baseMinDscr: number | null;
  hasQualityPathway: boolean;
}

export interface HardStopThresholds {
  minAnnualDemandUnits: number;
  maxMarketSharePct: number;        // plant capacity as % of demand
  maxLocalCostRatio: number;        // e.g. 1.0 → local must be ≤ landed
  maxCapex: number;
  minDscr: number;                  // e.g. 1.0 = structurally unfinanceable below this
}

export const DEFAULT_THRESHOLDS: HardStopThresholds = {
  minAnnualDemandUnits: 0,
  maxMarketSharePct: 35,
  maxLocalCostRatio: 1.0,
  maxCapex: Number.POSITIVE_INFINITY,
  minDscr: 1.0,
};

export type HardStopRule = 'DEMAND' | 'MARKET_ABSORPTION' | 'COST' | 'INPUT_ROUTE' | 'TECHNOLOGY' | 'CAPEX' | 'REGULATORY' | 'FINANCING' | 'QUALITY';

export function evaluateHardStops(f: HardStopFacts, t: HardStopThresholds = DEFAULT_THRESHOLDS) {
  const failures: { rule: HardStopRule; reason: string }[] = [];
  const fail = (rule: HardStopRule, reason: string) => failures.push({ rule, reason });
  if (f.annualDemandUnits <= t.minAnnualDemandUnits) fail('DEMAND', 'Demand insufficient');
  const share = f.annualDemandUnits > 0 ? f.plantCapacityUnits / f.annualDemandUnits * 100 : Infinity;
  if (share > t.maxMarketSharePct) fail('MARKET_ABSORPTION', `Plant capacity would require ${share.toFixed(0)}% of the market`);
  if (f.localCostVsLandedRatio > t.maxLocalCostRatio) fail('COST', 'Local production cost materially uncompetitive vs landed import');
  if (!f.hasInputRoute) fail('INPUT_ROUTE', 'No resource or input route');
  if (!f.technologyAvailable) fail('TECHNOLOGY', 'Technology unavailable');
  if (f.capex > t.maxCapex) fail('CAPEX', 'CAPEX unreasonable for opportunity class');
  if (f.regulatoryBarrier) fail('REGULATORY', 'Regulatory barrier');
  if (f.baseMinDscr !== null && f.baseMinDscr < t.minDscr) fail('FINANCING', 'Financing structurally impossible at base case');
  if (!f.hasQualityPathway) fail('QUALITY', 'Inadequate quality pathway');
  return { passed: failures.length === 0, verdict: failures.length ? 'NO_GO' as const : 'GO' as const, failures };
}
