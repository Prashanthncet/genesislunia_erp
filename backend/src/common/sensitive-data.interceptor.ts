import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { R } from '../auth/roles';

const ALWAYS_STRIP_KEYS = new Set([
  'passwordHash',
  'parentOtp',
  'otpHash',
  'bffSecret',
]);

const SALARY_KEYS = new Set([
  'salaryStructure',
  'basicSalary',
  'hra',
  'da',
  'tdsPercent',
  'epfPercent',
  'netSalary',
]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function scrubPayload(
  value: unknown,
  opts: { allowOneTimePassword: boolean; allowSalary: boolean },
  depth = 0,
): unknown {
  if (depth > 8 || value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((item) => scrubPayload(item, opts, depth + 1));
  }
  if (!isPlainObject(value)) {
    return value;
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (ALWAYS_STRIP_KEYS.has(k)) continue;
    if (k === 'password' && !opts.allowOneTimePassword) continue;
    if (!opts.allowSalary && SALARY_KEYS.has(k)) continue;
    out[k] = scrubPayload(v, opts, depth + 1);
  }
  return out;
}

/**
 * Ensures sensitive fields (password hashes, OTP hashes, unauthorized salary structures)
 * are never sent to unauthorized clients even if a query forgets an explicit select.
 */
@Injectable()
export class SensitiveDataInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest();
    const url = String(req?.originalUrl ?? req?.url ?? '');
    const method = String(req?.method ?? 'GET').toUpperCase();
    const role = String(req?.user?.role ?? '');

    const allowOneTimePassword =
      method === 'POST' && url.includes('/admissions/trigger-links');
    const isSelfStaff = url.includes('/staff/me');
    const isPayrollRole = (R.PAYROLL as readonly string[]).includes(role);
    const allowSalary = isSelfStaff || isPayrollRole;

    return next.handle().pipe(
      map((data) => scrubPayload(data, { allowOneTimePassword, allowSalary })),
    );
  }
}
