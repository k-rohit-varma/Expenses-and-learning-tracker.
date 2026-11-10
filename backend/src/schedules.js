import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { Schedule } from "./models.js";
import { asyncRoute } from "./util.js";

export const scheduleRouter = Router();
const categories = ["Work", "Personal", "Fitness", "Learning", "Finance", "Appointments", "Travel", "Other"];
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => { const d = new Date(`${v}T00:00:00Z`); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v; }, "Enter a valid date.");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const scheduleInput = z.object({
  title: z.string().trim().min(1).max(120), description: z.string().max(1000).optional().default(""),
  category: z.enum(categories), startDate: date, startTime: z.string().optional().default(""), endTime: z.string().optional().default(""),
  allDay: z.boolean().optional().default(false), location: z.string().max(200).optional().default(""), notes: z.string().max(2000).optional().default(""),
  recurrence: z.object({ frequency: z.enum(["none", "daily", "weekly", "monthly", "weekdays"]).default("none"), weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]), until: z.union([date, z.literal("")]).default("") }).default({}),
}).strict().superRefine((v, ctx) => {
  if (!v.allDay) {
    const a = time.safeParse(v.startTime), b = time.safeParse(v.endTime);
    if (!a.success) ctx.addIssue({ code: "custom", path: ["startTime"], message: "Enter a valid start time." });
    if (!b.success) ctx.addIssue({ code: "custom", path: ["endTime"], message: "Enter a valid end time." });
    if (a.success && b.success && v.endTime <= v.startTime) ctx.addIssue({ code: "custom", path: ["endTime"], message: "End time must be after start time. Schedules cannot cross midnight." });
  }
  if (v.recurrence.until && v.recurrence.until < v.startDate) ctx.addIssue({ code: "custom", path: ["recurrence", "until"], message: "Repeat until must be on or after the start date." });
  if (v.recurrence.frequency === "weekdays" && !v.recurrence.weekdays.length) ctx.addIssue({ code: "custom", path: ["recurrence", "weekdays"], message: "Select at least one weekday." });
});
const objectId = (v) => mongoose.isValidObjectId(v);
export const addDays = (key, amount) => { const d = new Date(`${key}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + amount); return d.toISOString().slice(0, 10); };
const weekday = (key) => new Date(`${key}T00:00:00Z`).getUTCDay();
export const isOccurrence = (series, key) => {
  const exception = series.occurrences?.find((x) => x.date === key && !x.canceled);
  if (exception?.movedFrom) return true;
  if (key < series.startDate || (series.recurrence?.until && key > series.recurrence.until)) return false;
  const rule = series.recurrence?.frequency || "none";
  if (rule === "none") return key === series.startDate;
  if (rule === "daily") return true;
  if (rule === "weekdays") return (series.recurrence.weekdays || []).includes(weekday(key));
  if (rule === "weekly") return weekday(key) === weekday(series.startDate);
  return key.slice(8, 10) === series.startDate.slice(8, 10);
};
export function asOccurrence(series, key) {
  const override = series.occurrences?.find((x) => x.date === key);
  if (override?.canceled) return null;
  const fields = ["title", "description", "category", "startTime", "endTime", "allDay", "location", "notes"];
  const result = { ...series, ...Object.fromEntries(fields.map((field) => [field, override?.[field] ?? series[field]])), id: `${series._id}@${key}`, seriesId: String(series._id), occurrenceDate: key, status: override?.status || series.status || "pending", recurring: (series.recurrence?.frequency || "none") !== "none" };
  delete result.occurrences;
  return result;
}
export function expand(series, from, to) {
  const output = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    if (isOccurrence(series, day)) { const occurrence = asOccurrence(series, day); if (occurrence) output.push(occurrence); }
  }
  return output;
}
export function proposedDates(startDate, recurrence = { frequency: "none" }) {
  const end = recurrence.frequency === "none" ? startDate : recurrence.until || addDays(startDate, 366);
  const stop = end < startDate ? startDate : end;
  const boundedEnd = stop > addDays(startDate, 366) ? addDays(startDate, 366) : stop;
  const candidate = { startDate, recurrence: { frequency: recurrence.frequency || "none", weekdays: recurrence.weekdays || [], until: boundedEnd }, occurrences: [] };
  const dates = [];
  for (let day = startDate; day <= boundedEnd; day = addDays(day, 1)) if (isOccurrence(candidate, day)) dates.push(day);
  return dates;
}
function fail(res, status, error) { return res.status(status).json({ error }); }
const ownedSeries = (id, req) => Schedule.findOne({ _id: id, userId: req.user._id });
function overlaps(aStart, aEnd, bStart, bEnd) { return aStart < bEnd && bStart < aEnd; }
export function conflictRows(existing, dateKey, startTime, endTime, excludeId = "", allDay = false) {
  return existing.flatMap((series) => expand(series, dateKey, dateKey)).filter((x) => {
    if (x.seriesId === excludeId) return false;
    return allDay || x.allDay || overlaps(x.startTime, x.endTime, startTime, endTime);
  }).map(({ id, seriesId, title, category, startTime: start, endTime: end, allDay: isAllDay }) => ({ id, seriesId, title, category, startTime: start, endTime: end, allDay: isAllDay }));
}
scheduleRouter.get("/conflicts", asyncRoute(async (req, res) => {
  const parsed = z.object({ date, startTime: time.optional().default("00:00"), endTime: time.optional().default("23:59"), allDay: z.enum(["true", "false"]).optional().default("false"), frequency: z.enum(["none", "daily", "weekly", "monthly", "weekdays"]).optional().default("none"), weekdays: z.string().optional().default(""), until: z.union([date, z.literal("")]).optional().default(""), excludeId: z.string().optional().default("") }).safeParse(req.query);
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message || "Invalid conflict check.");
  const { date: key, startTime, endTime, excludeId } = parsed.data;
  if (parsed.data.allDay !== "true" && endTime <= startTime) return fail(res, 400, "End time must be after start time.");
  const weekdays = parsed.data.weekdays ? parsed.data.weekdays.split(",").map(Number) : [];
  if (weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) return fail(res, 400, "Choose valid weekdays.");
  const candidateDates = proposedDates(key, { frequency: parsed.data.frequency, weekdays, until: parsed.data.until });
  const end = candidateDates.at(-1) || key;
  const rows = await Schedule.find({ userId: req.user._id, startDate: { $lte: end } }).lean();
  const conflicts = candidateDates.flatMap((day) => conflictRows(rows, day, startTime, endTime, excludeId, parsed.data.allDay === "true").map((row) => ({ ...row, date: day })));
  res.json({ conflicts });
}));
scheduleRouter.get("/", asyncRoute(async (req, res) => {
  const parsed = z.object({ from: date, to: date, search: z.string().max(80).optional().default(""), category: z.enum(categories).optional(), status: z.enum(["pending", "completed", "skipped", "all"]).optional().default("all"), recurring: z.enum(["yes", "no", "all"]).optional().default("all"), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(100) }).safeParse(req.query);
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message || "Use valid date filters.");
  const f = parsed.data;
  if (f.to < f.from) return fail(res, 400, "End date must be on or after start date.");
  if ((new Date(`${f.to}T00:00:00Z`) - new Date(`${f.from}T00:00:00Z`)) / 86400000 > 366) return fail(res, 400, "Choose a date range of 367 days or less.");
  const query = { userId: req.user._id, $or: [
    { startDate: { $gte: f.from, $lte: f.to } },
    { startDate: { $lt: f.from }, "recurrence.frequency": { $ne: "none" }, $or: [{ "recurrence.until": "" }, { "recurrence.until": { $gte: f.from } }] },
  ] };
  const all = await Schedule.find(query).lean();
  let items = all.flatMap((series) => expand(series, f.from, f.to));
  if (f.search) { const needle = f.search.toLocaleLowerCase(); items = items.filter((x) => `${x.title} ${x.description} ${x.notes}`.toLocaleLowerCase().includes(needle)); }
  if (f.category) items = items.filter((x) => x.category === f.category);
  if (f.status !== "all") items = items.filter((x) => x.status === f.status);
  if (f.recurring !== "all") items = items.filter((x) => x.recurring === (f.recurring === "yes"));
  items.sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate) || (a.allDay ? "00:00" : a.startTime).localeCompare(b.allDay ? "00:00" : b.startTime) || a.title.localeCompare(b.title));
  const summary = { totalEvents: items.length, completed: items.filter((x) => x.status === "completed").length, remaining: items.filter((x) => x.status === "pending").length, missed: items.filter((x) => x.status === "skipped").length, plannedMinutes: items.reduce((sum, x) => { if (x.allDay) return sum + 1440; const start = Number(x.startTime.slice(0, 2)) * 60 + Number(x.startTime.slice(3)); const end = Number(x.endTime.slice(0, 2)) * 60 + Number(x.endTime.slice(3)); return sum + end - start; }, 0) };
  res.json({ items: items.slice((f.page - 1) * f.limit, f.page * f.limit), summary, pagination: { page: f.page, limit: f.limit, total: items.length, pages: Math.ceil(items.length / f.limit) } });
}));
scheduleRouter.post("/", asyncRoute(async (req, res) => {
  const parsed = scheduleInput.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message || "Invalid schedule.");
  const schedule = await Schedule.create({ ...parsed.data, userId: req.user._id, timezone: req.user.settings?.timezone || "Asia/Kolkata" });
  const candidateDates = proposedDates(parsed.data.startDate, parsed.data.recurrence);
  const rows = await Schedule.find({ userId: req.user._id, startDate: { $lte: candidateDates.at(-1) || parsed.data.startDate }, _id: { $ne: schedule._id } }).lean();
  const conflicts = candidateDates.flatMap((day) => conflictRows(rows, day, parsed.data.startTime, parsed.data.endTime, "", parsed.data.allDay).map((row) => ({ ...row, date: day })));
  res.status(201).json({ item: asOccurrence(schedule.toObject(), schedule.startDate), conflicts });
}));
scheduleRouter.patch("/:id/status", asyncRoute(async (req, res) => {
  if (!objectId(req.params.id)) return fail(res, 400, "Invalid schedule id.");
  const parsed = z.object({ date, status: z.enum(["pending", "completed", "skipped"]) }).strict().safeParse(req.body);
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message || "Invalid status update.");
  const series = await ownedSeries(req.params.id, req);
  if (!series) return fail(res, 404, "Schedule not found.");
  const { date: key, status } = parsed.data;
  if (!isOccurrence(series, key)) return fail(res, 404, "Schedule occurrence not found.");
  const occurrence = series.occurrences.find((x) => x.date === key);
  if (occurrence?.canceled) return fail(res, 404, "Schedule occurrence not found.");
  if (occurrence) occurrence.status = status;
  else series.occurrences.push({ date: key, status });
  await series.save();
  res.json({ item: asOccurrence(series.toObject(), key) });
}));
scheduleRouter.put("/:id", asyncRoute(async (req, res) => {
  if (!objectId(req.params.id)) return fail(res, 400, "Invalid schedule id.");
  const parsed = scheduleInput.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message || "Invalid schedule.");
  const mode = z.enum(["occurrence", "future", "series"]).safeParse(req.query.mode || "series");
  const occurrenceDate = date.safeParse(req.query.date);
  if (!mode.success || !occurrenceDate.success) return fail(res, 400, "Choose a valid edit scope and occurrence date.");
  const series = await ownedSeries(req.params.id, req);
  if (!series) return fail(res, 404, "Schedule not found.");
  const key = occurrenceDate.data;
  if (!isOccurrence(series, key)) return fail(res, 404, "Schedule occurrence not found.");
  if (mode.data === "occurrence") {
    if (parsed.data.startDate !== key) {
      let previous = series.occurrences.find((x) => x.date === key);
      if (!previous) { series.occurrences.push({ date: key, canceled: true }); previous = series.occurrences.at(-1); }
      else previous.canceled = true;
      let moved = series.occurrences.find((x) => x.date === parsed.data.startDate);
      if (!moved) { series.occurrences.push({ date: parsed.data.startDate }); moved = series.occurrences.at(-1); }
      Object.assign(moved, parsed.data, { date: parsed.data.startDate, movedFrom: key, canceled: false });
      await series.save();
      return res.json({ item: asOccurrence(series.toObject(), parsed.data.startDate), conflicts: [] });
    }
    let item = series.occurrences.find((x) => x.date === key);
    if (!item) { series.occurrences.push({ date: key }); item = series.occurrences.at(-1); }
    Object.assign(item, parsed.data, { date: key });
    await series.save();
    return res.json({ item: asOccurrence(series.toObject(), key), conflicts: [] });
  }
  if (mode.data === "future" && key > series.startDate) {
    series.recurrence.until = addDays(key, -1);
    await series.save();
    const next = await Schedule.create({ ...parsed.data, startDate: key, userId: req.user._id, timezone: series.timezone || "Asia/Kolkata" });
    return res.json({ item: asOccurrence(next.toObject(), key), conflicts: [] });
  }
  Object.assign(series, parsed.data);
  await series.save();
  res.json({ item: asOccurrence(series.toObject(), key), conflicts: [] });
}));
scheduleRouter.delete("/:id", asyncRoute(async (req, res) => {
  if (!objectId(req.params.id)) return fail(res, 400, "Invalid schedule id.");
  const mode = z.enum(["occurrence", "future", "series"]).safeParse(req.query.mode || "series");
  const occurrenceDate = date.safeParse(req.query.date);
  if (!mode.success || !occurrenceDate.success) return fail(res, 400, "Choose a valid delete scope and occurrence date.");
  const series = await ownedSeries(req.params.id, req);
  if (!series) return fail(res, 404, "Schedule not found.");
  const key = occurrenceDate.data;
  if (!isOccurrence(series, key)) return fail(res, 404, "Schedule occurrence not found.");
  if (mode.data === "series") await series.deleteOne();
  else if (mode.data === "future" && key <= series.startDate) await series.deleteOne();
  else if (mode.data === "future") { series.recurrence.until = addDays(key, -1); await series.save(); }
  else { const existing = series.occurrences.find((x) => x.date === key); if (existing) existing.canceled = true; else series.occurrences.push({ date: key, canceled: true }); await series.save(); }
  res.json({ ok: true });
}));
