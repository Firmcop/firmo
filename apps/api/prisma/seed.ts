/* Development seed — ALL business records are DEMO (isDemo = true). Do not present as real market data. */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const ROLES: Record<string, string[]> = {
  SUPER_ADMIN: ['*'],
  ADMIN: ['opportunity:*', 'lead:*', 'supplier:*', 'finance:*', 'project:*', 'content:*', 'rfq:*', 'user:read', 'audit:read'],
  RESEARCH_ANALYST: ['opportunity:read', 'opportunity:research', 'opportunity:score', 'opportunity:approve:research', 'intel:*', 'content:write'],
  MARKET_ANALYST: ['opportunity:read', 'opportunity:research', 'intel:*'],
  PROCESS_ENGINEER: ['opportunity:read', 'opportunity:engineer', 'opportunity:approve:technical', 'engineering:*'],
  MECHANICAL_ENGINEER: ['opportunity:read', 'opportunity:engineer', 'engineering:*'],
  ELECTRICAL_ENGINEER: ['opportunity:read', 'opportunity:engineer', 'engineering:*'],
  FINANCIAL_ANALYST: ['opportunity:read', 'opportunity:finance', 'opportunity:approve:financial', 'finance:*'],
  PROCUREMENT_MANAGER: ['opportunity:read', 'supplier:verify', 'rfq:manage', 'equipment:*'],
  SALES: ['opportunity:read', 'opportunity:commercial', 'opportunity:approve:commercial', 'lead:read:assigned', 'lead:write'],
  PROJECT_MANAGER: ['opportunity:read', 'project:manage', 'asset:*'],
  MANAGEMENT: ['opportunity:read', 'opportunity:approve:management', 'opportunity:publish', 'opportunity:override', 'opportunity:archive', 'supplier:approve', 'lead:read', 'lead:assign'],
  SUPPLIER: ['supplier:self:submit', 'rfq:respond'],
  CUSTOMER: ['portal:customer'],
  FINANCIER: ['portal:financier'],
  SERVICE_ENGINEER: ['asset:service'],
};

const DEV_USERS = [
  ['admin@firmplant.dev', 'Dev Admin', 'SUPER_ADMIN'], ['analyst@firmplant.dev', 'Dev Analyst', 'RESEARCH_ANALYST'],
  ['engineer@firmplant.dev', 'Dev Engineer', 'PROCESS_ENGINEER'], ['finance@firmplant.dev', 'Dev Finance', 'FINANCIAL_ANALYST'],
  ['procurement@firmplant.dev', 'Dev Procurement', 'PROCUREMENT_MANAGER'], ['sales@firmplant.dev', 'Dev Sales', 'SALES'],
  ['management@firmplant.dev', 'Dev Management', 'MANAGEMENT'], ['customer@firmplant.dev', 'Dev Customer', 'CUSTOMER'],
] as const;

const SECTORS = ['Agriculture', 'Food Processing', 'Beverages', 'Packaging', 'Plastics', 'Construction Materials', 'Chemicals', 'Metals', 'Minerals', 'Textiles', 'Furniture', 'Recycling', 'Energy', 'Industrial Components', 'Automotive Components', 'Pharmaceuticals', 'Healthcare Manufacturing', 'Electronics', 'Consumer Products', 'Industrial Products'];
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const DEMO_DISCLOSURES = {
  dataPeriod: '2021–2025 (DEMO)', researchDate: '2026-09 (DEMO)', keyAssumptions: '75% utilisation, 2 shifts, KES/USD 129',
  marketDataSource: 'DEMO placeholder — trade adapter not yet connected', equipmentQuotationStatus: 'Indicative (DEMO)', supplierVerificationStatus: 'See supplier record',
};

