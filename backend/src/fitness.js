import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { FitnessExercise, RunningSession, Workout } from "./models.js";

export const fitnessRouter = Router();
const categories = ["Cardio", "Chest", "Back", "Shoulders", "Arms", "Legs", "Core / Abs"];
const definitions = [
  ["Running", "Cardio", "cardio"], ["Walking", "Cardio", "cardio"], ["Cycling", "Cardio", "cardio"], ["Jump Rope", "Cardio", "cardio"], ["Swimming", "Cardio", "cardio"], ["Treadmill", "Cardio", "cardio"],
  ["Push-ups", "Chest", "strength"], ["Bench Press", "Chest", "strength"], ["Incline Bench Press", "Chest", "strength"], ["Dumbbell Fly", "Chest", "strength"],
  ["Pull-ups", "Back", "strength"], ["Lat Pulldown", "Back", "strength"], ["Seated Cable Row", "Back", "strength"], ["Dumbbell Row", "Back", "strength"],
  ["Shoulder Press", "Shoulders", "strength"], ["Lateral Raises", "Shoulders", "strength"], ["Front Raises", "Shoulders", "strength"],
  ["Bicep Curls", "Arms", "strength"], ["Hammer Curls", "Arms", "strength"], ["Tricep Pushdowns", "Arms", "strength"], ["Tricep Dips", "Arms", "strength"],
  ["Squats", "Legs", "strength"], ["Lunges", "Legs", "strength"], ["Leg Press", "Legs", "strength"], ["Leg Extensions", "Legs", "strength"], ["Calf Raises", "Legs", "strength"],
  ["Plank", "Core / Abs", "duration"], ["Crunches", "Core / Abs", "repetition"], ["Leg Raises", "Core / Abs", "repetition"], ["Mountain Climbers", "Core / Abs", "repetition"], ["Bicycle Crunches", "Core / Abs", "repetition"],
].map(([name, category, type]) => ({ id: `builtin:${name}`, name, category, type, custom: false }));
const customInput = z.object({ name: z.string().trim().min(1).max(80), category: z.enum(categories), type: z.enum(["strength", "cardio", "duration", "repetition"]), description: z.string().trim().max(500).optional().default("") }).strict();
const exerciseRow = z.object({ exerciseId: z.string().optional().nullable(), name: z.string().trim().min(1).max(80), category: z.string().trim().min(1).max(40), type: z.enum(["strength", "cardio", "duration", "repetition"]), sets: z.number().int().min(1).max(100).nullable().optional(), reps: z.number().int().min(1).max(10000).nullable().optional(), weightKg: z.number().min(0).max(10000).nullable().optional(), durationMinutes: z.number().int().min(1).max(1440).nullable().optional(), distanceKm: z.number().min(0).max(1000).nullable().optional(), notes: z.string().max(500).optional().default("") }).strict().superRefine((x, ctx) => { if (x.type === "strength" && (!x.sets || !x.reps)) ctx.addIssue({ code: "custom", message: "Strength exercises need sets and repetitions." }); if (["cardio", "duration"].includes(x.type) && !x.durationMinutes) ctx.addIssue({ code: "custom", message: "Enter the exercise duration in minutes." }); if (x.type === "repetition" && !x.reps) ctx.addIssue({ code: "custom", message: "Enter the number of repetitions." }); });
const workoutInput = z.object({ workoutDate: z.string().datetime({ offset: true }), notes: z.string().max(2000).optional().default(""), exercises: z.array(exerciseRow).min(1).max(50) }).strict();
const runInput = z.object({ sessionDate: z.string().datetime({ offset: true }), durationMinutes: z.number().int().min(1).max(1440), distanceKm: z.number().positive().max(1000), startTime: z.string().max(5).optional().default(""), notes: z.string().max(1000).optional().default("") }).strict();
const uid = (req) => req.user._id;
const day = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const monday = (key) => { const d = new Date(`${key}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10); };
const startAt = (key) => new Date(`${key}T00:00:00+05:30`);
const escape = (value) => String(value).slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const parse = (schema, body, res) => { const result = schema.safeParse(body); if (!result.success) { res.status(400).json({ error: result.error.issues[0]?.message || "Invalid fitness record." }); return null; } return result.data; };
const snapshotExercises = async (exercises, req) => {
  const ids = exercises.map((x) => x.exerciseId).filter((x) => x && mongoose.isValidObjectId(x));
  const owned = ids.length ? await FitnessExercise.find({ _id: { $in: ids }, userId: uid(req) }).lean() : [];
  const byId = new Map(owned.map((x) => [String(x._id), x]));
  for (const exercise of exercises) if (exercise.exerciseId && !String(exercise.exerciseId).startsWith("builtin:")) {
    const definition = byId.get(String(exercise.exerciseId));
    if (!definition) throw Object.assign(new Error("Choose a custom exercise from your own exercise library."), { status: 400 });
    exercise.name = definition.name; exercise.category = definition.category; exercise.type = definition.type;
  }
  return exercises;
};

fitnessRouter.get("/exercises", async (req, res) => {
  const custom = await FitnessExercise.find({ userId: uid(req) }).sort({ category: 1, name: 1 }).lean();
  res.json({ items: [...definitions, ...custom.map((x) => ({ id: String(x._id), _id: String(x._id), name: x.name, category: x.category, type: x.type, description: x.description, custom: true }))] });
});
fitnessRouter.post("/exercises", async (req, res) => {
  const data = parse(customInput, req.body, res); if (!data) return;
  try { const item = await FitnessExercise.create({ ...data, userId: uid(req) }); res.status(201).json({ item }); }
  catch (e) { if (e.code === 11000) return res.status(409).json({ error: "A custom exercise with that name already exists." }); throw e; }
});
fitnessRouter.patch("/exercises/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Custom exercise not found." });
  const data = parse(customInput.partial(), req.body, res); if (!data) return;
  try { const item = await FitnessExercise.findOneAndUpdate({ _id: req.params.id, userId: uid(req) }, data, { new: true, runValidators: true }); if (!item) return res.status(404).json({ error: "Custom exercise not found." }); res.json({ item }); }
  catch (e) { if (e.code === 11000) return res.status(409).json({ error: "A custom exercise with that name already exists." }); throw e; }
});
fitnessRouter.delete("/exercises/:id", async (req, res) => { const item = await FitnessExercise.findOneAndDelete({ _id: req.params.id, userId: uid(req) }); if (!item) return res.status(404).json({ error: "Custom exercise not found." }); res.json({ ok: true }); });

fitnessRouter.get("/summary", async (req, res) => {
  const today = day(new Date()), week = monday(today), month = `${today.slice(0, 7)}-01`, start = startAt("2000-01-01");
  const [workouts, runs] = await Promise.all([Workout.find({ userId: uid(req), workoutDate: { $gte: start } }).lean(), RunningSession.find({ userId: uid(req), sessionDate: { $gte: start } }).lean()]);
  const allEvents = [...workouts.map((x) => ({ date: day(x.workoutDate), type: "workout", item: x })), ...runs.map((x) => ({ date: day(x.sessionDate), type: "run", item: x }))].sort((a, b) => b.date.localeCompare(a.date));
  const workoutMins = (w) => w.exercises.reduce((n, e) => n + (e.durationMinutes || 0), 0);
  let streak = 0, cursor = today;
  const active = new Set(allEvents.map((x) => x.date));
  if (!active.has(cursor)) { const d = new Date(`${cursor}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); cursor = d.toISOString().slice(0, 10); }
  while (active.has(cursor)) { streak++; const d = new Date(`${cursor}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); cursor = d.toISOString().slice(0, 10); }
  const inRange = (x, from, to) => x >= from && x <= to;
  const thisWeekW = workouts.filter((x) => inRange(day(x.workoutDate), week, today));
  const thisWeekR = runs.filter((x) => inRange(day(x.sessionDate), week, today));
  const thisMonthR = runs.filter((x) => day(x.sessionDate).slice(0, 7) === today.slice(0, 7));
  const todayW = workouts.filter((x) => day(x.workoutDate) === today), todayR = runs.filter((x) => day(x.sessionDate) === today);
  const categoryMap = new Map(); for (const w of workouts) for (const e of w.exercises) categoryMap.set(e.category, (categoryMap.get(e.category) || 0) + 1);
  const weekly = Array.from({ length: 7 }, (_, i) => { const date = new Date(`${week}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + i); const key = date.toISOString().slice(0, 10); return { date: key, workouts: workouts.filter((w) => day(w.workoutDate) === key).length, runs: runs.filter((r) => day(r.sessionDate) === key).length, minutes: workouts.filter((w) => day(w.workoutDate) === key).reduce((n, w) => n + workoutMins(w), 0) + runs.filter((r) => day(r.sessionDate) === key).reduce((n, r) => n + r.durationMinutes, 0) }; });
  const monthly = Array.from({ length: 6 }, (_, i) => { const dt = new Date(`${today.slice(0, 7)}-01T00:00:00Z`); dt.setUTCMonth(dt.getUTCMonth() - (5 - i)); const key = dt.toISOString().slice(0, 7); return { month: key, distanceKm: runs.filter((r) => day(r.sessionDate).slice(0, 7) === key).reduce((n, r) => n + r.distanceKm, 0) }; });
  const totalDuration = workouts.reduce((n, w) => n + workoutMins(w), 0) + runs.reduce((n, r) => n + r.durationMinutes, 0);
  const averagePace = runs.length ? runs.reduce((n, r) => n + r.durationMinutes / r.distanceKm, 0) / runs.length : null;
  res.json({ totals: { workouts: workouts.length, runningDistanceKm: runs.reduce((n, r) => n + r.distanceKm, 0), durationMinutes: totalDuration, activeDays: active.size, streak, weekWorkouts: thisWeekW.length }, today: { workoutCount: todayW.length, exerciseCount: todayW.reduce((n, w) => n + w.exercises.length, 0), durationMinutes: todayW.reduce((n, w) => n + workoutMins(w), 0) + todayR.reduce((n, r) => n + r.durationMinutes, 0), runningDistanceKm: todayR.reduce((n, r) => n + r.distanceKm, 0), runningMinutes: todayR.reduce((n, r) => n + r.durationMinutes, 0) }, week: { workouts: thisWeekW.length, distanceKm: thisWeekR.reduce((n, r) => n + r.distanceKm, 0), durationMinutes: thisWeekW.reduce((n, w) => n + workoutMins(w), 0) + thisWeekR.reduce((n, r) => n + r.durationMinutes, 0) }, month: { runningDistanceKm: thisMonthR.reduce((n, r) => n + r.distanceKm, 0) }, averagePaceMinutesPerKm: averagePace, weekly, monthly, categories: [...categoryMap].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value), recent: allEvents.slice(0, 8) });
});

