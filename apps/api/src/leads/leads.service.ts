import { Injectable, NotFoundException } from '@nestjs/common';
import { LeadSource, LeadStage, Prisma } from '@prisma/client';
import { z } from 'zod';
import { assertTransition, LEAD_MACHINE } from '@firmplant/engines';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.module';
import { NotificationsService } from '../notifications/notifications.module';
import { AuthUser } from '../auth/decorators';
import { ref } from '../common/problem.filter';

export const EnquiryDto = z.object({
  name: z.string().min(2).max(120), company: z.string().max(160).optional(), email: z.string().email(), phone: z.string().max(40).optional(),
  country: z.string().max(60).optional(), investmentRange: z.string().optional(), availableEquity: z.string().optional(),
  preferredFinancing: z.string().optional(), experience: z.string().max(2000).optional(), factoryLocation: z.string().optional(),
  timeline: z.string().optional(), questions: z.string().max(4000).optional(), quantity: z.number().int().positive().optional(),
  consent: z.literal(true, { errorMap: () => ({ message: 'Consent to be contacted is required' }) }),
});
export type EnquiryInput = z.infer<typeof EnquiryDto>;

interface CreateLeadArgs {
  source: LeadSource; kind: 'opportunity' | 'equipment_rfq' | 'wizard' | 'contact';
  opportunityId?: string; opportunityName?: string; equipmentId?: string; dto: EnquiryInput; extra?: Record<string, unknown>;
}

@Injectable()
export class LeadsService {
  constructor(private prisma: PrismaService, private audit: AuditService, private notify: NotificationsService) {}

  /** Steps: create lead → create enquiry → assign → notify FirmPlant → confirm to customer → start qualification. */
  async createFromEnquiry(a: CreateLeadArgs, meta: any) {
    const { dto } = a;
    const notificationIds: string[] = [];
    const result = await this.prisma.$transaction(async tx => {
      const assigneeId = await this.pickAssignee(tx);
      const lead = await tx.lead.create({
        data: {
          reference: ref('FP-L'), source: a.source, stage: 'NEW', name: dto.name, company: dto.company, email: dto.email.toLowerCase(),
          phone: dto.phone, country: dto.country, investmentRange: dto.investmentRange, availableEquity: dto.availableEquity,
          preferredFinancing: dto.preferredFinancing, timeline: dto.timeline, notes: dto.questions, assigneeId, consentAt: new Date(),
        },
      });
      await tx.enquiry.create({ data: { leadId: lead.id, opportunityId: a.opportunityId, equipmentId: a.equipmentId, kind: a.kind, payload: { ...dto, ...a.extra } as any } });
      await tx.crmActivity.create({ data: { leadId: lead.id, type: 'assignment', body: assigneeId ? 'Auto-assigned (least open leads)' : 'Unassigned — no active sales user', meta: { assigneeId } } });
      await tx.crmActivity.create({ data: { leadId: lead.id, type: 'task', body: 'Qualification call within 2 business days', meta: { dueAt: new Date(Date.now() + 2 * 86400_000) } } });
      if (assigneeId) notificationIds.push((await this.notify.queue(tx, { userId: assigneeId, channel: 'in_app', template: 'lead.assigned', data: { leadId: lead.id, reference: lead.reference, subject: a.opportunityName } })).id);
      notificationIds.push((await this.notify.queue(tx, { channel: 'email', to: process.env.SALES_INBOX ?? 'sales@firmplant.local', template: 'lead.new', data: { reference: lead.reference, source: a.source, subject: a.opportunityName } })).id);
      notificationIds.push((await this.notify.queue(tx, { channel: 'email', to: lead.email, template: 'enquiry.confirmation', data: { name: lead.name, reference: lead.reference, subject: a.opportunityName } })).id);
      await this.audit.log({ ...meta, action: 'lead.create', entity: 'lead', entityId: lead.id, after: { reference: lead.reference, source: a.source, opportunityId: a.opportunityId } }, tx);
      return lead;
    });
    await this.notify.flush(notificationIds);
    return { reference: result.reference, status: 'received', nextSteps: ['CRM lead created', 'Assigned to a FirmPlant analyst', 'Confirmation sent to your email', 'Qualification call within 2 business days'] };
  }

  /** Round-robin by fewest open leads among active SALES users. */
  private async pickAssignee(tx: Prisma.TransactionClient) {
    const sales = await tx.user.findMany({ where: { isActive: true, roles: { some: { role: { key: 'SALES' } } } }, select: { id: true, _count: { select: { assignedLeads: { where: { stage: { notIn: ['WON', 'LOST', 'OPERATING'] } } } } } } });
    if (!sales.length) return null;
    return sales.sort((a, b) => a._count.assignedLeads - b._count.assignedLeads)[0].id;
  }

  list(user: AuthUser, stage?: LeadStage) {
    const onlyAssigned = !user.permissions.some(p => p === '*' || p === 'lead:*' || p === 'lead:read');
    return this.prisma.lead.findMany({
      where: { ...(stage && { stage }), ...(onlyAssigned && { assigneeId: user.id }) },
      orderBy: { createdAt: 'desc' }, take: 100, include: { enquiries: true, assignee: { select: { id: true, name: true } } },
    });
  }

  async transition(id: string, to: LeadStage, user: AuthUser, meta: any, note?: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException({ title: 'Lead not found' });
    assertTransition(LEAD_MACHINE, lead.stage, to, user.permissions);
    return this.prisma.$transaction(async tx => {
      const updated = await tx.lead.update({ where: { id }, data: { stage: to } });
      await tx.crmActivity.create({ data: { leadId: id, type: 'stage_change', body: note, meta: { from: lead.stage, to }, userId: user.id } });
      if (to === 'WON') await tx.project.create({ data: { reference: ref('FP-P'), name: `${lead.company ?? lead.name} project`, leadId: id } });
      await this.audit.log({ ...meta, action: 'lead.transition', entity: 'lead', entityId: id, before: { stage: lead.stage }, after: { stage: to } }, tx);
      return updated;
    });
  }

  async assign(id: string, assigneeId: string, user: AuthUser, meta: any) {
    const updated = await this.prisma.lead.update({ where: { id }, data: { assigneeId } });
    await this.prisma.crmActivity.create({ data: { leadId: id, type: 'assignment', meta: { assigneeId }, userId: user.id } });
    await this.audit.log({ ...meta, action: 'lead.assign', entity: 'lead', entityId: id, after: { assigneeId } });
    return updated;
  }
}
