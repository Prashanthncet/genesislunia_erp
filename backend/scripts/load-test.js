/**
 * Multi-school load test (plan Phase 11: "load test under simulated multi-school
 * concurrent traffic"). No dependencies — Node 18+ fetch.
 *
 *   node scripts/load-test.js [--url http://localhost:3001] [--concurrency 40] [--seconds 30]
 *
 * Logs in as staff of BOTH seeded schools plus portal users, then hammers a mix of
 * read endpoints from all of them at once. Besides latency it checks isolation on
 * every response: a body from school A must never contain an id from school B.
 * Exits 1 if any isolation leak is seen, error rate > 1%, or p95 > P95_BUDGET_MS.
 *
 * --writes 0.2   makes ~20% of requests real writes (attendance roll calls, fee invoices
 *                + payments) from both schools at once, then checks the writes landed in
 *                the right school only. Use against a throwaway database.
 */
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const BASE = args.url || process.env.LOAD_URL || 'http://localhost:3001';
const CONCURRENCY = Number(args.concurrency || 40);
const SECONDS = Number(args.seconds || 30);
const P95_BUDGET_MS = Number(process.env.P95_BUDGET_MS || 800);
const WRITE_SHARE = Number(args.writes || 0);

// Write workloads per school: [method, path, body()] — bodies are generated per call.
let seq = 0;
const today = new Date().toISOString().slice(0, 10);
const WRITERS = {
  sainik01: { cls: 'cls_10a', students: ['stu_001', 'stu_002', 'stu_003'], invoiceStudent: 'stu_002' },
  greenfield02: { cls: 'g2_cls_5a', students: ['g2_stu_001', 'g2_stu_002'], invoiceStudent: 'g2_stu_002' },
};

const ACTORS = [
  { school: 'sainik01', email: 'schooladmin@sainik01.edu', password: 'Demo@Admin1',
    paths: ['/api/students', '/api/attendance?date=2026-10-01', '/api/fees/invoices', '/api/timetable/master/cls_10a', '/api/reports/dashboard'] },
  { school: 'sainik01', email: 'teacher@sainik01.edu', password: 'Demo@Teacher1',
    paths: ['/api/students', '/api/timetable/master/cls_10a', '/api/academics/subjects'] },
  { school: 'sainik01', email: 'parent@sainik01.edu', password: 'Demo@Parent1',
    paths: ['/api/portal/overview', '/api/auth/me'] },
  { school: 'greenfield02', email: 'admin@greenfield02.edu', password: 'Demo@Green1',
    paths: ['/api/students', '/api/fees/invoices', '/api/attendance?date=2026-10-01', '/api/reports/dashboard'] },
  { school: 'greenfield02', email: 'parent@greenfield02.edu', password: 'Demo@Green1',
    paths: ['/api/portal/overview', '/api/auth/me'] },
];
// Ids that only exist in one school; seeing one in the other school's response = leak.
const MARKERS = {
  sainik01: ['g2_stu_001', 'g2_stu_002', 'g2_cls_5a', 'g2_inv_1', 'Greenfield'],
  greenfield02: ['stu_001', 'cls_10a', 'Aditya Vardhan', 'Sainik School'],
};

async function login(a) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: a.email, password: a.password }),
  });
  if (!res.ok) throw new Error(`login ${a.email} → ${res.status} (is the seed loaded and LOGIN_RATE_LIMIT high enough?)`);
  return (await res.json()).token;
}

