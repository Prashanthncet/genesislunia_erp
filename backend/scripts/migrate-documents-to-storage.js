/**
 * Moves legacy inline documents (admission_documents.data_url base64) into the object store
 * and finishes any Student-DMS archive move that failed at principal sign-off.
 *
 *   node scripts/migrate-documents-to-storage.js [--dry-run]
 *
 * Uses the same env as the API: DATABASE_URL, STORAGE_DRIVER (local|s3), STORAGE_DIR or
 * S3_ENDPOINT/S3_REGION/S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY/S3_FORCE_PATH_STYLE.
 *
 * Per row: write the object under its DMS key (student folder when archived, else the
 * admission folder), confirm the stored size, then set storage_key/mime_type and null
 * data_url. Keys are deterministic, so re-running after a crash just rewrites the same
 * object; rows already migrated are skipped (idempotent). Exit code 1 if any row failed.
 */
const { PrismaClient } = require('@prisma/client');
const { storeFromEnv, admissionDocKey, studentDocKey, studentDocPrefix, safeId, safeName } = require('./lib/object-store');

const DATA_URL_RE = /^data:([a-zA-Z0-9.+/-]+);base64,(.*)$/s;

function keyFor(doc) {
  if (doc.studentId) return studentDocKey(doc.branchId, doc.studentId, doc.id, doc.fileName);
  if (doc.admissionId) return admissionDocKey(doc.branchId, doc.admissionId, doc.id, doc.fileName);
  return `branches/${safeId(doc.branchId)}/documents/${safeId(doc.id)}-${safeName(doc.fileName)}`;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const store = storeFromEnv();
  const prisma = new PrismaClient();
  const counts = { driver: store.name, dry_run: dryRun, legacy_rows: 0, migrated: 0, bytes: 0, malformed: 0, archive_pending: 0, archive_moved: 0, failed: 0 };
  const failures = [];
  try {
    // 1) legacy inline rows → object store
    let cursor = '';
    for (;;) {
      const batch = await prisma.admissionDocument.findMany({
        where: { dataUrl: { not: null }, id: { gt: cursor } },
        orderBy: { id: 'asc' },
        take: 25,
      });
      if (!batch.length) break;
      cursor = batch[batch.length - 1].id;
      for (const doc of batch) {
        counts.legacy_rows += 1;
        const m = DATA_URL_RE.exec(doc.dataUrl);
        if (!m) {
          counts.malformed += 1;
          failures.push({ id: doc.id, error: 'malformed data URL (left untouched)' });
          continue;
        }
        const bytes = Buffer.from(m[2], 'base64');
        const mime = m[1].toLowerCase();
        let key;
        try {
          key = keyFor(doc);
          if (!dryRun) {
            await store.put(key, bytes, mime);
            const size = await store.size(key);
            if (size !== bytes.length) throw new Error(`stored size ${size} != ${bytes.length}`);
            // dataUrl: not null guard → a concurrent run cannot clobber a row twice.
            await prisma.admissionDocument.updateMany({
              where: { id: doc.id, dataUrl: { not: null } },
              data: { storageKey: key, mimeType: mime, sizeBytes: bytes.length, dataUrl: null },
            });
          }
          counts.migrated += 1;
          counts.bytes += bytes.length;
        } catch (e) {
          counts.failed += 1;
          failures.push({ id: doc.id, key, error: String((e && e.message) || e) });
        }
      }
    }

    // 2) archived rows whose object is still under the admission folder → student folder
    const archived = await prisma.admissionDocument.findMany({
      where: { studentId: { not: null }, storageKey: { not: null }, dataUrl: null },
      select: { id: true, branchId: true, studentId: true, fileName: true, storageKey: true },
    });
    for (const doc of archived) {
      if (doc.storageKey.startsWith(studentDocPrefix(doc.branchId, doc.studentId))) continue;
      counts.archive_pending += 1;
      const target = studentDocKey(doc.branchId, doc.studentId, doc.id, doc.fileName);
      try {
        if (!dryRun) {
          await store.copy(doc.storageKey, target);
          await prisma.admissionDocument.update({ where: { id: doc.id }, data: { storageKey: target } });
          try { await store.delete(doc.storageKey); } catch { /* old copy stays; harmless */ }
        }
        counts.archive_moved += 1;
      } catch (e) {
        counts.failed += 1;
        failures.push({ id: doc.id, key: doc.storageKey, error: String((e && e.message) || e) });
      }
    }
  } finally {
    await prisma.$disconnect();
  }
  console.log(JSON.stringify(counts));
  if (failures.length) console.error(JSON.stringify({ failures }));
  if (counts.failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(JSON.stringify({ migrate: 'failed', error: String((err && err.message) || err) }));
  process.exit(1);
});
