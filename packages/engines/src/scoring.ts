import { round2 } from './math';

/** Internal 100-point prioritisation score. NEVER exposed publicly. */
export const SCORE_DIMENSIONS = {
  demand: 15,
  resourceAdvantage: 15,
  productionEconomics: 15,
  globalRegionalMarket: 10,
  buyerValidation: 10,
  importSupplyChainAdvantage: 10,
  technologyFeasibility: 5,
  capexFeasibility: 5,
  exportLogistics: 5,
  regulatoryExecution: 5,
  strategicValue: 5,
} as const;

export type ScoreDimension = keyof typeof SCORE_DIMENSIONS;
export type ScoreInputs = Record<ScoreDimension, number>; // each 0..1

export function scoreOpportunity(inputs: ScoreInputs, weights: Record<ScoreDimension, number> = SCORE_DIMENSIONS) {
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  if (Math.abs(totalWeight - 100) > 1e-9) throw new Error(`weights must sum to 100 (got ${totalWeight})`);
  const breakdown = (Object.keys(weights) as ScoreDimension[]).map(dim => {
    const v = inputs[dim];
    if (v === undefined || v < 0 || v > 1) throw new Error(`score input ${dim} must be between 0 and 1`);
    return { dimension: dim, weight: weights[dim], input: v, points: round2(v * weights[dim]) };
  });
  return { total: round2(breakdown.reduce((a, b) => a + b.points, 0)), breakdown };
}