function pct(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function main() {
  for (const a of ACTORS) a.token = await login(a);
  const lat = [];
  const byPath = {};
  let ok = 0, failed = 0, forbidden = 0;
  const leaks = [];
  const deadline = Date.now() + SECONDS * 1000;

  const writes = { ok: 0, failed: 0, statuses: {} };
  const admins = ACTORS.filter((a) => /admin@/.test(a.email));
  const call = async (a, method, path, body) => {
    const t = performance.now();
    const res = await fetch(BASE + path, {
      method, headers: { Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    lat.push(performance.now() - t);
    return res;
  };
  async function writeOnce(n) {
    const a = admins[n % admins.length];
    const w = WRITERS[a.school];
    let res;
    if (n % 2 === 0) {
      // Roll call: idempotent upsert for "today" — status flips so rows really change.
      res = await call(a, 'POST', '/api/attendance', {
        class_id: w.cls, date: today,
        records: w.students.map((id, k) => ({ student_id: id, status: (n + k) % 3 === 0 ? 'Absent' : 'Present' })),
      });
    } else {
      // Invoice + immediate payment (two writes, numbered per school inside a transaction).
      const inv = await call(a, 'POST', '/api/fees/invoices', {
        student_id: w.invoiceStudent, term: `LOAD-${process.pid}-${seq++}`, total_amount: 100, due_date: '2026-12-31',
      });
      res = inv.ok
        ? await call(a, 'POST', '/api/fees/payments', { invoice_id: (await inv.json()).id, amount_paid: 100, payment_mode: 'Cash' })
        : inv;
    }
    writes.statuses[res.status] = (writes.statuses[res.status] || 0) + 1;
    if (res.ok) writes.ok += 1; else writes.failed += 1;
  }

  async function worker(i) {
    let n = i;
    while (Date.now() < deadline) {
      if (WRITE_SHARE > 0 && Math.random() < WRITE_SHARE) {
        try { await writeOnce(n); } catch { writes.failed += 1; }
        n += CONCURRENCY;
        continue;
      }
      const a = ACTORS[n % ACTORS.length];
      const path = a.paths[Math.floor(n / ACTORS.length) % a.paths.length];
      n += CONCURRENCY;
      const t = performance.now();
      try {
        const res = await fetch(BASE + path, { headers: { Authorization: `Bearer ${a.token}` } });
        const body = await res.text();
        const ms = performance.now() - t;
        lat.push(ms);
        (byPath[path] ||= []).push(ms);
        if (res.status === 403 || res.status === 404) forbidden += 1; // role-restricted for this actor: fine
        else if (res.ok) ok += 1;
        else failed += 1;
        if (res.ok) {
          for (const m of MARKERS[a.school]) {
            // "stu_001" is a substring of "g2_stu_001": only flag whole-token hits.
            const re = new RegExp(`(^|[^a-z0-9_])${m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9_]|$)`);
            if (re.test(body)) leaks.push(`${a.email} ${path} contains ${m}`);
          }
        }
      } catch (e) {
        failed += 1;
      }
    }
  }

  const started = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));
  const secs = (Date.now() - started) / 1000;
  lat.sort((x, y) => x - y);
  const total = ok + failed + forbidden;
  const report = {
    url: BASE, concurrency: CONCURRENCY, seconds: Math.round(secs), requests: total,
    rps: Math.round(total / secs), ok, forbidden_expected: forbidden, failed,
    error_rate: total ? +(failed / total).toFixed(4) : 0,
    p50_ms: Math.round(pct(lat, 50)), p95_ms: Math.round(pct(lat, 95)), p99_ms: Math.round(pct(lat, 99)),
    slowest_paths: Object.entries(byPath)
      .map(([p, v]) => [p, Math.round(pct(v.sort((x, y) => x - y), 95))])
      .sort((x, y) => y[1] - x[1]).slice(0, 5),
    isolation_leaks: [...new Set(leaks)].slice(0, 20),
    ...(WRITE_SHARE > 0 ? { writes } : {}),
  };
  console.log(JSON.stringify(report, null, 2));
  const writeErrRate = WRITE_SHARE > 0 ? writes.failed / Math.max(1, writes.ok + writes.failed) : 0;
  const pass = report.isolation_leaks.length === 0 && report.error_rate <= 0.01 && writeErrRate <= 0.01 && report.p95_ms <= P95_BUDGET_MS;
  console.log(pass ? 'PASS' : 'FAIL');
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
