import { Body, Controller, Get, Module, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { SCORE_DIMENSIONS } from '@firmplant/engines';
import { OpportunitiesService } from './opportunities.service';
import { AuthUser, CurrentUser, Public, RequirePermissions } from '../auth/decorators';
import { ZodPipe } from '../common/problem.filter';
import { AuditService } from '../audit/audit.module';
import { LeadsModule } from '../leads/leads.module';
import { LeadsService, EnquiryDto } from '../leads/leads.service';

const ListQuery = z.object({
  sector: z.string().optional(), country: z.string().length(2).optional(), type: z.string().optional(), q: z.string().max(120).optional(),
  maxEquityKes: z.coerce.number().positive().optional(), cursor: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(50).default(20),
});

const CreateDto = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/), name: z.string().min(3), summary: z.string().min(10),
  sectorId: z.string().uuid(), countryId: z.string().uuid(), location: z.string().optional(),
  opportunityTypes: z.array(z.string()).default([]), capacityLabel: z.string(), factoryArea: z.string().optional(), marketLabel: z.string().optional(),
  capexKes: z.number().positive(), equityPct: z.number().min(0).max(100),
  advantages: z.array(z.string()).default([]), processSteps: z.array(z.string()).default([]), equipmentSummary: z.array(z.string()).default([]), keywords: z.array(z.string()).default([]),
  disclosures: z.record(z.any()).optional(), isDemo: z.boolean().default(false),
});

const Facts = z.object({
  annualDemandUnits: z.number(), plantCapacityUnits: z.number(), localCostVsLandedRatio: z.number(), hasInputRoute: z.boolean(),
  technologyAvailable: z.boolean(), capex: z.number(), regulatoryBarrier: z.boolean(), baseMinDscr: z.number().nullable(), hasQualityPathway: z.boolean(),
});
const TransitionDto = z.object({ to: z.enum(['DISCOVERED', 'SCREENED', 'VALIDATING', 'ENGINEERING', 'MODELLING', 'FINANCE_READY', 'COMMERCIAL', 'RESERVED', 'IN_DEVELOPMENT', 'OPERATING', 'ARCHIVED', 'NO_GO']), facts: Facts.optional() });
const ApprovalDto = z.object({ stage: z.enum(['RESEARCH', 'TECHNICAL', 'FINANCIAL', 'COMMERCIAL', 'MANAGEMENT']), decision: z.enum(['APPROVED', 'CHANGES_REQUESTED', 'REJECTED']), notes: z.string().optional(), checklist: z.record(z.boolean()).optional() });
const ScoreDto = z.object(Object.fromEntries(Object.keys(SCORE_DIMENSIONS).map(k => [k, z.number().min(0).max(1)])) as Record<keyof typeof SCORE_DIMENSIONS, z.ZodNumber>);
const EvidenceDto = z.object({ claim: z.string(), value: z.string().optional(), unit: z.string().optional(), sourceId: z.string().uuid().optional(), sourceUrl: z.string().url().optional(), dataPeriod: z.string().optional(), collectedAt: z.coerce.date(), method: z.string().optional(), confidence: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM') });

@Controller('opportunities')
export class PublicOpportunitiesController {
  constructor(private svc: OpportunitiesService, private leads: LeadsService) {}

  @Public() @Get()
  list(@Query(new ZodPipe(ListQuery)) q: z.infer<typeof ListQuery>) { return this.svc.listPublic(q); }

  @Public() @Get(':slug')
  get(@Param('slug') slug: string) { return this.svc.getPublic(slug); }

  /** "I WANT THIS PLANT" */
  @Public() @Post(':slug/enquiries')
  async enquire(@Param('slug') slug: string, @Body(new ZodPipe(EnquiryDto)) dto: z.infer<typeof EnquiryDto>, @Req() req: any) {
    const opp = await this.svc.getPublic(slug);
    return this.leads.createFromEnquiry({ source: 'OPPORTUNITY_ENQUIRY', kind: 'opportunity', opportunityId: opp.id, opportunityName: opp.name, dto }, AuditService.meta(req));
  }
}

@Controller('admin/opportunities')
export class AdminOpportunitiesController {
  constructor(private svc: OpportunitiesService) {}

  @RequirePermissions('opportunity:read') @Get(':id')
  get(@Param('id') id: string) { return this.svc.getAdmin(id); }

  @RequirePermissions('opportunity:research') @Post()
  create(@Body(new ZodPipe(CreateDto)) dto: z.infer<typeof CreateDto>, @CurrentUser() u: AuthUser, @Req() req: any) { return this.svc.create(dto as any, u, AuditService.meta(req)); }

  @RequirePermissions('opportunity:research') @Patch(':id')
  update(@Param('id') id: string, @Body(new ZodPipe(CreateDto.partial())) dto: any, @Req() req: any) { return this.svc.update(id, dto, AuditService.meta(req)); }

  @Post(':id/transition')
  transition(@Param('id') id: string, @Body(new ZodPipe(TransitionDto)) dto: z.infer<typeof TransitionDto>, @CurrentUser() u: AuthUser, @Req() req: any) {
    return this.svc.transition(id, dto.to as any, u, AuditService.meta(req), dto.facts as any);
  }

  @Post(':id/approvals')
  approve(@Param('id') id: string, @Body(new ZodPipe(ApprovalDto)) dto: z.infer<typeof ApprovalDto>, @CurrentUser() u: AuthUser, @Req() req: any) {
    return this.svc.approve(id, dto.stage as any, dto.decision as any, dto.notes, dto.checklist, u, AuditService.meta(req));
  }

  @RequirePermissions('opportunity:publish') @Post(':id/publish')
  publish(@Param('id') id: string, @CurrentUser() u: AuthUser, @Req() req: any) { return this.svc.publish(id, u, AuditService.meta(req)); }

  @RequirePermissions('opportunity:score') @Post(':id/score')
  score(@Param('id') id: string, @Body(new ZodPipe(ScoreDto)) dto: any, @CurrentUser() u: AuthUser, @Req() req: any) { return this.svc.score(id, dto, u, AuditService.meta(req)); }

  @RequirePermissions('finance:model') @Post(':id/financial-models')
  saveModel(@Param('id') id: string, @Body() body: { inputs: any; notes?: string }, @CurrentUser() u: AuthUser, @Req() req: any) {
    return this.svc.saveModel(id, body.inputs, u, AuditService.meta(req), body.notes);
  }

  @RequirePermissions('opportunity:research') @Post(':id/evidence')
  evidence(@Param('id') id: string, @Body(new ZodPipe(EvidenceDto)) dto: any, @CurrentUser() u: AuthUser) { return this.svc.addEvidence(id, dto, u); }
}

@Module({ imports: [LeadsModule], controllers: [PublicOpportunitiesController, AdminOpportunitiesController], providers: [OpportunitiesService], exports: [OpportunitiesService] })
export class OpportunitiesModule {}
