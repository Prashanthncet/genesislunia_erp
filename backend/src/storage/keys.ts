/**
 * Object-store key layout (plan §2.6 "Student DMS: folder per student"):
 *
 *   branches/<branchId>/admissions/<admissionId>/<docId>-<safeName>          while the application runs
 *   branches/<branchId>/students/<studentId>/documents/<docId>-<safeName>    after the principal signs
 *
 * Ids come from the database, the file name from the uploader, so every segment is
 * reduced to a conservative character set here. assertSafeKey() is the last line of
 * defence in the drivers: no absolute paths, backslashes, empty, "." or ".." segments.
 */

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const KEY_RE = /^[A-Za-z0-9._\-/]+$/;
export const MAX_KEY_LENGTH = 512;

export class UnsafeKeyError extends Error {}

/** Uploader-controlled file name → [A-Za-z0-9._-], no leading dots, no "..", max 80 chars. */
export function safeName(name: string): string {
  const base = String(name ?? '').split(/[/\\]/).pop() ?? '';
  let s = base.replace(/[^A-Za-z0-9._-]/g, '_').replace(/\.{2,}/g, '_').replace(/^[.]+/, '');
  if (s.length > 80) {
    const dot = s.lastIndexOf('.');
    const ext = dot > 0 && s.length - dot <= 10 ? s.slice(dot) : '';
    s = s.slice(0, 80 - ext.length) + ext;
  }
  return s || 'file';
}

export function safeId(id: string): string {
  if (!ID_RE.test(String(id ?? ''))) throw new UnsafeKeyError(`Unsafe id for a storage key: ${JSON.stringify(id)}`);
  return id;
}

export function assertSafeKey(key: string): string {
  if (typeof key !== 'string' || !key || key.length > MAX_KEY_LENGTH || !KEY_RE.test(key) || key.startsWith('/')) {
    throw new UnsafeKeyError(`Unsafe storage key: ${JSON.stringify(key)}`);
  }
  for (const seg of key.split('/')) {
    if (!seg || seg === '.' || seg === '..') throw new UnsafeKeyError(`Unsafe storage key: ${JSON.stringify(key)}`);
  }
  return key;
}

export const admissionDocKey = (branchId: string, admissionId: string, docId: string, fileName: string) =>
  `branches/${safeId(branchId)}/admissions/${safeId(admissionId)}/${safeId(docId)}-${safeName(fileName)}`;

export const studentDocPrefix = (branchId: string, studentId: string) =>
  `branches/${safeId(branchId)}/students/${safeId(studentId)}/documents/`;

export const studentDocKey = (branchId: string, studentId: string, docId: string, fileName: string) =>
  `${studentDocPrefix(branchId, studentId)}${safeId(docId)}-${safeName(fileName)}`;
