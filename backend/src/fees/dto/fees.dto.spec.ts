// class-validator's decorators rely on Reflect.getMetadata, which only exists
// once reflect-metadata is loaded. Nest loads it via main.ts, but unit tests
// import the DTOs directly — so it must be required here.
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  CreateFeeStructureDto, CreatePaymentDto, GenerateInvoicesDto, MarkAttendanceDto,
} from './fees.dto';

/** Run class-validator the same way the global ValidationPipe does. */
function check<T extends object>(cls: new () => T, plain: object): string[] {
  const dto = plainToInstance(cls, plain);
  return validateSync(dto).map((e) => e.property);
}

describe('fees DTO validation', () => {
  describe('CreateFeeStructureDto', () => {
    it('accepts a valid structure', () => {
      expect(check(CreateFeeStructureDto, { class_id: 'cls_1', fee_type: 'Tuition', amount: 5000 })).toEqual([]);
    });

    it('rejects a negative amount', () => {
      // A negative fee would silently invert collections totals.
      expect(check(CreateFeeStructureDto, { class_id: 'cls_1', fee_type: 'x', amount: -1 })).toContain('amount');
    });

    it('rejects a missing class_id', () => {
      expect(check(CreateFeeStructureDto, { fee_type: 'x', amount: 10 })).toContain('class_id');
    });
  });

  describe('CreatePaymentDto', () => {
    it('accepts a normal payment', () => {
      expect(check(CreatePaymentDto, {
        invoice_id: 'inv_1', amount_paid: 250, payment_mode: 'Cash',
      })).toEqual([]);
    });

    it('rejects a zero or negative payment', () => {
      expect(check(CreatePaymentDto, { invoice_id: 'i', amount_paid: 0, payment_mode: 'Cash' })).toContain('amount_paid');
      expect(check(CreatePaymentDto, { invoice_id: 'i', amount_paid: -50, payment_mode: 'Cash' })).toContain('amount_paid');
    });

    it('rejects an unknown payment mode', () => {
      // Guards against free-text sneaking into an enum-constrained column.
      expect(check(CreatePaymentDto, { invoice_id: 'i', amount_paid: 10, payment_mode: 'crypto' })).toContain('payment_mode');
    });

    it('rejects a non YYYY-MM-DD payment_date', () => {
      expect(check(CreatePaymentDto, {
        invoice_id: 'i', amount_paid: 10, payment_mode: 'Cash', payment_date: '29-09-2026',
      })).toContain('payment_date');
    });
  });

  describe('GenerateInvoicesDto', () => {
    it('rejects a malformed due_date', () => {
      expect(check(GenerateInvoicesDto, { class_id: 'c', term: 'Term 1', due_date: 'soon' })).toContain('due_date');
    });
  });

  describe('MarkAttendanceDto', () => {
    it('accepts a normal batch', () => {
      expect(check(MarkAttendanceDto, {
        class_id: 'cls_1',
        date: '2026-09-29',
        records: [{ student_id: 'stu_1', status: 'Present' }],
      })).toEqual([]);
    });

    it('rejects an unknown attendance status', () => {
      // Guards the enum on a value that would otherwise be written straight to SQLite.
      expect(check(MarkAttendanceDto, {
        class_id: 'cls_1',
        date: '2026-09-29',
        records: [{ student_id: 'stu_1', status: 'Maybe' }],
      })).toContain('records');
    });

    it('rejects an empty records array', () => {
      expect(check(MarkAttendanceDto, { class_id: 'cls_1', date: '2026-09-29', records: [] })).toContain('records');
    });
  });
});