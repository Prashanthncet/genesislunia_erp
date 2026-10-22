import { AsyncLocalStorage } from 'async_hooks';
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * Per-request context carried through every await of the request via AsyncLocalStorage.
 *
 * - RequestContextMiddleware opens an (empty) context for every HTTP request.
 * - AuthGuard fills in { userId, role, branchId } once the caller is resolved.
 * - PrismaService's tenant extension reads `branchId` and scopes every query on a model
 *   that has a branchId column (see prisma/tenant-extension.ts).
 *
 * No context (cron jobs, seed, scripts, public endpoints before/without login) means
 * no tenant scoping — those paths must pass branch ids explicitly, as they always did.
 */
export type RequestContext = {
  userId?: string;
  role?: string;
  branchId?: string;
  /** Set by runWithoutTenant(): queries inside skip tenant scoping on purpose. */
  bypassTenant?: boolean;
};

const als = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return als.getStore();
}

/** Branch the current request is scoped to, or undefined outside an authenticated request. */
export function currentTenantBranchId(): string | undefined {
  const ctx = als.getStore();
  if (!ctx || ctx.bypassTenant) return undefined;
  return ctx.branchId;
}

/** Runs `fn` inside a fresh context (tests, jobs that want to act as one school). */
export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return als.run({ ...ctx }, fn);
}

/**
 * Explicit escape hatch for code that legitimately reads across schools inside a
 * request. Every use should be reviewed: it disables the central tenant guard.
 */
export function runWithoutTenant<T>(fn: () => T): T {
  return als.run({ ...(als.getStore() ?? {}), bypassTenant: true }, fn);
}

/** Called by AuthGuard after the user has been loaded from the database. */
export function setRequestUser(user: { userId: string; role: string; branchId: string }) {
  const ctx = als.getStore();
  if (!ctx) return; // e.g. guards invoked outside HTTP (unit tests) — nothing to fill
  ctx.userId = user.userId;
  ctx.role = user.role;
  ctx.branchId = user.branchId;
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(_req: Request, _res: Response, next: NextFunction) {
    als.run({}, () => next());
  }
}
