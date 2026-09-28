/** Build My Factory recommender. Pure: the API passes in published opportunities. Output is preliminary, not a feasibility study. */
export interface WizardAnswers {
  product: string;
  country: string;
  targetMarket: 'Kenya' | 'East Africa' | 'Africa' | 'Global';
  capitalBand: '1-5' | '5-10' | '10-20' | '20-50' | '50-100' | '100+';   // KES millions, own equity
  land: 'none' | '<0.5' | '0.5-2' | '>2';
  building: 'none' | '<500' | '500-2000' | '>2000';
  existingEquipment: 'none' | 'some' | 'full';
  rawMaterial: 'own' | 'contracted' | 'market' | 'unsure';
  capacity: 'pilot' | 'sme' | 'industrial' | 'recommend';
  financing: 'no' | 'partly' | 'majority' | 'unsure';
}

export interface WizardCandidate {
  id: string; slug: string; name: string; sector: string; keywords: string[];
  capexKesM: number; equityPct: number; equipment: string[]; factoryArea: string; capacityLabel: string;
}

const CAP_UPPER: Record<WizardAnswers['capitalBand'], number> = { '1-5': 5, '5-10': 10, '10-20': 20, '20-50': 50, '50-100': 100, '100+': 250 };
const FIN_MULT: Record<WizardAnswers['financing'], number> = { no: 1, partly: 1 / 0.6, majority: 1 / 0.3, unsure: 1 / 0.4 };
const SCALE: Record<WizardAnswers['capacity'], number> = { pilot: 0.5, sme: 1, industrial: 2, recommend: 1 };

export function recommendPath(a: WizardAnswers, candidates: WizardCandidate[]) {
  const budget = CAP_UPPER[a.capitalBand] * FIN_MULT[a.financing];
  const q = a.product.toLowerCase();
  const byKeyword = candidates.filter(c => c.keywords.some(k => q.includes(k.toLowerCase())));
  const rest = candidates.filter(c => !byKeyword.includes(c) && c.capexKesM <= budget).sort((x, y) => y.capexKesM - x.capexKesM);
  let matches = [...byKeyword, ...rest].slice(0, 3);
  if (!matches.length) matches = [...candidates].sort((x, y) => x.capexKesM - y.capexKesM).slice(0, 3);
  const primary = matches[0];
  const scale = SCALE[a.capacity];

  const research = ['Market demand & buyer validation', 'Import gap & landed-cost analysis', 'Competitor and price benchmarking'];
  if (a.rawMaterial === 'unsure' || a.rawMaterial === 'market') research.push('Raw material availability, price & seasonality study');
  if (a.targetMarket === 'Africa' || a.targetMarket === 'Global') research.push('Export market & trade corridor analysis');
  if (a.land === 'none') research.push('Site selection & industrial park options');
  if (a.building !== 'none') research.push('Structural & utilities survey of existing building');
  if (a.existingEquipment !== 'none') research.push('Condition assessment of existing equipment');

  const capexLow = primary ? primary.capexKesM * 0.85 * scale : 0;
  const capexHigh = primary ? primary.capexKesM * 1.25 * scale : 0;
  return {
    budgetKesM: Math.round(budget * 10) / 10,
    capexRangeKesM: [Math.round(capexLow * 10) / 10, Math.round(capexHigh * 10) / 10] as [number, number],
    exceedsBudget: capexLow > budget,
    plantSize: primary ? `${a.capacity === 'recommend' ? 'sme' : a.capacity} · ref. ${primary.capacityLabel}${scale !== 1 ? ` ×${scale}` : ''}` : null,
    factoryArea: primary?.factoryArea ?? null,
    matches: matches.map(m => ({ id: m.id, slug: m.slug, name: m.name, sector: m.sector, capexKesM: m.capexKesM, fitsBudget: m.capexKesM <= budget })),
    equipment: primary?.equipment ?? [],
    research,
    nextSteps: ['Scoping call with a FirmPlant analyst', 'Commission targeted market & resource research', 'Preliminary plant configuration & supplier RFQs', 'Financial model and financing pathway review'],
    disclaimer: 'Preliminary, indicative path — not a feasibility study. Ranges must be confirmed through research, engineering and supplier quotations.',
  };
}
