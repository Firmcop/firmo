import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { IS_PUBLIC } from './decorators';

export const SESSION_COOKIE = 'fp_session';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private reflector: Reflector, private auth: AuthService) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) req.user = await this.auth.resolve(token);
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;
    if (!req.user) throw new UnauthorizedException({ title: 'Authentication required' });
    if (req.user.mustChangePassword && !req.url.includes('/auth/')) throw new UnauthorizedException({ title: 'Password change required' });
    return true;
  }
}
