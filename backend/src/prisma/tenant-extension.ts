import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { currentTenantBranchId } from '../common/request-context';

/**
 * Central tenant guard (plan §2.5: "every query automatically scoped to the logged-in
 * user's school"). Controllers still filter by branch and call assertInBranch — this is
 * the second, automatic layer that holds even when a query forgets to.
 *
 * Applies only when the current AsyncLocalStorage request context carries a branchId
 * (set by AuthGuard). Cron jobs, the seed, scripts and public endpoints have no context
 * and are untouched. Only TOP-LEVEL queries are scoped: nested `include`/relation filters
 * follow the parent row's relations, which are branch-consistent by construction.
 *
 *  - reads / bulk writes (findMany, findFirst*, count, aggregate, groupBy, updateMany,
 *    deleteMany): `where` becomes `{ AND: [where, { branchId }] }`
 *  - findUnique*, update, delete, upsert: `branchId` is added to the unique where
 *    (Prisma >= 5 accepts extra filters there), so a foreign row reads as null / P2025
 *    — atomically, no extra lookup (an extra lookup outside an interactive transaction
 *    would deadlock SQLite's single writer).
 *  - create / createMany / upsert.create: a branchId (or branch.connect) different from
 *    the context is refused with 403; a missing one is filled in.
 *  - update / updateMany / upsert.update may not move a row to another branch.
 */

type ModelMeta = { relationField?: string };

/** Models with a `branchId` scalar, derived from the generated DMMF (never by hand). */
export const TENANT_MODELS: ReadonlyMap<string, ModelMeta> = (() => {
  const out = new Map<string, ModelMeta>();
  for (const m of Prisma.dmmf.datamodel.models) {
    if (!m.fields.some((f) => f.name === 'branchId' && f.kind === 'scalar')) continue;
    const rel = m.fields.find((f) => f.kind === 'object' && (f.relationFromFields ?? []).includes('branchId'));
    out.set(m.name, { relationField: rel?.name });
  }
  return out;
})();

const WHERE_OPS = new Set([
  'findMany', 'findFirst', 'findFirstOrThrow', 'count', 'aggregate', 'groupBy',
  'updateMany', 'updateManyAndReturn', 'deleteMany',
]);
const UNIQUE_OPS = new Set(['findUnique', 'findUniqueOrThrow', 'update', 'delete', 'upsert']);

type AnyArgs = Record<string, any>;

function scopedWhere(where: AnyArgs | undefined, branchId: string): AnyArgs {
  return where && Object.keys(where).length ? { AND: [where, { branchId }] } : { branchId };
}

function scopedUniqueWhere(where: AnyArgs, branchId: string): AnyArgs {
  const and = where.AND === undefined ? [] : Array.isArray(where.AND) ? where.AND : [where.AND];
  return { ...where, AND: [...and, { branchId }] };
}

function refuse(model: string): never {
  throw new ForbiddenException(`Cross-school write refused (${model})`);
}

/** Value a create/update `data` assigns to branchId, if any. */
function assignedBranch(data: AnyArgs, meta: ModelMeta): string | undefined {
  const raw = data.branchId;
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object' && typeof raw.set === 'string') return raw.set;
  const rel = meta.relationField ? data[meta.relationField] : undefined;
  const id = rel?.connect?.id ?? rel?.connectOrCreate?.where?.id;
  return typeof id === 'string' ? id : undefined;
}

function checkCreate(model: string, meta: ModelMeta, data: AnyArgs, branchId: string): AnyArgs {
  const given = assignedBranch(data, meta);
  if (given !== undefined) {
    if (given !== branchId) refuse(model);
    return data;
  }
  if (data.branchId === undefined && !(meta.relationField && meta.relationField in data)) {
    return { ...data, branchId };
  }
  return data;
}

function checkUpdate(model: string, meta: ModelMeta, data: AnyArgs | undefined, branchId: string) {
  if (!data) return;
  const given = assignedBranch(data, meta);
  if (given !== undefined && given !== branchId) refuse(model);
}

/** Pure args rewrite, exported for unit tests. Returns args unchanged for non-tenant models. */
export function scopeArgs(model: string, operation: string, args: AnyArgs | undefined, branchId: string): AnyArgs | undefined {
  const meta = TENANT_MODELS.get(model);
  if (!meta) return args;
  const a: AnyArgs = { ...(args ?? {}) };
  if (WHERE_OPS.has(operation)) a.where = scopedWhere(a.where, branchId);
  if (UNIQUE_OPS.has(operation)) a.where = scopedUniqueWhere(a.where ?? {}, branchId);
  switch (operation) {
    case 'create':
      a.data = checkCreate(model, meta, a.data ?? {}, branchId);
      break;
    case 'createMany':
    case 'createManyAndReturn':
      a.data = Array.isArray(a.data)
        ? a.data.map((d: AnyArgs) => checkCreate(model, meta, d, branchId))
        : checkCreate(model, meta, a.data ?? {}, branchId);
      break;
    case 'upsert':
      a.create = checkCreate(model, meta, a.create ?? {}, branchId);
      checkUpdate(model, meta, a.update, branchId);
      break;
    case 'update':
    case 'updateMany':
    case 'updateManyAndReturn':
      checkUpdate(model, meta, a.data, branchId);
      break;
  }
  return a;
}

export const tenantExtension = Prisma.defineExtension({
  name: 'tenant-scope',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const branchId = currentTenantBranchId();
        if (!branchId || !model || !TENANT_MODELS.has(model)) return query(args);
        return query(scopeArgs(model, operation, args as AnyArgs, branchId) as typeof args);
      },
    },
  },
});