const OPPS = [
  { slug: 'animal-feed-plant-5tph', name: '5 TPH Animal Feed Plant', sector: 'Agriculture', location: 'Nakuru', capacity: '5 tonnes/hour', capex: 85e6, eq: 30, area: '2,400 m²', market: 'Kenya + East Africa', types: ['Import Gap', 'Resource Advantage'], status: 'COMMERCIAL', kw: ['feed', 'poultry', 'dairy'], equip: ['Hammer mill 7.5 t/h', 'Batch mixer 2 t', 'Pellet mill 5 t/h', 'Counterflow cooler', 'Bagging line'], steps: ['Intake', 'Cleaning', 'Grinding', 'Batching', 'Mixing', 'Pelleting', 'Cooling', 'Bagging', 'Dispatch'] },
  { slug: 'fruit-pulp-line-2tph', name: '2 TPH Fruit Pulp & Purée Line', sector: 'Food Processing', location: 'Makueni', capacity: '2 tonnes/hour', capex: 32e6, eq: 30, area: '900 m²', market: 'Kenya + Middle East', types: ['Resource Advantage', 'Export'], status: 'FINANCE_READY', kw: ['fruit', 'mango', 'puree', 'pulp', 'juice'], equip: ['Washer & sorting', 'Pulper 2 t/h', 'Tubular sterilizer', 'Aseptic filler', 'CIP'], steps: ['Receiving', 'Washing', 'Sorting', 'Destoning', 'Refining', 'Sterilisation', 'Aseptic fill'] },
  { slug: 'maize-flour-mill-2tph', name: '2 TPH Maize Flour Mill', sector: 'Food Processing', location: 'Eldoret', capacity: '2 tonnes/hour', capex: 9.5e6, eq: 25, area: '600 m²', market: 'Kenya', types: ['Resource Advantage'], status: 'COMMERCIAL', kw: ['maize', 'flour', 'mill', 'grain'], equip: ['Pre-cleaner', 'Degerminator', 'Roller mills', 'Plansifter', 'Auto packer'], steps: ['Intake', 'Cleaning', 'Conditioning', 'Degerming', 'Milling', 'Sifting', 'Packing'] },
  { slug: 'pet-preform-injection', name: 'PET Preform Injection Plant', sector: 'Plastics', location: 'Athi River', capacity: '45M preforms/yr', capex: 48e6, eq: 35, area: '1,200 m²', market: 'Kenya + Uganda', types: ['Import Gap', 'Industrial Input'], status: 'COMMERCIAL', kw: ['pet', 'preform', 'bottle', 'plastic'], equip: ['Injection machine 350 t', 'Resin dryer', 'Chiller', 'Vision inspection', 'Compressor'], steps: ['Drying', 'Injection', 'Cooling', 'Inspection', 'Boxing'] },
  { slug: 'paver-block-plant', name: 'Paver & Block Plant', sector: 'Construction Materials', location: 'Kajiado', capacity: '8,000 pavers/day', capex: 12e6, eq: 30, area: '3,000 m² yard', market: 'Kenya', types: ['Local Demand', 'Logistics'], status: 'COMMERCIAL', kw: ['paver', 'block', 'construction', 'cement'], equip: ['Block machine', 'Pan mixer', 'Batching plant', 'Forklift'], steps: ['Batching', 'Mixing', 'Pressing', 'Curing', 'Dispatch'] },
];

