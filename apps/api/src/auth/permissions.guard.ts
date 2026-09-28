import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasPermission } from '@firmplant/engines';
import { PERMISSIONS } from './decorators';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS, [ctx.getHandler(), ctx.getClass()]);
    if (!required?.length) return true;
    const user = ctx.switchToHttp().getRequest().user;
    const missing = required.filter(p => !hasPermission(user?.permissions ?? [], p));
    if (missing.length) throw new ForbiddenException({ title: 'Insufficient permissions', detail: { missing } });
    return true;
  }
}
