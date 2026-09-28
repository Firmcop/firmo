import { Body, Controller, Get, Module, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { AuthService } from './auth.service';
import { SessionGuard, SESSION_COOKIE } from './session.guard';
import { PermissionsGuard } from './permissions.guard';
import { AuthUser, CurrentUser, Public } from './decorators';
import { ZodPipe } from '../common/problem.filter';

const LoginDto = z.object({ email: z.string().email(), password: z.string().min(1) });
const ChangeDto = z.object({ current: z.string(), next: z.string().min(12) });

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public() @Throttle({ default: { limit: 10, ttl: 60_000 } }) @Post('login')
  async login(@Body(new ZodPipe(LoginDto)) dto: z.infer<typeof LoginDto>, @Req() req: any, @Res({ passthrough: true }) res: any) {
    const { token, mustChangePassword } = await this.auth.login(dto.email, dto.password, { ip: req.ip, userAgent: req.headers['user-agent'], requestId: req.requestId });
    res.cookie(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: Number(process.env.SESSION_TTL_HOURS ?? 168) * 3600_000 });
    return { ok: true, mustChangePassword };
  }

  @Post('logout')
  async logout(@Req() req: any, @Res({ passthrough: true }) res: any) {
    await this.auth.logout(req.cookies[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) { return user; }

  @Post('change-password')
  async change(@CurrentUser() user: AuthUser, @Body(new ZodPipe(ChangeDto)) dto: z.infer<typeof ChangeDto>) {
    await this.auth.changePassword(user.id, dto.current, dto.next);
    return { ok: true };
  }
}

@Module({ controllers: [AuthController], providers: [AuthService, SessionGuard, PermissionsGuard], exports: [AuthService] })
export class AuthModule {}