async function main() {
  const region = await prisma.region.upsert({ where: { name: 'East Africa' }, update: {}, create: { name: 'East Africa' } });
  const countries = [['KE', 'Kenya', 'KES', true], ['UG', 'Uganda', 'UGX', false], ['TZ', 'Tanzania', 'TZS', false], ['RW', 'Rwanda', 'RWF', false], ['ET', 'Ethiopia', 'ETB', false]] as const;
  for (const [iso2, name, currency, isActive] of countries) {
    await prisma.country.upsert({ where: { iso2 }, update: {}, create: { iso2, name, currency, isActive, regionId: region.id } });
  }
  const kenya = await prisma.country.findUniqueOrThrow({ where: { iso2: 'KE' } });
  for (const s of SECTORS) await prisma.sector.upsert({ where: { slug: slugify(s) }, update: {}, create: { slug: slugify(s), name: s } });

  for (const [key, permissions] of Object.entries(ROLES)) {
    await prisma.role.upsert({ where: { key }, update: { permissions }, create: { key, name: key.replace(/_/g, ' '), permissions } });
  }
  const devPassword = await argon2.hash('ChangeMe-Dev-2026!', { type: argon2.argon2id });
  for (const [email, name, roleKey] of DEV_USERS) {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    await prisma.user.upsert({ where: { email }, update: {}, create: { email, name, passwordHash: devPassword, mustChangePassword: true, roles: { create: { roleId: role.id } } } });
  }
  const author = await prisma.user.findUniqueOrThrow({ where: { email: 'analyst@firmplant.dev' } });

  if (!(await prisma.hardStopRule.findFirst({ where: { scope: 'global' } }))) await prisma.hardStopRule.create({ data: { scope: 'global', version: 1, thresholds: { maxMarketSharePct: 35, maxLocalCostRatio: 1.0, minDscr: 1.0 } } });

  for (const o of OPPS) {
    const sector = await prisma.sector.findUniqueOrThrow({ where: { slug: slugify(o.sector) } });
    await prisma.opportunity.upsert({
      where: { slug: o.slug }, update: {},
      create: {
        slug: o.slug, name: o.name, summary: `DEMO — ${o.name} in ${o.location}.`, sectorId: sector.id, countryId: kenya.id, location: o.location,
        opportunityTypes: o.types, capacityLabel: o.capacity, factoryArea: o.area, marketLabel: o.market, capexKes: o.capex, equityPct: o.eq,
        advantages: ['DEMO advantage statement — replace with sourced research.'], processSteps: o.steps, equipmentSummary: o.equip, keywords: o.kw,
        status: o.status as any, validationStatus: 'GO', publicationStatus: 'PUBLISHED', publishedAt: new Date(), verificationLevel: 'DEMO',
        disclosures: DEMO_DISCLOSURES, isDemo: true, authorId: author.id,
      },
    });
  }

  const suppliers = [
    ['Rift Agro Engineering', 'Kenya', ['Feed mills', 'Grain handling'], 'APPROVED'],
    ['Lakeside Process Ltd', 'Uganda', ['Mixing', 'Packaging'], 'QUALIFIED'],
    ['Coast Polymer Machinery', 'Kenya', ['Injection', 'Recycling'], 'VERIFIED'],
    ['Aqualine EA', 'Kenya', ['Water treatment'], 'DOCUMENTATION_SUBMITTED'],
  ] as const;
  for (const [name, country, caps, status] of suppliers) {
    const exists = await prisma.supplier.findFirst({ where: { name } });
    if (exists) continue;
    const org = await prisma.organization.create({ data: { name, type: 'SUPPLIER' } });
    const s = await prisma.supplier.create({ data: { organizationId: org.id, name, country, capabilities: [...caps], status: status as any, isDemo: true, serviceCoverage: ['KE'] } });
    if (name === 'Rift Agro Engineering') {
      await prisma.equipment.createMany({ data: [
        { slug: 'pellet-mill-5tph-demo', name: 'Pellet Mill 5 t/h', category: 'Milling', manufacturer: 'DEMO Maker', model: 'KPM-520', capacity: '4–6 t/h', power: '132 kW', supplierId: s.id, priceMinKes: 6.5e6, priceMaxKes: 8.2e6, isDemo: true, publicationStatus: 'PUBLISHED' },
        { slug: 'hammer-mill-7-5tph-demo', name: 'Hammer Mill 7.5 t/h', category: 'Milling', manufacturer: 'DEMO Maker', model: 'KHM-75', capacity: '7.5 t/h', power: '90 kW', supplierId: s.id, priceMinKes: 2.8e6, priceMaxKes: 3.6e6, isDemo: true, publicationStatus: 'PUBLISHED' },
      ] });
    }
  }
  console.log('Seed complete. Dev password for all dev users: ChangeMe-Dev-2026! (change required on first login)');
}

main().finally(() => prisma.$disconnect());
