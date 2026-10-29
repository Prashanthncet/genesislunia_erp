import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { contentDisposition, StorageService } from './storage.service';

/**
 * Public download endpoint behind the local driver's signed URLs. No bearer token:
 * the HMAC'd, expiring token IS the authorisation (minted by an endpoint that already
 * checked role + branch + portal ownership). Expired or tampered → 403.
 */
@Controller('files')
export class FilesController {
  constructor(private storage: StorageService) {}

  @Get(':token')
  async download(@Param('token') token: string, @Res() res: Response) {
    const p = this.storage.verifyToken(token);
    const obj = await this.storage.get(p.k);
    res.set({
      'Content-Type': p.m || obj.mime,
      'Content-Length': String(obj.bytes.length),
      'Content-Disposition': contentDisposition(p.d === 'inline' ? 'inline' : 'attachment', p.n || 'file'),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
    });
    return res.send(obj.bytes);
  }
}
