/**
 * Case-insensitive "contains" filter for user-typed searches. SQLite's LIKE is already
 * case-insensitive for ASCII; PostgreSQL's is not, so there we add Prisma's
 * `mode: 'insensitive'`. (The SQLite client's types have no `mode`, hence the cast.)
 */
const isPostgres = () => /^postgres(ql)?:/.test(process.env.DATABASE_URL ?? '');

export function textContains(q: string): { contains: string } {
  return (isPostgres() ? { contains: q, mode: 'insensitive' } : { contains: q }) as { contains: string };
}