fitnessRouter.get("/workouts", async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page) || 1), limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit) || 10));
  const q = { userId: uid(req) };
  const validDate = (x) => /^\d{4}-\d{2}-\d{2}$/.test(String(x || ""));
  if (req.query.from && !validDate(req.query.from) || req.query.to && !validDate(req.query.to)) return res.status(400).json({ error: "Use dates in YYYY-MM-DD format." });
  if (req.query.from || req.query.to) { q.workoutDate = {}; if (req.query.from) q.workoutDate.$gte = startAt(req.query.from); if (req.query.to) q.workoutDate.$lt = new Date(startAt(req.query.to).getTime() + 86400000); }
  if (req.query.exercise) q["exercises.name"] = new RegExp(escape(req.query.exercise), "i");
  if (req.query.search) q.$or = [{ notes: new RegExp(escape(req.query.search), "i") }, { "exercises.name": new RegExp(escape(req.query.search), "i") }];
  const [items, total] = await Promise.all([Workout.find(q).sort({ workoutDate: -1 }).skip((page - 1) * limit).limit(limit).lean(), Workout.countDocuments(q)]);
  res.json({ items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});
fitnessRouter.post("/workouts", async (req, res) => { const d = parse(workoutInput, req.body, res); if (!d) return; d.exercises = await snapshotExercises(d.exercises, req); const item = await Workout.create({ ...d, workoutDate: new Date(d.workoutDate), userId: uid(req) }); res.status(201).json({ item }); });
fitnessRouter.get("/workouts/:id", async (req, res) => { const item = await Workout.findOne({ _id: req.params.id, userId: uid(req) }); if (!item) return res.status(404).json({ error: "Workout not found." }); res.json({ item }); });
fitnessRouter.patch("/workouts/:id", async (req, res) => { const d = parse(workoutInput.partial(), req.body, res); if (!d) return; if (d.exercises) d.exercises = await snapshotExercises(d.exercises, req); if (d.workoutDate) d.workoutDate = new Date(d.workoutDate); const item = await Workout.findOneAndUpdate({ _id: req.params.id, userId: uid(req) }, d, { new: true, runValidators: true }); if (!item) return res.status(404).json({ error: "Workout not found." }); res.json({ item }); });
fitnessRouter.delete("/workouts/:id", async (req, res) => { const item = await Workout.findOneAndDelete({ _id: req.params.id, userId: uid(req) }); if (!item) return res.status(404).json({ error: "Workout not found." }); res.json({ ok: true }); });
fitnessRouter.get("/runs", async (req, res) => { const page = Math.max(1, Number.parseInt(req.query.page) || 1), limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit) || 10)); const q = { userId: uid(req) }; const [items, total] = await Promise.all([RunningSession.find(q).sort({ sessionDate: -1 }).skip((page - 1) * limit).limit(limit).lean(), RunningSession.countDocuments(q)]); res.json({ items: items.map((x) => ({ ...x, paceMinutesPerKm: x.durationMinutes / x.distanceKm, speedKmh: x.distanceKm / (x.durationMinutes / 60) })), pagination: { page, limit, total, pages: Math.ceil(total / limit) } }); });
fitnessRouter.post("/runs", async (req, res) => { const d = parse(runInput, req.body, res); if (!d) return; const item = await RunningSession.create({ ...d, sessionDate: new Date(d.sessionDate), userId: uid(req) }); res.status(201).json({ item: { ...item.toObject(), paceMinutesPerKm: d.durationMinutes / d.distanceKm, speedKmh: d.distanceKm / (d.durationMinutes / 60) } }); });
fitnessRouter.patch("/runs/:id", async (req, res) => { const d = parse(runInput.partial(), req.body, res); if (!d) return; if (d.sessionDate) d.sessionDate = new Date(d.sessionDate); const item = await RunningSession.findOneAndUpdate({ _id: req.params.id, userId: uid(req) }, d, { new: true, runValidators: true }); if (!item) return res.status(404).json({ error: "Run not found." }); res.json({ item: { ...item.toObject(), paceMinutesPerKm: item.durationMinutes / item.distanceKm, speedKmh: item.distanceKm / (item.durationMinutes / 60) } }); });
fitnessRouter.delete("/runs/:id", async (req, res) => { const item = await RunningSession.findOneAndDelete({ _id: req.params.id, userId: uid(req) }); if (!item) return res.status(404).json({ error: "Run not found." }); res.json({ ok: true }); });
