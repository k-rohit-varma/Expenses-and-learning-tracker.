import { z } from "zod";
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const expenseInput = z.object({
  amount: z.coerce.number().finite().positive().max(10000000),
  category: z.string().trim().min(1).max(60),
  description: z.string().trim().min(1).max(140),
  transactionDate: z.string().datetime({ offset: true }),
  paymentMethod: z.enum(["UPI", "Cash", "Card", "Bank transfer", "Other"]),
  notes: z.string().max(1000).optional().default(""),
});
export const learningInput = z.object({
  subject: z.string().trim().min(1).max(60),
  topic: z.string().trim().min(1).max(140),
  durationMinutes: z.coerce.number().int().positive().max(1440),
  sessionDate: z.string().datetime({ offset: true }),
  whatILearned: z.string().max(2000).optional().default(""),
  problemsSolved: z.coerce
    .number()
    .int()
    .min(0)
    .max(10000)
    .optional()
    .default(0),
  tasksCompleted: z.coerce
    .number()
    .int()
    .min(0)
    .max(10000)
    .optional()
    .default(0),
  difficulty: z.enum(["Easy", "Medium", "Hard", ""]).optional().default(""),
  notes: z.string().max(1000).optional().default(""),
});
export const asyncRoute = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
export function bounds(from, to) {
  if (from && !dateSchema.safeParse(from).success)
    throw Object.assign(new Error("Use dates in YYYY-MM-DD format."), {
      status: 400,
    });
  if (to && !dateSchema.safeParse(to).success)
    throw Object.assign(new Error("Use dates in YYYY-MM-DD format."), {
      status: 400,
    });
  const start = from
    ? new Date(`${from}T00:00:00+05:30`)
    : new Date("2000-01-01T00:00:00Z");
  const end = to
    ? new Date(new Date(`${to}T00:00:00+05:30`).getTime() + 86400000)
    : new Date("2100-01-01T00:00:00Z");
  if (start >= end)
    throw Object.assign(new Error("Start date must be before end date."), {
      status: 400,
    });
  return { $gte: start, $lt: end };
}
export const localDay = (date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
