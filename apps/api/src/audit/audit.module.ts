import { Global, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface AuditEntry {
  userId?: string | null; action: string; entity: string; entityId?: string | null;
  before?: unknown; after?: unknown; ip?: string; userAgent?: string; requestId?: string;
}

/** Only changed keys are stored in before/after. */
export function diff(before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  if (!before || !after) return { before, after };
  const b: Record<string, unknown> = {}, a: Record<string, unknown> = {};
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) { b[k] = before[k]; a[k] = after[k]; }
  }
  return { before: b, after: a };
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}
  async log(e: AuditEntry, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    await client.auditLog.create({
      data: {
        userId: e.userId ?? null, action: e.action, entity: e.entity, entityId: e.entityId ?? null,
        before: (e.before ?? undefined) as any, after: (e.after ?? undefined) as any,
        ip: e.ip, userAgent: e.userAgent, requestId: e.requestId,
      },
    });
  }
  static meta(req: any) {
    return { ip: req.ip, userAgent: req.headers?.['user-agent'], requestId: req.requestId, userId: req.user?.id ?? null };
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
