import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, HttpException, HttpStatus, PipeTransform } from '@nestjs/common';
import { ZodSchema, ZodError } from 'zod';
import { TransitionError } from '@firmplant/engines';

/** Validates request bodies/queries with zod. */
export class ZodPipe<T> implements PipeTransform {
  constructor(private schema: ZodSchema<T>) {}
  transform(value: unknown): T {
    const r = this.schema.safeParse(value);
    if (!r.success) throw new BadRequestException({ title: 'Validation failed', errors: r.error.flatten() });
    return r.data;
  }
}

/** RFC 7807 problem+json responses. */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  catch(ex: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    const req = host.switchToHttp().getRequest();
    let status = HttpStatus.INTERNAL_SERVER_ERROR, title = 'Internal error', detail: unknown;
    if (ex instanceof HttpException) {
      status = ex.getStatus();
      const body = ex.getResponse() as any;
      title = body?.title ?? body?.message ?? ex.message;
      detail = body?.errors ?? body?.detail;
    } else if (ex instanceof TransitionError) {
      status = HttpStatus.CONFLICT; title = ex.message;
    } else if (ex instanceof ZodError) {
      status = HttpStatus.BAD_REQUEST; title = 'Validation failed'; detail = ex.flatten();
    } else {
      console.error(ex);
    }
    res.status(status).type('application/problem+json').json({ type: 'about:blank', title, status, detail, instance: req.url, requestId: req.requestId });
  }
}

export const ref = (prefix: string) => `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, '0')}`;
