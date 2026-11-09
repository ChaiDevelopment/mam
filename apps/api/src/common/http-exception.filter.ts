import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import type { ApiErrorBody } from '@mam/shared-types';
import { env } from '../config/env';

/** Consistent error envelope. Never leaks stack traces or internal messages in production. */
const titleCase = (s: string) => s.toLowerCase().split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
const statusName = (status: number) => (HttpStatus[status] ? titleCase(HttpStatus[status]) : 'Error');

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { requestId?: string }>();
    const body = this.toBody(exception);
    body.requestId = req.requestId;

    if (body.statusCode >= 500) {
      this.logger.error(
        `${req.method} ${req.originalUrl} -> ${body.statusCode} [${req.requestId}] ${exception instanceof Error ? exception.stack : String(exception)}`,
      );
    }
    if (res.headersSent) return;
    res.status(body.statusCode).json(body);
  }

  private toBody(e: unknown): ApiErrorBody {
    if (e instanceof HttpException) {
      const status = e.getStatus();
      const r = e.getResponse();
      if (typeof r === 'string') return { statusCode: status, error: statusName(status), message: r };
      const obj = r as { message?: string | string[]; details?: unknown; error?: string };
      const message = Array.isArray(obj.message) ? obj.message.join('; ') : (obj.message ?? e.message);
      return { statusCode: status, error: obj.error ?? statusName(status), message, details: obj.details };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') return { statusCode: 409, error: 'Conflict', message: 'Data sudah ada.' };
      if (e.code === 'P2025') return { statusCode: 404, error: 'Not Found', message: 'Data tidak ditemukan.' };
    }
    const isProd = env().NODE_ENV === 'production';
    return {
      statusCode: 500,
      error: 'Internal Server Error',
      message: isProd || !(e instanceof Error) ? 'Terjadi kesalahan pada server. Silakan coba lagi.' : e.message,
    };
  }
}
