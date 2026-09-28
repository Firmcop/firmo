import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.module';
import { AuthUser } from './decorators';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const TTL_H = Number(process.env.SESSION_TTL_HOURS ?? 168);

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async login(email: string, password: string, meta: { ip?: string; userAgent?: string; requestId?: string }) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    const ok = user && user.isActive && (await argon2.verify(user.passwordHash, password));
    if (!ok) {
      await this.audit.log({ action: 'auth.login_failed', entity: 'user', entityId: user?.id, after: { email }, ...meta });
      throw new UnauthorizedException({ title: 'Invalid credentials' });
    }
    // TODO(Phase 1b): if user.mfaEnabled, return a challenge and verify TOTP before issuing a session.
    const token = randomBytes(32).toString('base64url');
    await this.prisma.session.create({
      data: { userId: user.id, tokenHash: sha256(token), ip: meta.ip, userAgent: meta.userAgent, expiresAt: new Date(Date.now() + TTL_H * 3600_000) },
    });
    await this.audit.log({ userId: user.id, action: 'auth.login', entity: 'user', entityId: user.id, ...meta });
    return { token, mustChangePassword: user.mustChangePassword };
  }

  async resolve(token: string): Promise<AuthUser | null> {
    const s = await this.prisma.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: { include: { roles: { include: { role: true } } } } },
    });
    if (!s || s.revokedAt || s.expiresAt < new Date() || !s.user.isActive) return null;
    const roles = s.user.roles.map(r => r.role);
    return {
      id: s.user.id, email: s.user.email, name: s.user.name, organizationId: s.user.organizationId,
      roles: roles.map(r => r.key), permissions: [...new Set(roles.flatMap(r => r.permissions))], mustChangePassword: s.user.mustChangePassword,
    };
  }

  async logout(token: string) {
    await this.prisma.session.updateMany({ where: { tokenHash: sha256(token) }, data: { revokedAt: new Date() } });
  }

  async changePassword(userId: string, current: string, next: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await argon2.verify(user.passwordHash, current))) throw new ForbiddenException({ title: 'Current password incorrect' });
    if (next.length < 12) throw new ForbiddenException({ title: 'Password must be at least 12 characters' });
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await argon2.hash(next, { type: argon2.argon2id }), mustChangePassword: false } });
    await this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.log({ userId, action: 'auth.password_changed', entity: 'user', entityId: userId });
  }
}
