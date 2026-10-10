import {
  ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

type ErrorBody = { statusCode: number; error: string; message: string; path: string; timestamp: string };

/**
 * Normalises every thrown error into one JSON shape:
 *   { statusCode, error, message, path, timestamp }
 *
 * Also stops leaking internals. Without this, an unhandled Prisma error returns
 * raw SQL/table text, and a 500 returns a stack trace in dev. Both are useful to
 * an attacker mapping your schema. Unexpected errors are logged server-side with
 * the stack and returned to the client as a generic message.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error = 'Internal Server Error';

    // Redact sensitive patterns (passwords, tokens, bearer headers, otps) from logged strings
    const sanitizeLog = (str: string) =>
      str
        .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1[REDACTED]')
        .replace(/(password|token|secret|otp|authorization|data_url)=([^&\s]+)/gi, '$1=[REDACTED]')
        .replace(/"(password|token|secret|parentOtp|dataUrl|data_url)"\s*:\s*"[^"]+"/gi, '"$1":"[REDACTED]"');

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        message = payload;
      } else if (payload && typeof payload === 'object') {
        const p = payload as { message?: string | string[]; error?: string };
        // class-validator hands back an array of constraint messages
        message = Array.isArray(p.message) ? p.message.join('; ') : (p.message ?? exception.message);
        error = p.error ?? exception.name;
      }
    } else if (exception instanceof Error) {
      // Prisma and other driver errors land here.
      this.logger.error(
        sanitizeLog(`Unhandled: ${req.method} ${req.url} — ${exception.message}`),
        exception.stack ? sanitizeLog(exception.stack) : undefined,
      );
    } else {
      this.logger.error(sanitizeLog(`Unhandled non-Error: ${req.method} ${req.url} — ${String(exception)}`));
    }

    const safeMessage = sanitizeLog(message);
    if (status >= 500) {
      this.logger.error(`${req.method} ${req.url} → ${status}: ${safeMessage}`);
    } else {
      this.logger.warn(`${req.method} ${req.url} → ${status}: ${safeMessage}`);
    }

    const body: ErrorBody = {
      statusCode: status,
      error,
      message,
      path: req.url,
      timestamp: new Date().toISOString(),
    };

    res.status(status).json(body);
  }
}