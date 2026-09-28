import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, OpportunityStatus, ApprovalStage, ApprovalDecision } from '@prisma/client';
import {
  assertTransition, OPPORTUNITY_MACHINE, APPROVAL_STAGES, APPROVAL_PERMISSION, hasPermission,
  evaluateHardStops, DEFAULT_THRESHOLDS, HardStopFacts, HardStopThresholds,
  scoreOpportunity, ScoreInputs, SCORE_DIMENSIONS,
  runScenarios, FinancialInputs, DEFAULT_SCENARIOS,
} from '@firmplant/engines';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, diff } from '../audit/audit.module';
import { AuthUser } from '../auth/decorators';
import { toPublicOpportunity } from './opportunity.mapper';

const RESEARCH_ORDER: OpportunityStatus[] = ['DISCOVERED', 'SCREENED', 'VALIDATING', 'ENGINEERING', 'MODELLING', 'FINANCE_READY', 'COMMERCIAL'];

export interface PublicFilters { sector?: string; country?: string; maxEquityKes?: number; type?: string; q?: string; cursor?: string; limit: number; }

@Injectable()
export class OpportunitiesService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  // ── Public ──
  async listPublic(f: PublicFilters) {
    const where: Prisma.OpportunityWhereInput = {
      publicationStatus: 'PUBLISHED',
      ...(f.sector && { sector: { slug: f.sector } }),
      ...(f.country && { country: { iso2: f.country.toUpperCase() } }),
      ...(f.type && { opportunityTypes: { has: f.type } }),
      ...(f.q && { OR: [{ name: { contains: f.q, mode: 'insensitive' } }, { summary: { contains: f.q, mode: 'insensitive' } }, { keywords: { has: f.q.toLowerCase() } }] }),
    };
    const rows = await this.prisma.opportunity.findMany({
      where, include: { sector: true, country: true }, orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
      take: f.limit + 1, ...(f.cursor && { cursor: { id: f.cursor }, skip: 1 }),
    });
    // Equity filter is derived (capex × equity%), applied after fetch.
    let items = rows.map(toPublicOpportunity);
    if (f.maxEquityKes) items = items.filter(o => o.indicativeEquityKes <= f.maxEquityKes!);
    const hasMore = items.length > f.limit;
    items = items.slice(0, f.limit);
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
  }

  async getPublic(slug: string) {
    const o = await this.prisma.opportunity.findFirst({
      where: { slug, publicationStatus: 'PUBLISHED' },
      include: { sector: true, country: true, resources: { include: { resource: true } }, financialModels: { orderBy: { version: 'desc' }, take: 1 } },
    });
    if (!o) throw new NotFoundException({ title: 'Opportunity not found' });
    const model = o.financialModels[0];
    return {
      ...toPublicOpportunity(o),
      resources: o.resources.map(r => ({ slug: r.resource.slug, material: r.resource.material, location: r.resource.location, seasonality: r.resource.seasonality })),
      financialModel: model ? { version: model.version, engineVersion: model.engineVersion, outputs: model.outputs, createdAt: model.createdAt } : null,
    };
  }

  // ── Admin ──
  async getAdmin(id: string) {
    const o = await this.prisma.opportunity.findUnique({
      where: { id },
      include: { sector: true, country: true, evidence: true, approvals: { orderBy: { createdAt: 'asc' } }, scores: { orderBy: { createdAt: 'desc' }, take: 1 }, financialModels: { orderBy: { version: 'desc' }, take: 1 } },
    });
    if (!o) throw new NotFoundException({ title: 'Opportunity not found' });
    return o;
  }

  async create(data: Prisma.OpportunityUncheckedCreateInput, user: AuthUser, meta: any) {
    const o = await this.prisma.opportunity.create({ data: { ...data, authorId: user.id, status: 'DISCOVERED', publicationStatus: 'DRAFT' } });
    await this.audit.log({ ...meta, action: 'opportunity.create', entity: 'opportunity', entityId: o.id, after: o });
    return o;
  }

  async update(id: string, data: Prisma.OpportunityUncheckedUpdateInput, meta: any) {
    const before = await this.getAdmin(id);
    if (before.publicationStatus === 'PUBLISHED') {
      // Material edits to a published record send it back through review.
      data.publicationStatus = 'IN_REVIEW';
    }
    const after = await this.prisma.opportunity.update({ where: { id }, data });
    await this.audit.log({ ...meta, action: 'opportunity.update', entity: 'opportunity', entityId: id, ...diff(before as any, after as any) });
    return after;
  }

  async transition(id: string, to: OpportunityStatus, user: AuthUser, meta: any, facts?: HardStopFacts) {
    const o = await this.getAdmin(id);
    assertTransition(OPPORTUNITY_MACHINE, o.status, to, user.permissions);

    const forward = RESEARCH_ORDER.indexOf(to) > RESEARCH_ORDER.indexOf(o.status) && RESEARCH_ORDER.indexOf(o.status) >= RESEARCH_ORDER.indexOf('SCREENED');
    let validation = {};
    if (forward) {
      if (!facts) throw new BadRequestException({ title: 'Hard-stop facts are required to advance beyond SCREENED' });
      const result = evaluateHardStops(facts, await this.thresholds());
      validation = { validationStatus: result.verdict === 'GO' ? 'GO' : 'NO_GO', hardStopFailures: result.failures };
      if (!result.passed) {
        const updated = await this.prisma.opportunity.update({ where: { id }, data: { ...validation, status: 'NO_GO' } as any });
        await this.audit.log({ ...meta, action: 'opportunity.no_go', entity: 'opportunity', entityId: id, before: { status: o.status }, after: { status: 'NO_GO', failures: result.failures } });
        return updated;
      }
    }
    if (to === 'FINANCE_READY' && !o.financialModels.length) throw new ConflictException({ title: 'A saved financial model with three scenarios is required' });

    const updated = await this.prisma.opportunity.update({ where: { id }, data: { status: to, ...validation } as any });
    await this.audit.log({ ...meta, action: 'opportunity.transition', entity: 'opportunity', entityId: id, before: { status: o.status }, after: { status: to } });
    return updated;
  }

  async approve(id: string, stage: ApprovalStage, decision: ApprovalDecision, notes: string | undefined, checklist: unknown, user: AuthUser, meta: any) {
    if (!hasPermission(user.permissions, APPROVAL_PERMISSION[stage])) throw new ForbiddenException({ title: `Missing ${APPROVAL_PERMISSION[stage]}` });
    const o = await this.getAdmin(id);
    if (o.authorId === user.id) throw new ForbiddenException({ title: 'Authors cannot approve their own opportunity' });
    const idx = APPROVAL_STAGES.indexOf(stage);
    const latest = (s: ApprovalStage) => [...o.approvals].reverse().find(a => a.stage === s);
    for (const prev of APPROVAL_STAGES.slice(0, idx)) {
      if (latest(prev)?.decision !== 'APPROVED') throw new ConflictException({ title: `${prev} approval must be completed first` });
    }
    const approval = await this.prisma.$transaction(async tx => {
      const a = await tx.opportunityApproval.create({ data: { opportunityId: id, stage, decision, notes, checklist: checklist as any, reviewerId: user.id } });
      await tx.opportunity.update({ where: { id }, data: { publicationStatus: decision === 'APPROVED' && stage === 'MANAGEMENT' ? 'APPROVED' : 'IN_REVIEW' } });
      await this.audit.log({ ...meta, action: 'opportunity.approval', entity: 'opportunity', entityId: id, after: { stage, decision, notes } }, tx);
      return a;
    });
    return approval;
  }

  async publish(id: string, user: AuthUser, meta: any) {
    const o = await this.getAdmin(id);
    if (o.publicationStatus !== 'APPROVED') throw new ConflictException({ title: 'All five approvals are required before publishing' });
    if (o.validationStatus === 'NO_GO') throw new ConflictException({ title: 'NO-GO opportunities cannot be published' });
    const d = (o.disclosures ?? {}) as Record<string, unknown>;
    const required = ['dataPeriod', 'researchDate', 'keyAssumptions', 'marketDataSource', 'equipmentQuotationStatus', 'supplierVerificationStatus'];
    const missing = required.filter(k => !d[k]);
    if (missing.length) throw new ConflictException({ title: 'Public disclosure fields missing', detail: { missing } });
    const updated = await this.prisma.opportunity.update({ where: { id }, data: { publicationStatus: 'PUBLISHED', publishedAt: new Date() } });
    await this.audit.log({ ...meta, action: 'opportunity.publish', entity: 'opportunity', entityId: id, after: { publishedAt: updated.publishedAt } });
    return updated;
  }

  async score(id: string, inputs: ScoreInputs, user: AuthUser, meta: any) {
    const r = scoreOpportunity(inputs);
    const s = await this.prisma.opportunityScore.create({ data: { opportunityId: id, inputs: inputs as any, breakdown: r.breakdown as any, total: r.total, weightsVersion: 'v1', createdById: user.id } });
    await this.audit.log({ ...meta, action: 'opportunity.score', entity: 'opportunity', entityId: id, after: { total: r.total } });
    return s;
  }

  async saveModel(id: string, inputs: FinancialInputs, user: AuthUser, meta: any, notes?: string) {
    const out = runScenarios(inputs);
    const last = await this.prisma.financialModel.findFirst({ where: { opportunityId: id }, orderBy: { version: 'desc' } });
    const m = await this.prisma.financialModel.create({
      data: { opportunityId: id, version: (last?.version ?? 0) + 1, engineVersion: out.base.engineVersion, inputHash: out.base.inputHash, assumptions: inputs as any, scenarioAdj: DEFAULT_SCENARIOS as any, outputs: out as any, notes, createdById: user.id },
    });
    await this.audit.log({ ...meta, action: 'financial_model.save', entity: 'opportunity', entityId: id, after: { version: m.version, inputHash: m.inputHash } });
    return m;
  }

  addEvidence(id: string, data: Omit<Prisma.OpportunityEvidenceUncheckedCreateInput, 'opportunityId' | 'createdById'>, user: AuthUser) {
    return this.prisma.opportunityEvidence.create({ data: { ...data, opportunityId: id, createdById: user.id } });
  }

  private async thresholds(): Promise<HardStopThresholds> {
    const rule = await this.prisma.hardStopRule.findFirst({ where: { scope: 'global', isActive: true }, orderBy: { version: 'desc' } });
    return { ...DEFAULT_THRESHOLDS, ...((rule?.thresholds as object) ?? {}) };
  }
}

export { SCORE_DIMENSIONS };
