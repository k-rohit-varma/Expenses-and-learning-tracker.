import { z } from "zod";
import { CategoryBudget, Expense, WeeklyBudget } from "./models.js";

const DAY_MS = 86400000;
const INDIA_OFFSET_MS = 19800000;
export const weekStartSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && date.getUTCDay() === 1;
}, "Week must start on a valid Monday.");
export const budgetInput = z.object({
  weekStart: weekStartSchema,
  amount: z.number().finite().min(0).max(100000000),
}).strict();

export function addCalendarDays(date, count) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
}
export function mondayOf(date) {
  const day = new Date(`${date}T00:00:00Z`);
  const offset = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - offset);
  return day.toISOString().slice(0, 10);
}
export function indiaDayStart(date) {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() - INDIA_OFFSET_MS);
}
export function budgetProgress(budgetPaise, spentPaise) {
  if (budgetPaise === null || budgetPaise === undefined) return { remainingPaise: null, percentUsed: null };
  return {
    remainingPaise: budgetPaise - spentPaise,
    percentUsed: budgetPaise > 0 ? Math.round(spentPaise / budgetPaise * 10000) / 100 : spentPaise > 0 ? 100 : 0,
  };
}
function todayIndia() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export async function weeklyBudgetReport(userId, weekStart) {
  const validStart = weekStartSchema.safeParse(weekStart);
  if (!validStart.success) return null;
  const weekEnd = addCalendarDays(weekStart, 6);
  const nextWeek = addCalendarDays(weekStart, 7);
  const prevStart = addCalendarDays(weekStart, -7);
  const trendStart = addCalendarDays(weekStart, -49);
  const [budget, rows, previousRows, allocations, trendRows] = await Promise.all([
    WeeklyBudget.findOne({ userId, weekStart }).lean(),
    Expense.find({ userId, transactionDate: { $gte: indiaDayStart(weekStart), $lt: indiaDayStart(nextWeek) } }).select("amountPaise category transactionDate").lean(),
    Expense.find({ userId, transactionDate: { $gte: indiaDayStart(prevStart), $lt: indiaDayStart(weekStart) } }).select("amountPaise").lean(),
    CategoryBudget.find({ userId, weekStart }).select("_id category amountPaise description").lean(),
    Expense.find({ userId, transactionDate: { $gte: indiaDayStart(trendStart), $lt: indiaDayStart(nextWeek) } }).select("amountPaise category transactionDate").lean(),
  ]);
  const dailyAmounts = new Map();
  const categoryAmounts = new Map();
  for (let i = 0; i < 7; i++) dailyAmounts.set(addCalendarDays(weekStart, i), 0);
  for (const row of rows) {
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(row.transactionDate);
    dailyAmounts.set(day, (dailyAmounts.get(day) || 0) + row.amountPaise);
    const item = categoryAmounts.get(row.category) || { amountPaise: 0, count: 0 };
    item.amountPaise += row.amountPaise;
    item.count++;
    categoryAmounts.set(row.category, item);
  }
  const spentPaise = rows.reduce((sum, row) => sum + row.amountPaise, 0);
  const previousSpentPaise = previousRows.reduce((sum, row) => sum + row.amountPaise, 0);
  const budgetPaise = budget?.amountPaise ?? null;
  const categoryBudgets = allocations.map((item) => {
    const spentPaise = categoryAmounts.get(item.category)?.amountPaise || 0;
    const progress = budgetProgress(item.amountPaise, spentPaise);
    return { id: String(item._id), category: item.category, description: item.description, allocated: item.amountPaise / 100, spent: spentPaise / 100, remaining: progress.remainingPaise / 100, percentUsed: progress.percentUsed, status: spentPaise > item.amountPaise ? "Exceeded" : spentPaise / item.amountPaise >= 0.8 ? "Near Limit" : "On Track" };
  }).sort((a, b) => a.category.localeCompare(b.category));
  const allocatedPaise = allocations.reduce((sum, item) => sum + item.amountPaise, 0);
  const categoryTrend = Array.from({ length: 8 }, (_, index) => {
    const key = addCalendarDays(trendStart, index * 7);
    const entries = new Map();
    for (const row of trendRows) {
      const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(row.transactionDate);
      const rowWeek = mondayOf(date);
      if (rowWeek === key) entries.set(row.category, (entries.get(row.category) || 0) + row.amountPaise);
    }
    return { weekStart: key, ...Object.fromEntries([...entries].map(([name, value]) => [name, value / 100])) };
  });
  const today = todayIndia();
  const remainingDays = today < weekStart ? 7 : today > weekEnd ? 0 : Math.floor((new Date(`${weekEnd}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / DAY_MS) + 1;
  const { remainingPaise, percentUsed } = budgetProgress(budgetPaise, spentPaise);
  return {
    weekStart,
    weekEnd,
    budget: budgetPaise === null ? null : budgetPaise / 100,
    allocated: allocatedPaise / 100,
    unallocated: budgetPaise === null ? null : (budgetPaise - allocatedPaise) / 100,
    allocationsOverBudget: budgetPaise !== null && allocatedPaise > budgetPaise,
    categoryBudgets,
    categoryTrend,
    spent: spentPaise / 100,
    remaining: remainingPaise === null ? null : remainingPaise / 100,
    percentUsed,
    expenseCount: rows.length,
    averageDaily: spentPaise / 700,
    dailyAllowance: budgetPaise === null || remainingPaise <= 0 || remainingDays === 0 ? null : remainingPaise / remainingDays / 100,
    remainingDays,
    categories: [...categoryAmounts.entries()].map(([name, item]) => ({ name, amount: item.amountPaise / 100, percent: spentPaise ? item.amountPaise / spentPaise * 100 : 0, count: item.count })).sort((a, b) => b.amount - a.amount),
    daily: [...dailyAmounts.entries()].map(([date, amountPaise]) => ({ date, amount: amountPaise / 100 })),
    previousSpent: previousSpentPaise / 100,
    difference: (spentPaise - previousSpentPaise) / 100,
    changePercent: previousSpentPaise ? (spentPaise - previousSpentPaise) / previousSpentPaise * 100 : null,
  };
}
