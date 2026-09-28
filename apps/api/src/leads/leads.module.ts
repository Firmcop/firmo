import { Body, Controller, Get, Module, Param, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { LeadsService, EnquiryDto } from './leads.service';
import { AuthUser, CurrentUser, Public, RequirePermissions } from '../auth/decorators';
import { ZodPipe } from '../common/problem.filter';
import { AuditService } from '../audit/audit.module';

const Stage = z.enum(['NEW', 'QUALIFYING', 'QUALIFIED', 'OPPORTUNITY_SELECTED', 'FINANCING', 'ENGINEERING', 'QUOTED', 'WON', 'PROJECT', 'COMMISSIONING', 'OPERATING', 'LOST']);

@Controller()
export class LeadsController {
  constructor(private leads: LeadsService) {}

  /** General contact form. */
  @Public() @Post('contact')
  contact(@Body(new ZodPipe(EnquiryDto.extend({ interest: z.string().optional() }))) dto: any, @Req() req: any) {
    return this.leads.createFromEnquiry({ source: 'WEBSITE', kind: 'contact', dto, extra: { interest: dto.interest } }, AuditService.meta(req));
  }

  @RequirePermissions('lead:read:assigned') @Get('admin/leads')
  list(@CurrentUser() u: AuthUser, @Query('stage') stage?: string) { return this.leads.list(u, stage ? Stage.parse(stage) : undefined); }

  @Post('admin/leads/:id/transition')
  transition(@Param('id') id: string, @Body(new ZodPipe(z.object({ to: Stage, note: z.string().optional() }))) dto: any, @CurrentUser() u: AuthUser, @Req() req: any) {
    return this.leads.transition(id, dto.to, u, AuditService.meta(req), dto.note);
  }

  @RequirePermissions('lead:assign') @Post('admin/leads/:id/assign')
  assign(@Param('id') id: string, @Body(new ZodPipe(z.object({ assigneeId: z.string().uuid() }))) dto: any, @CurrentUser() u: AuthUser, @Req() req: any) {
    return this.leads.assign(id, dto.assigneeId, u, AuditService.meta(req));
  }
}

@Module({ controllers: [LeadsController], providers: [LeadsService], exports: [LeadsService] })
export class LeadsModule {}
