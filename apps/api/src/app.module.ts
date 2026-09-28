import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { SessionGuard } from './auth/session.guard';
import { PermissionsGuard } from './auth/permissions.guard';
import { NotificationsModule } from './notifications/notifications.module';
import { OpportunitiesModule } from './opportunities/opportunities.module';
import { LeadsModule } from './leads/leads.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { EquipmentModule } from './equipment/equipment.module';
import { CalculatorsModule } from './calculators/calculators.module';
import { WizardModule } from './wizard/wizard.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule, AuditModule, NotificationsModule, AuthModule,
    OpportunitiesModule, LeadsModule, SuppliersModule, EquipmentModule, CalculatorsModule, WizardModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
