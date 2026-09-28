import { Body, Controller, Module, Param, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { recommendPath } from '@firmplant/engines';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/decorators';
import { ZodPipe } from '../common/problem.filter';
import { AuditService } from '../audit/audit.module';
import { LeadsModule } from '../leads/leads.module';
import { LeadsService, EnquiryDto } from '../leads/leads.service';

const Answers = z.object({
  product: z.string().min(1).max(200), country: z.string(),
  targetMarket: z.enum(['Kenya', 'East Africa', 'Africa', 'Global']),
  capitalBand: z.enum(['1-5', '5-10', '10-20', '20-50', '50-100', '100+']),
  land: z.enum(['none', '<0.5', '0.5-2', '>2']), building: z.enum(['none', '<500', '500-2000', '>2000']),
  existingEquipment: z.enum(['none', 'some', 'full']), rawMaterial: z.enum(['own', 'contracted', 'market', 'unsure']),
  capacity: z.enum(['pilot', 'sme', 'industrial', 'recommend']), financing: z.enum(['no', 'partly', 'majority', 'unsure']),
});

@Controller('wizard')
export class WizardController {
  constructor(private prisma: PrismaService, private leads: LeadsService) {}

  /** BUILD MY FACTORY → preliminary manufacturing path (stored for follow-up). */
  @Public() @Post('sessions')
  async create(@Body(new ZodPipe(Answers)) answers: z.infer<typeof Answers>) {
    const opps = await this.prisma.opportunity.findMany({ where: { publicationStatus: 'PUBLISHED' }, include: { sector: true } });
    const result = recommendPath(answers, opps.map(o => ({
      id: o.id, slug: o.slug, name: o.name, sector: o.sector.name, keywords: o.keywords,
      capexKesM: Number(o.capexKes) / 1e6, equityPct: Number(o.equityPct), equipment: o.equipmentSummary, factoryArea: o.factoryArea ?? '', capacityLabel: o.capacityLabel,
    })));
    const session = await this.prisma.wizardSession.create({ data: { answers: answers as any, result: result as any } });
    return { sessionId: session.id, ...result };
  }

  /** "Send to a FirmPlant analyst" */
  @Public() @Post('sessions/:id/lead')
  async toLead(@Param('id') id: string, @Body(new ZodPipe(EnquiryDto)) dto: z.infer<typeof EnquiryDto>, @Req() req: any) {
    const s = await this.prisma.wizardSession.findUniqueOrThrow({ where: { id } });
    const res = await this.leads.createFromEnquiry({ source: 'BUILD_MY_FACTORY', kind: 'wizard', dto, extra: { wizardSessionId: id, answers: s.answers } }, AuditService.meta(req));
    return res;
  }
}

@Module({ imports: [LeadsModule], controllers: [WizardController] })
export class WizardModule {}
