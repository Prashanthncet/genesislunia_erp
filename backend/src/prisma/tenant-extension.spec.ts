import { scopeArgs, TENANT_MODELS } from './tenant-extension';
import { toE164 } from '../notifications/providers';

describe('tenant scopeArgs', () => {
  const B = 'sainik01';

  it('wraps list filters in AND so a caller filter cannot widen scope', () => {
    expect(scopeArgs('Student', 'findMany', { where: { branchId: 'other' } }, B)).toEqual({ where: { AND: [{ branchId: 'other' }, { branchId: B }] } });
    expect(scopeArgs('Student', 'count', undefined, B)).toEqual({ where: { branchId: B } });
  });

  it('adds branchId to unique wheres (findUnique / update / delete / upsert)', () => {
    expect(scopeArgs('Student', 'findUnique', { where: { id: 'x' } }, B)).toEqual({ where: { id: 'x', AND: [{ branchId: B }] } });
    expect(scopeArgs('Student', 'delete', { where: { id: 'x', AND: { status: 'Active' } } }, B)).toEqual({
      where: { id: 'x', AND: [{ status: 'Active' }, { branchId: B }] },
    });
  });

  it('refuses foreign branch on create / connect / update, fills a missing one', () => {
    expect(() => scopeArgs('Student', 'create', { data: { branchId: 'g2' } }, B)).toThrow(/Cross-school/);
    expect(() => scopeArgs('Student', 'create', { data: { branch: { connect: { id: 'g2' } } } }, B)).toThrow(/Cross-school/);
    expect(() => scopeArgs('Student', 'createMany', { data: [{ branchId: B }, { branchId: 'g2' }] }, B)).toThrow(/Cross-school/);
    expect(() => scopeArgs('Student', 'updateMany', { data: { branchId: { set: 'g2' } } }, B)).toThrow(/Cross-school/);
    expect(() => scopeArgs('Student', 'upsert', { where: { id: 'x' }, create: { branchId: 'g2' }, update: {} }, B)).toThrow(/Cross-school/);
    expect(scopeArgs('AuditLog', 'create', { data: { action: 'X' } }, B)).toEqual({ data: { action: 'X', branchId: B } });
    expect(scopeArgs('Student', 'create', { data: { branch: { connect: { id: B } } } }, B)).toEqual({ data: { branch: { connect: { id: B } } } });
  });

  it('leaves models without branchId alone', () => {
    expect(TENANT_MODELS.has('Room')).toBe(false);
    const args = { where: { id: 'r1' } };
    expect(scopeArgs('Room', 'findUnique', args, B)).toBe(args);
  });
});

describe('toE164', () => {
  it('normalises Indian numbers', () => {
    expect(toE164('98765 43210')).toBe('+919876543210');
    expect(toE164('09876543210')).toBe('+919876543210');
    expect(toE164('+91-98765-43210')).toBe('+919876543210');
    expect(toE164('919876543210')).toBe('+919876543210');
  });
});
