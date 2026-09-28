import { round2 } from './math';

export interface LandedCostInput {
  supplierPriceFob: number;
  freight: number;
  insurancePctOfCfr: number;       // e.g. 1.5
  dutyPctOfCif: number;            // from tariff table by HS code + country
  otherTaxesPctOfCif?: number;     // e.g. levies (IDF/RDL), excluding recoverable VAT
  vatPct?: number;
  includeVat?: boolean;            // default false: VAT applies to local and imported goods alike
  portCharges: number;
  clearance: number;
  inlandTransport: number;
  financingHandlingPctOfFob?: number;
}

export interface LandedCostLine { key: string; label: string; amount: number; }

export function landedCost(i: LandedCostInput) {
  const cfr = i.supplierPriceFob + i.freight;
  const insurance = cfr * i.insurancePctOfCfr / 100;
  const cif = cfr + insurance;
  const duty = cif * i.dutyPctOfCif / 100;
  const other = cif * (i.otherTaxesPctOfCif ?? 0) / 100;
  const vat = i.includeVat ? (cif + duty + other) * (i.vatPct ?? 0) / 100 : 0;
  const financing = i.supplierPriceFob * (i.financingHandlingPctOfFob ?? 0) / 100;
  const lines: LandedCostLine[] = [
    { key: 'fob', label: 'Supplier price (FOB)', amount: i.supplierPriceFob },
    { key: 'freight', label: 'Freight', amount: i.freight },
    { key: 'insurance', label: 'Insurance', amount: insurance },
    { key: 'duty', label: 'Duties', amount: duty },
    { key: 'otherTaxes', label: 'Other taxes & levies', amount: other },
    ...(i.includeVat ? [{ key: 'vat', label: 'VAT', amount: vat }] : []),
    { key: 'port', label: 'Port charges', amount: i.portCharges },
    { key: 'clearance', label: 'Clearance', amount: i.clearance },
    { key: 'inland', label: 'Inland transport', amount: i.inlandTransport },
    { key: 'financing', label: 'Financing & handling', amount: financing },
  ].map(l => ({ ...l, amount: round2(l.amount) }));
  const total = round2(lines.reduce((a, l) => a + l.amount, 0));
  return { cif: round2(cif), lines, total };
}

export type AdvantageVerdict = 'ADVANTAGE' | 'MARGINAL' | 'NO_ADVANTAGE';

/** Import vs local economics. thresholdPct = minimum cost advantage to count as defensible. */
export function importVsLocal(landedTotal: number, localCost: number, thresholdPct = 10) {
  const advantagePct = landedTotal > 0 ? (1 - localCost / landedTotal) * 100 : 0;
  const verdict: AdvantageVerdict = advantagePct >= thresholdPct ? 'ADVANTAGE' : advantagePct > 0 ? 'MARGINAL' : 'NO_ADVANTAGE';
  return { landedTotal, localCost, advantagePct: round2(advantagePct), verdict };
}
