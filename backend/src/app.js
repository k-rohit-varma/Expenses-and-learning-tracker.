import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { config } from "./config.js";
import { Expense, LearningSession, User, DailyReview } from "./models.js";
import { asyncRoute, bounds, expenseInput, learningInput } from "./util.js";

export const app = express();
app.use(helmet());
app.use(cors({ origin: config.frontendOrigin || 'https://expenses-and-learning-tracker-frontend.onrender.com', credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
const cookie = {
  httpOnly: true,
  sameSite: config.production ? "none" : "lax",
  secure: config.production,
  maxAge: 7 * 86400000,
  path: "/",
};
export const auth = asyncRoute(async (req, res, next) => {
  const token = req.cookies.lifeledger;
  if (!token)
    return res.status(401).json({ error: "Please sign in to continue." });
  try {
    const decoded = jwt.verify(token, config.authSecret);
    req.user = await User.findById(decoded.sub);
    if (!req.user || req.user.status !== "active" || decoded.ver !== req.user.tokenVersion) throw new Error();
    next();
  } catch {
    res.clearCookie("lifeledger", cookie);
    res
      .status(401)
      .json({ error: "Your session expired. Please sign in again." });
  }
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
    if (req.query.subject) q.subject = String(req.query.subject);
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
    const x = await LearningSession.create({
      ...req.validated,
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
      categories: category.map((x) => ({ name: x._id, value: x.value / 100 })),
      subjects: subject.map((x) => ({ name: x._id, value: x.value })),
      recent: recent.map((x) => ({ ...x, amount: x.amountPaise / 100 })),
      trend: trend.map((x) => ({ date: x._id, value: x.value / 100 })),
    });
  }),
);
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
    const [expenses, learning, reviews] = await Promise.all([
      Expense.find({ userId: userId(req) }).lean(),
      LearningSession.find({ userId: userId(req) }).lean(),
      DailyReview.find({ userId: userId(req) }).lean(),
    ]);
    res.json({
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: req.user.settings,
      expenses: expenses.map((x) => ({ ...x, amount: x.amountPaise / 100 })),
      learning,
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
