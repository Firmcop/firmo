import { Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Post, Query, Req } from '@nestjs/common';
import { SupplierStatus } from '@prisma/client';
import { z } from 'zod';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { assertTransition, SUPPLIER_MACHINE } from '@firmplant/engines';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.module';
import { NotificationsService } from '../notifications/notifications.module';
import { AuthUser, CurrentUser, Public, RequirePermissions } from '../auth/decorators';
import { ZodPipe, ref } from '../common/problem.filter';

const RegisterDto = z.object({
  companyName: z.string().min(2), contactName: z.string().min(2), email: z.string().email(), phone: z.string().optional(), country: z.string(),
  type: z.enum(['OEM', 'DISTRIBUTOR', 'FABRICATOR', 'SERVICE']), yearsOperating: z.number().int().min(0).optional(),
  capabilities: z.array(z.string()).default([]), serviceCoverage: z.array(z.string()).default([]), notes: z.string().max(4000).optional(),
});
const StatusEnum = z.enum(['REGISTERED', 'DOCUMENTATION_SUBMITTED', 'UNDER_REVIEW', 'VERIFIED', 'QUALIFIED', 'APPROVED', 'SUSPENDED']);
const VerifyDto = z.object({ to: StatusEnum, notes: z.string().optional(), criteria: z.record(z.object({ score: z.number().min(0).max(5), note: z.string().optional() })).optional() });

const PUBLIC_STATUSES: SupplierStatus[] = ['REGISTERED', 'DOCUMENTATION_SUBMITTED', 'UNDER_REVIEW', 'VERIFIED', 'QUALIFIED', 'APPROVED'];

@Injectable()
export class SuppliersService {
  constructor(private prisma: PrismaService, private audit: AuditService, private notify: NotificationsService) {}

  async listPublic(status?: SupplierStatus) {
    const rows = await this.prisma.supplier.findMany({ where: { status: status ?? { in: PUBLIC_STATUSES } }, orderBy: [{ status: 'desc' }, { name: 'asc' }] });
    return rows.map(s => ({ id: s.id, name: s.name, country: s.country, capabilities: s.capabilities, yearsOperating: s.yearsOperating, installedBase: s.installedBase, serviceCoverage: s.serviceCoverage, status: s.status, isDemo: s.isDemo }));
  }

  /** Self-registration always starts at REGISTERED; status cannot be supplied by the caller. */
  async register(dto: z.infer<typeof RegisterDto>, meta: any) {
    const tempPassword = randomBytes(12).toString('base64url');
    const ids: string[] = [];
    const s = await this.prisma.$transaction(async tx => {
      const org = await tx.organization.create({ data: { name: dto.companyName, type: 'SUPPLIER' } });
      const role = await tx.role.findUniqueOrThrow({ where: { key: 'SUPPLIER' } });
      await tx.user.create({ data: { email: dto.email.toLowerCase(), name: dto.contactName, phone: dto.phone, organizationId: org.id, passwordHash: await argon2.hash(tempPassword, { type: argon2.argon2id }), mustChangePassword: true, roles: { create: { roleId: role.id } } } });
      const supplier = await tx.supplier.create({ data: { organizationId: org.id, name: dto.companyName, country: dto.country, capabilities: dto.capabilities, yearsOperating: dto.yearsOperating, serviceCoverage: dto.serviceCoverage, status: 'REGISTERED' } });
      ids.push((await this.notify.queue(tx, { channel: 'email', to: dto.email, template: 'supplier.registered', data: { company: dto.companyName, portalUrl: `${process.env.PUBLIC_WEB_ORIGIN}/portal`, tempPassword } })).id);
      ids.push((await this.notify.queue(tx, { channel: 'email', to: process.env.PROCUREMENT_INBOX ?? 'procurement@firmplant.local', template: 'supplier.new', data: { company: dto.companyName, country: dto.country } })).id);
      await this.audit.log({ ...meta, action: 'supplier.register', entity: 'supplier', entityId: supplier.id, after: { name: supplier.name, status: supplier.status } }, tx);
      return supplier;
    });
    await this.notify.flush(ids);
    return { reference: ref('FP-S'), supplierId: s.id, status: s.status };
  }

  /** Supplier submits documentation (own record only). */
  async submitDocs(user: AuthUser, meta: any) {
    const s = await this.prisma.supplier.findFirst({ where: { organizationId: user.organizationId ?? '' } });
    if (!s) throw new NotFoundException({ title: 'Supplier record not found' });
    return this.move(s.id, 'DOCUMENTATION_SUBMITTED', user, meta);
  }

  async move(id: string, to: SupplierStatus, user: AuthUser, meta: any, notes?: string, criteria?: unknown) {
    const s = await this.prisma.supplier.findUnique({ where: { id } });
    if (!s) throw new NotFoundException({ title: 'Supplier not found' });
    if (user.roles.includes('SUPPLIER') && to !== 'DOCUMENTATION_SUBMITTED') throw new ForbiddenException({ title: 'Suppliers cannot assign verification status' });
    assertTransition(SUPPLIER_MACHINE, s.status, to, user.permissions);
    return this.prisma.$transaction(async tx => {
      const updated = await tx.supplier.update({ where: { id }, data: { status: to } });
      await tx.supplierVerification.create({ data: { supplierId: id, fromStatus: s.status, toStatus: to, notes, criteria: criteria as any, reviewerId: user.id } });
      await this.audit.log({ ...meta, action: 'supplier.status', entity: 'supplier', entityId: id, before: { status: s.status }, after: { status: to, notes } }, tx);
      return updated;
    });
  }
}

@Controller()
export class SuppliersController {
  constructor(private svc: SuppliersService) {}

  @Public() @Get('suppliers')
  list(@Query('status') status?: string) { return this.svc.listPublic(status ? StatusEnum.parse(status) as SupplierStatus : undefined); }

  @Public() @Post('suppliers/register')
  register(@Body(new ZodPipe(RegisterDto)) dto: z.infer<typeof RegisterDto>, @Req() req: any) { return this.svc.register(dto, AuditService.meta(req)); }

  @RequirePermissions('supplier:self:submit') @Post('portal/supplier/submit')
  submit(@CurrentUser() u: AuthUser, @Req() req: any) { return this.svc.submitDocs(u, AuditService.meta(req)); }

  @RequirePermissions('supplier:verify') @Post('admin/suppliers/:id/verify')
  verify(@Param('id') id: string, @Body(new ZodPipe(VerifyDto)) dto: z.infer<typeof VerifyDto>, @CurrentUser() u: AuthUser, @Req() req: any) {
    return this.svc.move(id, dto.to as SupplierStatus, u, AuditService.meta(req), dto.notes, dto.criteria);
  }
}

@Module({ controllers: [SuppliersController], providers: [SuppliersService] })
export class SuppliersModule {}
