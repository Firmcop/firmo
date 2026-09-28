import { Opportunity, Sector, Country } from '@prisma/client';

export const PUBLIC_DISCLAIMERS = {
  model: 'Illustrative model based on stated assumptions. Returns are not guaranteed.',
  financing: 'Financing subject to applicant eligibility, financier credit assessment and final project documentation.',
};

type OppWithRefs = Opportunity & { sector: Sector; country: Country };

/**
 * Public serializer. Allow-list only: internal score, hard-stop details, author and workflow internals
 * are never emitted. Add fields here deliberately.
 */
export function toPublicOpportunity(o: OppWithRefs) {
  const capex = Number(o.capexKes), eq = Number(o.equityPct);
  return {
    id: o.id, slug: o.slug, name: o.name, summary: o.summary,
    sector: { slug: o.sector.slug, name: o.sector.name },
    country: { iso2: o.country.iso2, name: o.country.name },
    location: o.location, opportunityTypes: o.opportunityTypes,
    capacity: o.capacityLabel, factoryArea: o.factoryArea, market: o.marketLabel,
    indicativeCapexKes: capex, equityPct: eq, indicativeEquityKes: Math.round(capex * eq / 100),
    advantages: o.advantages, processSteps: o.processSteps, equipment: o.equipmentSummary,
    status: o.status, verificationLevel: o.verificationLevel,
    disclosures: o.disclosures, isDemo: o.isDemo,
    disclaimers: PUBLIC_DISCLAIMERS,
    publishedAt: o.publishedAt,
  };
}

export type PublicOpportunity = ReturnType<typeof toPublicOpportunity>;
