import { PrismaService } from '../prisma/prisma.service';

export const today = () => new Date().toISOString().slice(0, 10);

type InvoiceWithPayments = {
  totalAmount: number;
  dueDate: string;
  payments: { amountPaid: number }[];
};

/** paid / balance / overdue for one invoice. Overdue = past due date with money still owed. */
export function invoiceMoney<T extends InvoiceWithPayments>(inv: T, asOf = today()) {
  const paid = Math.round(inv.payments.reduce((s, p) => s + p.amountPaid, 0) * 100) / 100;
  const balance = Math.max(0, Math.round((inv.totalAmount - paid) * 100) / 100);
  return { paid_amount: paid, balance, overdue: balance > 0.001 && inv.dueDate < asOf };
}

/**
 * Fee summary for one student — the shape behind GET /students/:id/export/fee-summary
 * and the Fees tab of the student profile:
 *   { student_id, as_of, invoiced, paid, balance, overdue_amount, overdue_count,
 *     invoices: [{ id, invoice_no, term, due_date, status, total, paid, balance, overdue }],
 *     payments: [{ id, receipt_no, invoice_no, date, amount, mode, online, reference_no }] }
 */
export async function studentFeeSummary(prisma: PrismaService, branchId: string, studentId: string) {
  const asOf = today();
  const invoices = await prisma.feeInvoice.findMany({
    where: { branchId, studentId },
    include: { payments: { orderBy: { paymentDate: 'desc' } } },
    orderBy: { dueDate: 'desc' },
  });
  let invoiced = 0;
  let paid = 0;
  let overdueAmount = 0;
  let overdueCount = 0;
  const rows = invoices.map((inv) => {
    const m = invoiceMoney(inv, asOf);
    invoiced += inv.totalAmount;
    paid += m.paid_amount;
    if (m.overdue) {
      overdueAmount += m.balance;
      overdueCount += 1;
    }
    return {
      id: inv.id, invoice_no: inv.invoiceNo, term: inv.term, due_date: inv.dueDate, status: inv.status,
      total: inv.totalAmount, paid: m.paid_amount, balance: m.balance, overdue: m.overdue,
    };
  });
  const payments = invoices
    .flatMap((inv) => inv.payments.map((p) => ({
      id: p.id, receipt_no: p.receiptNo, invoice_no: inv.invoiceNo, date: p.paymentDate,
      amount: p.amountPaid, mode: p.paymentMode, online: p.paymentMode === 'Online', reference_no: p.referenceNo,
    })))
    .sort((a, b) => b.date.localeCompare(a.date));
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    student_id: studentId,
    as_of: asOf,
    invoiced: r2(invoiced),
    paid: r2(paid),
    balance: r2(Math.max(0, invoiced - paid)),
    overdue_amount: r2(overdueAmount),
    overdue_count: overdueCount,
    invoices: rows,
    payments,
  };
}
