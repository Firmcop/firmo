import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Channel adapter interface — swap console for a real provider via env without touching callers. */
export interface ChannelAdapter { send(to: string, template: string, data: Record<string, unknown>): Promise<void>; }

class ConsoleAdapter implements ChannelAdapter {
  private log = new Logger('Notify');
  constructor(private channel: string) {}
  async send(to: string, template: string, data: Record<string, unknown>) { this.log.log(`[${this.channel}] → ${to} :: ${template} ${JSON.stringify(data)}`); }
}

function adapterFor(channel: 'email' | 'sms' | 'whatsapp'): ChannelAdapter {
  const provider = process.env[`${channel.toUpperCase()}_PROVIDER`] ?? 'console';
  switch (provider) {
    // case 'postmark': return new PostmarkAdapter(...);  — add real providers here
    default: return new ConsoleAdapter(channel);
  }
}

@Injectable()
export class NotificationsService {
  private adapters = { email: adapterFor('email'), sms: adapterFor('sms'), whatsapp: adapterFor('whatsapp') };
  constructor(private prisma: PrismaService) {}

  /** Records the notification in the same transaction as the business write. Delivery happens after commit. */
  async queue(tx: Prisma.TransactionClient, n: { userId?: string; channel: 'email' | 'sms' | 'whatsapp' | 'in_app'; to?: string; template: string; data: Record<string, unknown> }) {
    return tx.notification.create({ data: { userId: n.userId, channel: n.channel, to: n.to, template: n.template, data: n.data as any } });
  }

  /** Delivers queued notifications. Phase 3: move to a BullMQ worker with retries. */
  async flush(ids: string[]) {
    const items = await this.prisma.notification.findMany({ where: { id: { in: ids }, status: 'QUEUED' } });
    for (const n of items) {
      try {
        if (n.channel !== 'in_app' && n.to) await this.adapters[n.channel as 'email' | 'sms' | 'whatsapp'].send(n.to, n.template, n.data as any);
        await this.prisma.notification.update({ where: { id: n.id }, data: { status: n.channel === 'in_app' ? 'UNREAD' : 'SENT', sentAt: new Date() } });
      } catch (e) {
        await this.prisma.notification.update({ where: { id: n.id }, data: { status: 'FAILED' } });
      }
    }
  }
}

@Global()
@Module({ providers: [NotificationsService], exports: [NotificationsService] })
export class NotificationsModule {}
