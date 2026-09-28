import { describe, it, expect } from 'vitest';
import { toPublicOpportunity } from './opportunities/opportunity.mapper';

describe('public opportunity serializer', () => {
  const row: any = {
    id: 'o1', slug: 'x', name: 'X', summary: 's', sector: { slug: 'food', name: 'Food' }, country: { iso2: 'KE', name: 'Kenya' },
    location: 'Nakuru', opportunityTypes: [], capacityLabel: '1 t/h', factoryArea: '1 m²', marketLabel: 'KE',
    capexKes: 10_000_000, equityPct: 30, advantages: [], processSteps: [], equipmentSummary: [], status: 'COMMERCIAL',
    verificationLevel: 'DEMO', disclosures: {}, isDemo: true, publishedAt: null,
    // internal fields that must never leak:
    authorId: 'secret-user', hardStopFailures: [{ rule: 'COST' }], validationStatus: 'GO', scores: [{ total: 87 }],
  };
  const pub = toPublicOpportunity(row);
  it('computes indicative equity', () => expect(pub.indicativeEquityKes).toBe(3_000_000));
  it('never exposes internal score or workflow internals', () => {
    const json = JSON.stringify(pub);
    for (const k of ['authorId', 'hardStopFailures', 'validationStatus', 'scores', 'secret-user']) expect(json).not.toContain(k);
  });
  it('always carries disclaimers', () => expect(pub.disclaimers.financing).toMatch(/credit assessment/));
});
