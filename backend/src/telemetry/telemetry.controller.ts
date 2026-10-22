import { Body, Controller, HttpCode, Logger, Module, PayloadTooLargeException, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { AlertingService } from '../common/alerting';

/** Hard cap on the raw request size (the global JSON limit is 8 MB for document uploads). */
const MAX_BYTES = 16 * 1024;

export class ClientErrorDto {
  @IsString() @IsNotEmpty() @MaxLength(2000)
  message!: string;

  @IsOptional() @IsString() @MaxLength(120)
  name?: string;

  @IsOptional() @IsString() @MaxLength(8000)
  stack?: string;

  @IsOptional() @IsString() @MaxLength(200)
  digest?: string;

  @IsOptional() @IsString() @MaxLength(500)
  url?: string;
}

/**
 * Public sink for frontend crashes (app/error.tsx). Public because the error boundary
 * may fire on the login page or with an expired session; protected by a tight per-IP
 * throttle (CLIENT_ERROR_RATE_LIMIT, default 20/min) and a 16 KB size cap. Reports are
 * logged and passed to alerting (de-duplicated per signature), never stored.
 */
@Controller('telemetry')
export class TelemetryController {
  private readonly log = new Logger('ClientError');

  constructor(private alerts: AlertingService) {}

  @Post('client-error')
  @HttpCode(202)
  @Throttle({ default: { limit: Number(process.env.CLIENT_ERROR_RATE_LIMIT ?? 20), ttl: 60_000 } })
  async clientError(@Req() req: Request, @Body() body: ClientErrorDto) {
    const len = Number(req.headers['content-length'] ?? 0);
    if (len > MAX_BYTES) throw new PayloadTooLargeException(`client error reports are limited to ${MAX_BYTES} bytes`);
    const clean = (s: string | undefined) => (s ?? '').replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1[REDACTED]').replace(/[\r\n]+/g, ' ');
    let path: string | undefined;
    try {
      path = body.url ? new URL(body.url, 'http://x').pathname : undefined; // never keep query strings (tokens)
    } catch {
      path = undefined;
    }
    this.log.warn(JSON.stringify({
      name: clean(body.name) || 'Error', message: clean(body.message).slice(0, 500), digest: body.digest ?? null, path: path ?? null,
      ua: String(req.headers['user-agent'] ?? '').slice(0, 200),
    }));
    await this.alerts.reportClientError({ name: clean(body.name) || 'Error', message: clean(body.message), path, status: undefined });
    return { received: true };
  }
}

@Module({ controllers: [TelemetryController] })
export class TelemetryModule {}
