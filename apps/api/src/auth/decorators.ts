import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';
export const PERMISSIONS = 'permissions';

/** Route is reachable without a session (a session is still attached when present). */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Caller must hold ALL listed permissions. */
export const RequirePermissions = (...perms: string[]) => SetMetadata(PERMISSIONS, perms);

export interface AuthUser { id: string; email: string; name: string; organizationId: string | null; roles: string[]; permissions: string[]; mustChangePassword?: boolean; }
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser | undefined => ctx.switchToHttp().getRequest().user);
