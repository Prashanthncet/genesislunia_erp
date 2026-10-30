import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, lastValueFrom } from 'rxjs';
import { SensitiveDataInterceptor } from './sensitive-data.interceptor';
import { extractCookieToken } from '../auth/auth.guard';

function createHttpContext(req: Record<string, unknown>): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
  } as unknown as ExecutionContext;
}

function createCallHandler(payload: unknown): CallHandler {
  return {
    handle: () => of(payload),
  };
}

describe('SensitiveDataInterceptor', () => {
  const interceptor = new SensitiveDataInterceptor();

  it('strips password, passwordHash, parentOtp, otpHash, and bffSecret from nested objects and arrays', async () => {
    const ctx = createHttpContext({
      method: 'GET',
      originalUrl: '/api/users',
      user: { role: 'super_admin' },
    });

    const payload = {
      id: 'u1',
      password: 'plain-password',
      passwordHash: '$2b$10$hash',
      parentOtp: '123456',
      otpHash: 'sha256-otp',
      bffSecret: 'internal-secret',
      profile: {
        name: 'Alice',
        passwordHash: 'nested-hash',
        parentOtp: '654321',
      },
      items: [
        {
          id: 'i1',
          password: 'item-password',
          otpHash: 'item-otp-hash',
          bffSecret: 'item-bff-secret',
        },
      ],
    };

    const result = (await lastValueFrom(
      interceptor.intercept(ctx, createCallHandler(payload)),
    )) as Record<string, unknown>;

    expect(result).toEqual({
      id: 'u1',
      profile: {
        name: 'Alice',
      },
      items: [
        {
          id: 'i1',
        },
      ],
    });
  });

  it('strips salaryStructure and basicSalary when req.user.role === "teacher" on /api/staff or /api/employees', async () => {
    const staffPayload = {
      id: 's1',
      name: 'Teacher One',
      salaryStructure: { basic: 40000 },
      basicSalary: 40000,
    };

    const staffCtx = createHttpContext({
      method: 'GET',
      originalUrl: '/api/staff',
      user: { role: 'teacher' },
    });
    const staffResult = await lastValueFrom(
      interceptor.intercept(staffCtx, createCallHandler(staffPayload)),
    );
    expect(staffResult).toEqual({ id: 's1', name: 'Teacher One' });

    const employeesCtx = createHttpContext({
      method: 'GET',
      originalUrl: '/api/employees',
      user: { role: 'teacher' },
    });
    const employeesResult = await lastValueFrom(
      interceptor.intercept(employeesCtx, createCallHandler([staffPayload])),
    );
    expect(employeesResult).toEqual([{ id: 's1', name: 'Teacher One' }]);
  });

  it('preserves salaryStructure for accounts, super_admin, or /api/staff/me', async () => {
    const payload = {
      id: 's1',
      name: 'Staff Member',
      salaryStructure: { basic: 50000, hra: 10000 },
      basicSalary: 50000,
    };

    const accountsCtx = createHttpContext({
      method: 'GET',
      originalUrl: '/api/staff',
      user: { role: 'accounts' },
    });
    const accountsResult = await lastValueFrom(
      interceptor.intercept(accountsCtx, createCallHandler(payload)),
    );
    expect(accountsResult).toEqual(payload);

    const adminCtx = createHttpContext({
      method: 'GET',
      originalUrl: '/api/employees',
      user: { role: 'super_admin' },
    });
    const adminResult = await lastValueFrom(
      interceptor.intercept(adminCtx, createCallHandler(payload)),
    );
    expect(adminResult).toEqual(payload);

    const selfStaffCtx = createHttpContext({
      method: 'GET',
      originalUrl: '/api/staff/me',
      user: { role: 'teacher' },
    });
    const selfStaffResult = await lastValueFrom(
      interceptor.intercept(selfStaffCtx, createCallHandler(payload)),
    );
    expect(selfStaffResult).toEqual(payload);
  });

  it('preserves one-time password on POST /api/admissions/trigger-links', async () => {
    const payload = {
      id: 'adm1',
      password: 'OTP-temp-password-123',
      passwordHash: 'should-still-be-stripped',
    };

    const postTriggerCtx = createHttpContext({
      method: 'POST',
      originalUrl: '/api/admissions/trigger-links',
      user: { role: 'receptionist' },
    });
    const postResult = await lastValueFrom(
      interceptor.intercept(postTriggerCtx, createCallHandler(payload)),
    );
    expect(postResult).toEqual({
      id: 'adm1',
      password: 'OTP-temp-password-123',
    });

    const getTriggerCtx = createHttpContext({
      method: 'GET',
      originalUrl: '/api/admissions/trigger-links',
      user: { role: 'receptionist' },
    });
    const getResult = await lastValueFrom(
      interceptor.intercept(getTriggerCtx, createCallHandler(payload)),
    );
    expect(getResult).toEqual({
      id: 'adm1',
    });
  });
});

describe('extractCookieToken', () => {
  it('extracts erp_token from a Cookie header', () => {
    expect(
      extractCookieToken('theme=dark; erp_token=eyJhbGciOiJIUzI1NiJ9.payload.sig; Path=/'),
    ).toBe('eyJhbGciOiJIUzI1NiJ9.payload.sig');

    expect(
      extractCookieToken('erp_token=encoded%3Dtoken%2Bval'),
    ).toBe('encoded=token+val');

    expect(extractCookieToken('other_cookie=abc')).toBeNull();
    expect(extractCookieToken(undefined)).toBeNull();
  });
});
