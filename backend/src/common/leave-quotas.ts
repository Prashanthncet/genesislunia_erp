/**
 * Yearly leave entitlement per type. Used by leave balances AND by payroll's unpaid-day
 * rule (leave beyond quota is docked) — one table so the two can never disagree.
 */
export const LEAVE_QUOTAS: Record<string, number> = { Casual: 12, Sick: 8, Earned: 15, Duty: 10, Unpaid: 0 };
