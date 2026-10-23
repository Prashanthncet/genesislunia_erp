import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Per-branch document numbers: INV-SAINIK01-2026-0001 / RCPT-SAINIK01-2026-0001.
 *
 * invoice_no / receipt_no carry a GLOBAL unique index, so two schools can't both own
 * "RCPT-2026-0001" — the branch code is therefore part of the number. The sequence is
 * per branch + prefix + year, computed from the highest number already issued (not a
 * row count, which collided across branches and skipped/duplicated after deletes).
 *
 * Concurrency: two requests can compute the same next number; the unique index rejects
 * the loser with P2002 and `withDocNoRetry` recomputes. SQLite also reports lock
 * contention between concurrent write transactions (P2034 / "database is locked"),
 * which is retried the same way.
 */
export type DocKind = 'invoice' | 'receipt';
type Tx = Prisma.TransactionClient | PrismaClient | PrismaService;

export async function docPrefix(prisma: Tx, branchId: string, kind: DocKind, year = new Date().getFullYear()) {
  const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { code: true } });
  const code = (branch?.code || branchId).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return `${kind === 'invoice' ? 'INV' : 'RCPT'}-${code}-${year}-`;
}

/** Next number for this branch/kind/year. Call inside the same transaction that inserts it. */
export async function nextDocNo(prisma: Tx, branchId: string, kind: DocKind): Promise<string> {
  const prefix = await docPrefix(prisma, branchId, kind);
  const rows = kind === 'invoice'
    ? (await prisma.feeInvoice.findMany({ where: { invoiceNo: { startsWith: prefix } }, select: { invoiceNo: true } }))
      .map((r) => r.invoiceNo)
    : (await prisma.offlinePayment.findMany({ where: { receiptNo: { startsWith: prefix } }, select: { receiptNo: true } }))
      .map((r) => r.receiptNo);
  // Parse rather than sort strings: "10000" sorts before "9999" lexically.
  const max = rows.reduce((m, no) => {
    const n = parseInt((no ?? '').slice(prefix.length), 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

function isRetryable(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002' || err.code === 'P2034' || err.code === 'P2028') return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return /Unique constraint|database is locked|SQLITE_BUSY|write conflict|deadlock|Transaction already closed|Unable to start a transaction/i.test(msg);
}

/**
 * Runs `fn` (which allocates a doc number and inserts the row) and retries on a
 * duplicate number or lock contention. Business errors (HttpException) propagate.
 */
export async function withDocNoRetry<T>(fn: () => Promise<T>, attempts = 25): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      if (!isRetryable(err)) throw err;
      lastErr = err;
      // Small jittered backoff so racing requests don't recompute in lock-step.
      await new Promise((r) => setTimeout(r, 5 + Math.floor(Math.random() * 20) * (i + 1)));
    }
  }
  throw lastErr;
}
