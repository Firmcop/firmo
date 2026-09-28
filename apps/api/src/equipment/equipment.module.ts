import { Body, Controller, Get, Module, NotFoundException, Param, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/decorators';
import { ZodPipe } from '../common/problem.filter';
import { AuditService } from '../audit/audit.module';
import { LeadsModule } from '../leads/leads.module';
import { LeadsService, EnquiryDto } from '../leads/leads.service';

const ListQuery = z.object({ category: z.string().optional(), supplierId: z.string().uuid().optional(), origin: z.string().optional(), q: z.string().max(120).optional(), limit: z.coerce.number().int().min(1).max(60).default(24) });

@Controller('equipment')
export class EquipmentController {
  constructor(private prisma: PrismaService, private leads: LeadsService) {}

  @Public() @Get()
  async list(@Query(new ZodPipe(ListQuery)) q: z.infer<typeof ListQuery>) {
    const rows = await this.prisma.equipment.findMany({
      where: {
        publicationStatus: 'PUBLISHED',
        ...(q.category && { category: q.category }), ...(q.supplierId && { supplierId: q.supplierId }), ...(q.origin && { origin: q.origin }),
        ...(q.q && { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { application: { contains: q.q, mode: 'insensitive' } }] }),
      },
      include: { supplier: { select: { id: true, name: true, status: true } } }, take: q.limit, orderBy: { name: 'asc' },
    });
    return rows.map(e => ({ ...e, priceMinKes: e.priceMinKes ? Number(e.priceMinKes) : null, priceMaxKes: e.priceMaxKes ? Number(e.priceMaxKes) : null, verification: e.supplier.status }));
  }

  @Public() @Get(':slug')
  async get(@Param('slug') slug: string) {
    const e = await this.prisma.equipment.findFirst({ where: { slug, publicationStatus: 'PUBLISHED' }, include: { supplier: { select: { id: true, name: true, status: true, serviceCoverage: true } } } });
    if (!e) throw new NotFoundException({ title: 'Equipment not found' });
    return e;
  }

  /** REQUEST QUOTE → lead + procurement task. */
  @Public() @Post(':slug/rfq-requests')
  async rfq(@Param('slug') slug: string, @Body(new ZodPipe(EnquiryDto)) dto: z.infer<typeof EnquiryDto>, @Req() req: any) {
    const e = await this.get(slug);
    return this.leads.createFromEnquiry({ source: 'EQUIPMENT_ENQUIRY', kind: 'equipment_rfq', equipmentId: e.id, opportunityName: e.name, dto, extra: { supplierId: e.supplierId } }, AuditService.meta(req));
  }
}

@Module({ imports: [LeadsModule], controllers: [EquipmentController] })
export class EquipmentModule {}
