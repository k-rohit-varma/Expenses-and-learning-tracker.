import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { config } from "./config.js";
import { Expense, LearningSession, User, DailyReview, WeeklyBudget, LearningSubject } from "./models.js";
import { asyncRoute, bounds, expenseInput, learningInput, localDay } from "./util.js";
import { addCalendarDays, budgetInput, mondayOf, weeklyBudgetReport, weekStartSchema } from "./budget.js";

export const app = express();
app.use(helmet());
app.use("/api/auth", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
app.use(cors({ origin: config.frontendOrigin, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
const cookie = {
  httpOnly: true,
  sameSite: "lax",
  secure: config.production,
  maxAge: 7 * 86400000,
  path: "/",
};
export const auth = asyncRoute(async (req, res, next) => {
  const token = req.cookies.lifeledger;
  if (!token) {
    console.warn("Authentication rejected", { reason: "cookie_missing", method: req.method, path: req.path });
    return res.status(401).json({ error: "Please sign in to continue." });
  }
  let decoded;
  try {
    decoded = jwt.verify(token, config.authSecret);
  } catch (error) {
    const reason = error.name === "TokenExpiredError" ? "token_expired" : "token_invalid";
    console.warn("Authentication rejected", { reason, method: req.method, path: req.path });
    res.clearCookie("lifeledger", cookie);
    return res.status(401).json({ error: reason === "token_expired" ? "Your session expired. Please sign in again." : "Your session is invalid. Please sign in again." });
  }
  try {
    req.user = await User.findById(decoded.sub);
  } catch (error) {
    console.error("Authentication lookup failed", { reason: "user_lookup_error", method: req.method, path: req.path, error: error.name });
    return res.status(503).json({ error: "Authentication is temporarily unavailable. Please try again." });
  }
  if (!req.user) {
    console.warn("Authentication rejected", { reason: "user_missing", method: req.method, path: req.path });
  } else if (req.user.status !== "active") {
    console.warn("Authentication rejected", { reason: `account_${req.user.status || "inactive"}`, method: req.method, path: req.path });
  } else if (decoded.ver !== req.user.tokenVersion) {
    console.warn("Authentication rejected", { reason: "token_revoked", method: req.method, path: req.path });
  }
  if (!req.user || req.user.status !== "active" || decoded.ver !== req.user.tokenVersion) {
    res.clearCookie("lifeledger", cookie);
    return res.status(401).json({ error: "Your session is no longer valid. Please sign in again." });
  }
  next();
});
const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
});
const registerLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });
const validate = (schema) => (req, res, next) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({ error: parsed.error.issues[0]?.message || "Invalid request." });
  req.validated = parsed.data;
  next();
};
const userId = (req) => req.user._id;
const safeUser = (account) => ({ username: account.username, role: account.role, settings: account.settings });
export const requireOwner = (req, res, next) => req.user?.role === "owner" ? next() : res.status(403).json({ error: "Owner access is required." });
const pageParams = (req) => ({
  page: Math.max(1, Number.parseInt(req.query.page) || 1),
  limit: Math.min(100, Math.max(1, Number.parseInt(req.query.limit) || 20)),
});
const expenseWire = (x) => ({ ...x.toObject(), amount: x.amountPaise / 100 });
const toPaise = (x) => Math.round(x * 100);
const indiaStart = (date) => new Date(`${date}T00:00:00+05:30`);
const midnightAfter = (date) => indiaStart(addCalendarDays(date, 1));
const dateKeyShift = (date, days) => addCalendarDays(date, days);
const listQuery = (req, field) => {
  const q = {
    userId: userId(req),
    [field]: bounds(req.query.from, req.query.to),
  };
  if (req.query.search)
    q.$or = [
      {
        description: new RegExp(
          String(req.query.search)
            .slice(0, 80)
            .replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          "i",
        ),
      },
      {
        notes: new RegExp(
          String(req.query.search)
            .slice(0, 80)
            .replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          "i",
        ),
      },
    ];
  return q;
};
app.get("/api/health", (req, res) => {
  const connected = mongoose.connection.readyState === 1;
  res
    .status(connected ? 200 : 503)
    .json({
      status: connected ? "ok" : "unavailable",
      database: connected ? "connected" : "unavailable",
    });
});
app.post(
  "/api/auth/login",
  loginLimit,
  asyncRoute(async (req, res) => {
    const parsed = zLogin.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ error: "Enter your username and password." });
    const account = await User.findOne({ username: parsed.data.username.toLowerCase() });
    if (
      !account ||
      Buffer.byteLength(parsed.data.password, "utf8") > 72 ||
      !(await bcrypt.compare(parsed.data.password, account.passwordHash))
    )
      return res.status(401).json({ error: "Incorrect username or password." });
    if (account.status === "pending_approval") return res.status(403).json({ code: "PENDING_APPROVAL", error: "Your account is waiting for administrator approval." });
    if (account.status === "blocked") return res.status(403).json({ code: "ACCOUNT_BLOCKED", error: "This account has been blocked. Contact the administrator." });
    if (account.status === "rejected") return res.status(403).json({ code: "ACCOUNT_REJECTED", error: "This registration was rejected by the administrator." });
    account.lastLoginAt = new Date();
    await account.save();
    res.cookie(
      "lifeledger",
      jwt.sign({ sub: account.id, ver: account.tokenVersion }, config.authSecret, { expiresIn: "7d" }),
      cookie,
    );
    res.json({ user: safeUser(account) });
  }),
);
app.post("/api/auth/register", registerLimit, asyncRoute(async (req, res) => {
  const parsed = zRegister.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Use a 3–30 character username and a password with at least 10 characters." });
  if (Buffer.byteLength(parsed.data.password, "utf8") > 72) return res.status(400).json({ error: "Password must be 72 bytes or fewer." });
  try {
    const account = await User.create({ username: parsed.data.username, passwordHash: await bcrypt.hash(parsed.data.password, 12), role: "user", status: "pending_approval" });
    res.status(201).json({ username: account.username, status: account.status, message: "Your account is waiting for administrator approval." });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: "That username is unavailable." });
    throw error;
  }
}));
app.post("/api/auth/logout", auth, asyncRoute(async (req, res) => {
  req.user.tokenVersion += 1;
  await req.user.save();
  res.clearCookie("lifeledger", cookie);
  res.json({ ok: true });
}));
app.get("/api/auth/me", auth, (req, res) =>
  res.json({ user: safeUser(req.user) }),
);
import { z as zod } from "zod";
const zLogin = zod.object({
  username: zod.string().trim().min(1).max(100),
  password: zod.string().min(1).max(72),
});
export const learningSubjectInput = zod.object({
  name: zod.string().trim().min(1).max(60),
  description: zod.string().trim().max(500).optional().default(""),
  icon: zod.enum(["BookOpen", "Code2", "Languages", "Wallet", "Brain", "Sparkles"]).optional().default("BookOpen"),
  color: zod.string().regex(/^#[0-9a-fA-F]{6}$/).optional().default("#637ee8"),
  weeklyGoalMinutes: zod.number().int().min(1).max(10080).nullable().optional().default(null),
}).strict();
export const subjectPatchInput = learningSubjectInput.partial().extend({ archived: zod.boolean().optional() }).strict();
export const zRegister = zod.object({
  username: zod.string().trim().toLowerCase().regex(/^[a-z0-9_.-]{3,30}$/),
  password: zod.string().min(10).max(72),
}).strict();

app.use("/api", auth);
app.use("/api", (req, res, next) => {
  if (
    ["POST", "PUT", "PATCH", "DELETE"].includes(req.method) &&
    req.get("Origin") !== config.frontendOrigin
  ) {
    return res.status(403).json({ error: "Request origin is not allowed." });
  }
  next();
});
const subjectStatsFor = (sessions, subjectId) => {
  const matching = sessions.filter((session) => String(session.subjectId) === String(subjectId));
  const now = localDay(new Date());
  const weekStart = mondayOf(now);
  const weekStartAt = indiaStart(weekStart);
  const tomorrowAt = midnightAfter(now);
  const monthStart = indiaStart(`${now.slice(0, 7)}-01`);
  const latest = matching.reduce((value, item) => !value || item.sessionDate > value ? item.sessionDate : value, null);
  return {
    totalMinutes: matching.reduce((sum, item) => sum + item.durationMinutes, 0),
    sessionCount: matching.length,
    weekMinutes: matching.filter((item) => item.sessionDate >= weekStartAt && item.sessionDate < tomorrowAt).reduce((sum, item) => sum + item.durationMinutes, 0),
    monthMinutes: matching.filter((item) => item.sessionDate >= monthStart && item.sessionDate < tomorrowAt).reduce((sum, item) => sum + item.durationMinutes, 0),
    lastStudied: latest,
  };
};
app.get("/api/learning/subjects", asyncRoute(async (req, res) => {
  const [items, sessions] = await Promise.all([
    LearningSubject.find({ userId: userId(req) }).sort({ archived: 1, name: 1 }).lean(),
    LearningSession.find({ userId: userId(req) }).select("subjectId subject durationMinutes sessionDate").lean(),
  ]);
  res.json({ items: items.map((item) => ({ ...item, ...subjectStatsFor(sessions, item._id) })) });
}));
app.post("/api/learning/subjects", asyncRoute(async (req, res) => {
  const parsed = learningSubjectInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Enter a valid subject." });
  const data = parsed.data;
  const duplicate = await LearningSubject.findOne({ userId: userId(req), name: data.name }).collation({ locale: "en", strength: 2 });
  if (duplicate) return res.status(409).json({ error: "You already have a subject with that name." });
  try {
    const subject = await LearningSubject.create({ ...data, userId: userId(req) });
    res.status(201).json({ subject });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: "You already have a subject with that name." });
    throw error;
  }
}));
app.get("/api/learning/overview", asyncRoute(async (req, res) => {
  const today = localDay(new Date());
  const monthStart = `${today.slice(0, 7)}-01`;
  const start = req.query.from ? String(req.query.from) : req.query.range === "all" ? "2000-01-01" : req.query.range === "week" ? mondayOf(today) : req.query.range === "30d" ? dateKeyShift(today, -29) : monthStart;
  const end = req.query.to ? String(req.query.to) : today;
  const interval = bounds(start, end);
  const [allSessions, subjects] = await Promise.all([
    LearningSession.find({ userId: userId(req) }).select("subjectId durationMinutes sessionDate").lean(),
    LearningSubject.find({ userId: userId(req) }).lean(),
  ]);
  const selected = req.query.range === "all" && !req.query.from
    ? allSessions
    : allSessions.filter((item) => item.sessionDate >= interval.$gte && item.sessionDate < interval.$lt);
  const group = (rows) => rows.reduce((map, session) => {
    const key = String(session.subjectId);
    map.set(key, (map.get(key) || 0) + session.durationMinutes);
    return map;
  }, new Map());
  const grouped = group(selected);
  const allGrouped = group(allSessions);
  const byId = new Map(subjects.map((item) => [String(item._id), item]));
  const bySubject = [...grouped].map(([id, minutes]) => ({ subjectId: id, name: byId.get(id)?.name || "Uncategorized", color: byId.get(id)?.color || "#89909e", icon: byId.get(id)?.icon || "BookOpen", minutes })).sort((a, b) => b.minutes - a.minutes);
  const mostStudied = [...allGrouped].map(([id, minutes]) => ({ subjectId: id, name: byId.get(id)?.name || "Uncategorized", minutes })).sort((a, b) => b.minutes - a.minutes)[0] || null;
  const weekStart = indiaStart(mondayOf(today));
  const tomorrow = midnightAfter(today);
  const monthBegin = indiaStart(monthStart);
  const totalMinutes = selected.reduce((sum, item) => sum + item.durationMinutes, 0);
  const trendMap = new Map();
  for (const item of selected) {
    const day = localDay(item.sessionDate);
    trendMap.set(day, (trendMap.get(day) || 0) + item.durationMinutes);
  }
  res.json({
    range: { from: start, to: end },
    totalMinutes,
    sessions: selected.length,
    allTimeMinutes: allSessions.reduce((sum, item) => sum + item.durationMinutes, 0),
    allTimeSessions: allSessions.length,
    weekMinutes: allSessions.filter((item) => item.sessionDate >= weekStart && item.sessionDate < tomorrow).reduce((sum, item) => sum + item.durationMinutes, 0),
    monthMinutes: allSessions.filter((item) => item.sessionDate >= monthBegin && item.sessionDate < tomorrow).reduce((sum, item) => sum + item.durationMinutes, 0),
    mostStudied,
    bySubject,
    trend: [...trendMap].sort(([a], [b]) => a.localeCompare(b)).map(([date, minutes]) => ({ date, minutes })),
  });
}));
app.get("/api/learning/subjects/:id", asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Learning subject not found." });
  const subject = await LearningSubject.findOne({ _id: req.params.id, userId: userId(req) }).lean();
  if (!subject) return res.status(404).json({ error: "Learning subject not found." });
  const sessions = await LearningSession.find({ userId: userId(req), subjectId: subject._id }).sort({ sessionDate: -1 }).lean();
  const stats = subjectStatsFor(sessions, subject._id);
  const today = localDay(new Date());
  const weekStart = mondayOf(today);
  const dailyTrend = Array.from({ length: 7 }, (_, index) => {
    const date = dateKeyShift(weekStart, index);
    const lo = indiaStart(date), hi = midnightAfter(date);
    return { date, minutes: sessions.filter((item) => item.sessionDate >= lo && item.sessionDate < hi).reduce((sum, item) => sum + item.durationMinutes, 0) };
  });
  const weeklyTrend = Array.from({ length: 8 }, (_, index) => {
    const startDate = dateKeyShift(weekStart, (index - 7) * 7);
    const lo = indiaStart(startDate), hi = indiaStart(dateKeyShift(startDate, 7));
    return { weekStart: startDate, minutes: sessions.filter((item) => item.sessionDate >= lo && item.sessionDate < hi).reduce((sum, item) => sum + item.durationMinutes, 0) };
  });
  const currentMonth = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  const monthlyTrend = Array.from({ length: 6 }, (_, index) => {
    const start = new Date(currentMonth);
    start.setUTCMonth(start.getUTCMonth() + index - 5);
    const startDate = start.toISOString().slice(0, 10);
    const next = new Date(start);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const endDate = next.toISOString().slice(0, 10);
    const lo = indiaStart(startDate), hi = indiaStart(endDate);
    return { month: startDate.slice(0, 7), minutes: sessions.filter((item) => item.sessionDate >= lo && item.sessionDate < hi).reduce((sum, item) => sum + item.durationMinutes, 0) };
  });
  res.json({ subject: { ...subject, ...stats }, recentSession: sessions[0] || null, dailyTrend, weeklyTrend, monthlyTrend });
}));
app.patch("/api/learning/subjects/:id", asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Learning subject not found." });
  const parsed = subjectPatchInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Enter valid subject details." });
  if (!Object.keys(parsed.data).length) return res.status(400).json({ error: "Make at least one subject change." });
  const subjectQuery = { _id: req.params.id, userId: userId(req) };
  const subject = await LearningSubject.findOne(subjectQuery);
  if (!subject) return res.status(404).json({ error: "Learning subject not found." });
  if (parsed.data.name && parsed.data.name.toLocaleLowerCase() !== subject.name.toLocaleLowerCase()) {
    const duplicate = await LearningSubject.findOne({ userId: userId(req), name: parsed.data.name, _id: { $ne: subject._id } }).collation({ locale: "en", strength: 2 });
    if (duplicate) return res.status(409).json({ error: "You already have a subject with that name." });
  }
  try {
    const previousName = subject.name;
    Object.assign(subject, parsed.data);
    await subject.save();
    if (parsed.data.name && parsed.data.name !== previousName) {
      await LearningSession.updateMany(
        { userId: userId(req), subjectId: subject._id },
        { $set: { subject: subject.name } },
      );
    }
    res.json({ subject });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: "You already have a subject with that name." });
    throw error;
  }
}));
app.get("/api/users", requireOwner, asyncRoute(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const query = { role: "user" };
  if (["pending_approval", "active", "blocked", "rejected"].includes(req.query.status)) query.status = req.query.status;
  else if (req.query.status && req.query.status !== "all") return res.status(400).json({ error: "Invalid account status filter." });
  if (req.query.search) query.username = new RegExp(String(req.query.search).slice(0, 50).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const [items, total] = await Promise.all([
    User.find(query).select("username role status createdAt lastLoginAt").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    User.countDocuments(query),
  ]);
  res.json({ items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}));
app.get("/api/users/pending", requireOwner, asyncRoute(async (_req, res) => {
  const items = await User.find({ role: "user", status: "pending_approval" }).select("username role status createdAt lastLoginAt").sort({ createdAt: 1 }).lean();
  res.json({ items });
}));
const changeUserStatus = (from, status) => asyncRoute(async (req, res) => {
  const target = await User.findOne({ _id: req.params.id, role: "user" });
  if (!target) return res.status(404).json({ error: "User not found." });
  if (target.status !== from) return res.status(409).json({ error: `Only ${from.replaceAll("_", " ")} accounts can be changed this way.` });
  target.status = status;
  target.tokenVersion += 1;
  await target.save();
  res.json({ user: { id: target.id, username: target.username, status: target.status } });
});
app.patch("/api/users/:id/approve", requireOwner, changeUserStatus("pending_approval", "active"));
app.patch("/api/users/:id/reject", requireOwner, changeUserStatus("pending_approval", "rejected"));
app.patch("/api/users/:id/block", requireOwner, changeUserStatus("active", "blocked"));
app.patch("/api/users/:id/unblock", requireOwner, changeUserStatus("blocked", "active"));
app.get(
  "/api/expenses",
  asyncRoute(async (req, res) => {
    const { page, limit } = pageParams(req),
      q = listQuery(req, "transactionDate");
    if (req.query.category) q.category = String(req.query.category);
    if (req.query.paymentMethod)
      q.paymentMethod = String(req.query.paymentMethod);
    if (req.query.minAmount || req.query.maxAmount)
      q.amountPaise = {
        ...(req.query.minAmount
          ? { $gte: toPaise(Number(req.query.minAmount)) }
          : {}),
        ...(req.query.maxAmount
          ? { $lte: toPaise(Number(req.query.maxAmount)) }
          : {}),
      };
    const sort =
      req.query.sort === "amount"
        ? { amountPaise: req.query.order === "asc" ? 1 : -1 }
        : { transactionDate: req.query.order === "asc" ? 1 : -1 };
    const [items, total] = await Promise.all([
      Expense.find(q)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit),
      Expense.countDocuments(q),
    ]);
    res.json({
      items: items.map(expenseWire),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  }),
);
app.post(
  "/api/expenses",
  validate(expenseInput),
  asyncRoute(async (req, res) => {
    const d = req.validated;
    const x = await Expense.create({
      ...d,
      amountPaise: toPaise(d.amount),
      userId: userId(req),
      transactionDate: new Date(d.transactionDate),
    });
    res.status(201).json({ item: expenseWire(x) });
  }),
);
app.get(
  "/api/expenses/:id",
  asyncRoute(async (req, res) => {
    const x = await Expense.findOne({
      _id: req.params.id,
      userId: userId(req),
    });
    if (!x) return res.status(404).json({ error: "Expense not found." });
    res.json({ item: expenseWire(x) });
  }),
);
app.patch(
  "/api/expenses/:id",
  validate(expenseInput.partial()),
  asyncRoute(async (req, res) => {
    const d = { ...req.validated };
    if (d.amount !== undefined) {
      d.amountPaise = toPaise(d.amount);
      delete d.amount;
    }
    if (d.transactionDate) d.transactionDate = new Date(d.transactionDate);
    const x = await Expense.findOneAndUpdate(
      { _id: req.params.id, userId: userId(req) },
      d,
      { new: true, runValidators: true },
    );
    if (!x) return res.status(404).json({ error: "Expense not found." });
    res.json({ item: expenseWire(x) });
  }),
);
app.delete(
  "/api/expenses/:id",
  asyncRoute(async (req, res) => {
    const x = await Expense.findOneAndDelete({
      _id: req.params.id,
      userId: userId(req),
    });
    if (!x) return res.status(404).json({ error: "Expense not found." });
    res.json({ ok: true });
  }),
);

app.get(
  "/api/learning",
  asyncRoute(async (req, res) => {
    const { page, limit } = pageParams(req),
      q = listQuery(req, "sessionDate");
    if (req.query.subjectId) {
      if (!mongoose.isValidObjectId(req.query.subjectId)) return res.status(400).json({ error: "Choose a valid learning subject." });
      q.subjectId = req.query.subjectId;
    } else if (req.query.subject) q.subject = String(req.query.subject);
    if (req.query.search) {
      const re = new RegExp(
        String(req.query.search)
          .slice(0, 80)
          .replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i",
      );
      q.$or = [{ topic: re }, { notes: re }, { whatILearned: re }];
    }
    const [items, total] = await Promise.all([
      LearningSession.find(q)
        .sort({ sessionDate: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      LearningSession.countDocuments(q),
    ]);
    res.json({
      items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  }),
);
app.post(
  "/api/learning",
  validate(learningInput),
  asyncRoute(async (req, res) => {
    const subject = await LearningSubject.findOne({ _id: req.validated.subjectId, userId: userId(req), archived: false });
    if (!subject) return res.status(400).json({ error: "Choose one of your active learning subjects." });
    const x = await LearningSession.create({
      ...req.validated,
      subject: subject.name,
      userId: userId(req),
      sessionDate: new Date(req.validated.sessionDate),
    });
    res.status(201).json({ item: x });
  }),
);
app.get(
  "/api/learning/:id",
  asyncRoute(async (req, res) => {
    const x = await LearningSession.findOne({
      _id: req.params.id,
      userId: userId(req),
    });
    if (!x)
      return res.status(404).json({ error: "Learning session not found." });
    res.json({ item: x });
  }),
);
app.patch(
  "/api/learning/:id",
  validate(learningInput.partial()),
  asyncRoute(async (req, res) => {
    const d = { ...req.validated };
    const existing = await LearningSession.findOne({ _id: req.params.id, userId: userId(req) });
    if (!existing) return res.status(404).json({ error: "Learning session not found." });
    if (d.subjectId) {
      const nextSubject = await LearningSubject.findOne({ _id: d.subjectId, userId: userId(req) });
      if (!nextSubject || (nextSubject.archived && String(existing.subjectId) !== String(nextSubject._id))) {
        return res.status(400).json({ error: "Choose one of your active learning subjects." });
      }
      d.subject = nextSubject.name;
    }
    if (d.sessionDate) d.sessionDate = new Date(d.sessionDate);
    const x = await LearningSession.findOneAndUpdate(
      { _id: req.params.id, userId: userId(req) },
      d,
      { new: true, runValidators: true },
    );
    if (!x)
      return res.status(404).json({ error: "Learning session not found." });
    res.json({ item: x });
  }),
);
app.delete(
  "/api/learning/:id",
  asyncRoute(async (req, res) => {
    const x = await LearningSession.findOneAndDelete({
      _id: req.params.id,
      userId: userId(req),
    });
    if (!x)
      return res.status(404).json({ error: "Learning session not found." });
    res.json({ ok: true });
  }),
);

app.get(
  "/api/dashboard/summary",
  asyncRoute(async (req, res) => {
    const today = new Date(),
      stamp = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(today),
      [y, m, d] = stamp.split("-").map(Number),
      start = new Date(Date.UTC(y, m - 1, d) - 19800000),
      dayEnd = new Date(start.getTime() + 86400000),
      monthStart = new Date(Date.UTC(y, m - 1, 1) - 19800000),
      weekStart = new Date(
        start.getTime() -
          ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) * 86400000,
      ),
      monthEnd = new Date(Date.UTC(y, m, 1) - 19800000);
    const uid = userId(req);
    const [expenses, learning, category, recent, subject, trend] =
      await Promise.all([
        Expense.find({
          userId: uid,
          transactionDate: { $gte: monthStart, $lt: monthEnd },
        }).lean(),
        LearningSession.find({
          userId: uid,
          sessionDate: { $gte: monthStart, $lt: monthEnd },
        }).lean(),
        Expense.aggregate([
          {
            $match: {
              userId: uid,
              transactionDate: { $gte: monthStart, $lt: monthEnd },
            },
          },
          { $group: { _id: "$category", value: { $sum: "$amountPaise" } } },
          { $sort: { value: -1 } },
        ]),
        Expense.find({ userId: uid })
          .sort({ transactionDate: -1 })
          .limit(5)
          .lean(),
        LearningSession.aggregate([
          {
            $match: {
              userId: uid,
              sessionDate: { $gte: monthStart, $lt: monthEnd },
            },
          },
          { $group: { _id: "$subject", value: { $sum: "$durationMinutes" } } },
          { $sort: { value: -1 } },
        ]),
        Expense.aggregate([
          {
            $match: {
              userId: uid,
              transactionDate: { $gte: monthStart, $lt: monthEnd },
            },
          },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: "%Y-%m-%d",
                  date: "$transactionDate",
                  timezone: "Asia/Kolkata",
                },
              },
              value: { $sum: "$amountPaise" },
            },
          },
          { $sort: { _id: 1 } },
        ]),
      ]);
    const sum = (xs, k, lo, hi) =>
      xs
        .filter((x) => x[k] >= lo && x[k] < hi)
        .reduce(
          (a, x) =>
            a + (k === "transactionDate" ? x.amountPaise : x.durationMinutes),
          0,
        );
    const weeklyBudget = await weeklyBudgetReport(uid, mondayOf(stamp));
    res.json({
      today: {
        spent: sum(expenses, "transactionDate", start, dayEnd) / 100,
        learningMinutes: sum(learning, "sessionDate", start, dayEnd),
      },
      week: {
        spent: sum(expenses, "transactionDate", weekStart, dayEnd) / 100,
        learningMinutes: sum(learning, "sessionDate", weekStart, dayEnd),
      },
      month: {
        spent: expenses.reduce((a, x) => a + x.amountPaise, 0) / 100,
        learningMinutes: learning.reduce((a, x) => a + x.durationMinutes, 0),
        sessions: learning.length,
        activeDays: new Set(
          learning.map((x) =>
            new Intl.DateTimeFormat("en-CA", {
              timeZone: "Asia/Kolkata",
            }).format(x.sessionDate),
          ),
        ).size,
      },
      budget: {
        amount: (req.user.settings.monthlyBudgetPaise || 0) / 100,
        remaining: Math.max(
          0,
          ((req.user.settings.monthlyBudgetPaise || 0) -
            expenses.reduce((a, x) => a + x.amountPaise, 0)) /
            100,
        ),
      },
      weeklyBudget,
      categories: category.map((x) => ({ name: x._id, value: x.value / 100 })),
      subjects: subject.map((x) => ({ name: x._id, value: x.value })),
      recent: recent.map((x) => ({ ...x, amount: x.amountPaise / 100 })),
      trend: trend.map((x) => ({ date: x._id, value: x.value / 100 })),
    });
  }),
);
app.get("/api/budgets/weekly", asyncRoute(async (req, res) => {
  const parsed = weekStartSchema.safeParse(req.query.weekStart);
  if (!parsed.success) return res.status(400).json({ error: "Choose a valid Monday to view a weekly budget." });
  res.json({ report: await weeklyBudgetReport(userId(req), parsed.data) });
}));
app.put("/api/budgets/weekly", asyncRoute(async (req, res) => {
  const parsed = budgetInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Enter a valid weekly budget." });
  const { weekStart, amount } = parsed.data;
  const weekEnd = new Date(`${weekStart}T00:00:00Z`);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  await WeeklyBudget.findOneAndUpdate(
    { userId: userId(req), weekStart },
    { $set: { weekEnd: weekEnd.toISOString().slice(0, 10), amountPaise: Math.round(amount * 100) }, $setOnInsert: { userId: userId(req), weekStart } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );
  res.json({ report: await weeklyBudgetReport(userId(req), weekStart) });
}));
app.get(
  "/api/reports/expenses",
  asyncRoute(async (req, res) => {
    const q = listQuery(req, "transactionDate"),
      rows = await Expense.find(q).sort({ transactionDate: 1 }).lean();
    const totals = {},
      days = {};
    for (const x of rows) {
      totals[x.category] = (totals[x.category] || 0) + x.amountPaise;
      const day = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
      }).format(x.transactionDate);
      days[day] = (days[day] || 0) + x.amountPaise;
    }
    const vals = Object.entries(days);
    res.json({
      total: rows.reduce((a, x) => a + x.amountPaise, 0) / 100,
      averageDaily: vals.length
        ? rows.reduce((a, x) => a + x.amountPaise, 0) / 100 / vals.length
        : 0,
      highestDay: vals.sort((a, b) => b[1] - a[1])[0]?.[0] || null,
      categories: Object.entries(totals).map(([name, value]) => ({
        name,
        value: value / 100,
      })),
      trend: Object.entries(days)
        .sort()
        .map(([date, value]) => ({ date, value: value / 100 })),
      count: rows.length,
    });
  }),
);
app.get(
  "/api/reports/learning",
  asyncRoute(async (req, res) => {
    const q = listQuery(req, "sessionDate"),
      rows = await LearningSession.find(q).sort({ sessionDate: 1 }).lean(),
      subjects = {},
      days = {};
    for (const x of rows) {
      subjects[x.subject] = (subjects[x.subject] || 0) + x.durationMinutes;
      const day = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
      }).format(x.sessionDate);
      days[day] = (days[day] || 0) + x.durationMinutes;
    }
    res.json({
      totalMinutes: rows.reduce((a, x) => a + x.durationMinutes, 0),
      sessions: rows.length,
      activeDays: Object.keys(days).length,
      subjects: Object.entries(subjects)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value),
      trend: Object.entries(days)
        .sort()
        .map(([date, value]) => ({ date, value })),
    });
  }),
);
app.get("/api/settings", (req, res) =>
  res.json({ settings: req.user.settings, username: req.user.username }),
);
app.patch(
  "/api/settings",
  asyncRoute(async (req, res) => {
    const z = zod
      .object({
        monthlyBudget: zod.number().min(0).max(100000000).optional(),
        dailyGoalMinutes: zod.number().int().min(1).max(1440).optional(),
        weeklyGoalMinutes: zod.number().int().min(1).max(10080).optional(),
        timezone: zod.literal("Asia/Kolkata").optional(),
        theme: zod.enum(["light", "dark"]).optional(),
        subjects: zod
          .array(zod.string().trim().min(1).max(60))
          .max(50)
          .optional(),
        categories: zod
          .array(zod.string().trim().min(1).max(60))
          .max(50)
          .optional(),
      })
      .strict()
      .safeParse(req.body);
    if (!z.success)
      return res
        .status(400)
        .json({ error: z.error.issues[0]?.message || "Invalid settings." });
    const d = { ...z.data };
    if (d.monthlyBudget !== undefined) {
      d.monthlyBudgetPaise = Math.round(d.monthlyBudget * 100);
      delete d.monthlyBudget;
    }
    Object.assign(req.user.settings, d);
    req.user.markModified("settings");
    await req.user.save();
    res.json({ settings: req.user.settings });
  }),
);
app.get(
  "/api/daily-reviews/:date",
  asyncRoute(async (req, res) => {
    const x = await DailyReview.findOne({
      userId: userId(req),
      date: req.params.date,
    });
    res.json({ item: x || { date: req.params.date, reflection: "" } });
  }),
);
app.put(
  "/api/daily-reviews/:date",
  asyncRoute(async (req, res) => {
    const p = zod
      .object({ reflection: zod.string().max(2000) })
      .safeParse(req.body);
    if (!p.success)
      return res
        .status(400)
        .json({ error: "Reflection must be under 2000 characters." });
    const x = await DailyReview.findOneAndUpdate(
      { userId: userId(req), date: req.params.date },
      { ...p.data, userId: userId(req), date: req.params.date },
      { upsert: true, new: true, runValidators: true },
    );
    res.json({ item: x });
  }),
);
app.get(
  "/api/backup",
  asyncRoute(async (req, res) => {
    const [expenses, learning, learningSubjects, reviews] = await Promise.all([
      Expense.find({ userId: userId(req) }).lean(),
      LearningSession.find({ userId: userId(req) }).lean(),
      LearningSubject.find({ userId: userId(req) }).lean(),
      DailyReview.find({ userId: userId(req) }).lean(),
    ]);
    res.json({
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: req.user.settings,
      expenses: expenses.map((x) => ({ ...x, amount: x.amountPaise / 100 })),
      learning,
      learningSubjects,
      reviews,
    });
  }),
);
app.get(
  "/api/export/:type",
  asyncRoute(async (req, res) => {
    const type = req.params.type;
    if (!["expenses", "learning"].includes(type))
      return res.status(400).json({ error: "Unknown export type." });
    const expense = type === "expenses",
      q = listQuery(req, expense ? "transactionDate" : "sessionDate"),
      rows = expense
        ? await Expense.find(q).sort({ transactionDate: 1 }).lean()
        : await LearningSession.find(q).sort({ sessionDate: 1 }).lean(),
      columns = expense
        ? [
            "date",
            "amount_inr",
            "category",
            "description",
            "payment_method",
            "notes",
          ]
        : [
            "date",
            "subject",
            "topic",
            "duration_minutes",
            "what_i_learned",
            "problems_solved",
            "tasks_completed",
            "difficulty",
            "notes",
          ];
    const escape = (v) => {
      let s = String(v ?? "");
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      s = s.replaceAll('"', '""');
      return `"${s}"`;
    };
    const lines = [
      columns.join(","),
      ...rows.map((x) =>
        (expense
          ? [
              x.transactionDate.toISOString(),
              (x.amountPaise / 100).toFixed(2),
              x.category,
              x.description,
              x.paymentMethod,
              x.notes,
            ]
          : [
              x.sessionDate.toISOString(),
              x.subject,
              x.topic,
              x.durationMinutes,
              x.whatILearned,
              x.problemsSolved,
              x.tasksCompleted,
              x.difficulty,
              x.notes,
            ]
        )
          .map(escape)
          .join(","),
      ),
    ];
    res
      .type("text/csv")
      .attachment(`lifeledger-${type}.csv`)
      .send(lines.join("\r\n"));
  }),
);
app.use((err, req, res, next) => {
  if (err instanceof mongoose.Error.CastError)
    return res.status(400).json({ error: "Invalid record identifier." });
  if (err.code === 11000)
    return res.status(409).json({ error: "A record already exists." });
  if (err.name === "ValidationError")
    return res.status(400).json({ error: err.message });
  console.error("Request failed:", err.message);
  res
    .status(err.status || 500)
    .json({
      error: err.status
        ? err.message
        : "Something went wrong. Please try again.",
    });
});
