import test from "node:test";
import assert from "node:assert/strict";
import { addDays, asOccurrence, conflictRows, expand, isOccurrence, proposedDates, scheduleInput, scheduleRouter } from "./schedules.js";
import { Schedule } from "./models.js";

const series = (overrides = {}) => ({
  _id: "aaaaaaaaaaaaaaaaaaaaaaaa",
  title: "Study",
  description: "",
  category: "Learning",
  startDate: "2026-11-02",
  startTime: "19:00",
  endTime: "19:45",
  allDay: false,
  location: "",
  notes: "",
  status: "pending",
  timezone: "Asia/Kolkata",
  recurrence: { frequency: "none", weekdays: [], until: "" },
  occurrences: [],
  ...overrides,
});
const runRoute = async (method, path, req) => {
  const layer = scheduleRouter.stack.find((item) => item.route?.path === path && item.route.methods[method]);
  assert.ok(layer, `route ${method.toUpperCase()} ${path} exists`);
  const result = { status: 200, body: null };
  const res = { status(code) { result.status = code; return this; }, json(body) { result.body = body; return this; } };
  await layer.route.stack[0].handle(req, res, (error) => { if (error) throw error; });
  return result;
};

test("schedule input rejects bad dates, missing fields and overnight intervals", () => {
  const base = { title: "Study", category: "Learning", startDate: "2026-11-02", startTime: "19:00", endTime: "19:45" };
  assert.equal(scheduleInput.safeParse(base).success, true);
  assert.equal(scheduleInput.safeParse({ ...base, startDate: "2026-02-30" }).success, false);
  assert.equal(scheduleInput.safeParse({ ...base, title: " " }).success, false);
  assert.equal(scheduleInput.safeParse({ ...base, endTime: "18:59" }).success, false);
  assert.equal(scheduleInput.safeParse({ ...base, startTime: "23:30", endTime: "00:30" }).success, false, "overnight events are unsupported");
  assert.equal(scheduleInput.safeParse({ ...base, allDay: true, startTime: "", endTime: "" }).success, true);
  assert.equal(scheduleInput.safeParse({ ...base, userId: "0123456789abcdef01234567" }).success, false);
});

test("schedules are user-owned, indexed by date, and store recurrence exceptions on the series", () => {
  assert.equal(Schedule.schema.path("userId").isRequired, true);
  assert.ok(Schedule.schema.indexes().some(([keys]) => keys.userId === 1 && keys.startDate === 1));
  assert.ok(Schedule.schema.path("occurrences"));
  assert.equal(Schedule.schema.path("timezone").defaultValue, "Asia/Kolkata");
});

test("day, week, month, weekday and until recurrence are evaluated as local calendar dates", () => {
  const daily = series({ recurrence: { frequency: "daily", weekdays: [], until: "2026-11-04" } });
  assert.deepEqual(expand(daily, "2026-11-01", "2026-11-06").map((x) => x.occurrenceDate), ["2026-11-02", "2026-11-03", "2026-11-04"]);
  const weekly = series({ recurrence: { frequency: "weekly", weekdays: [], until: "" } });
  assert.deepEqual(expand(weekly, "2026-11-01", "2026-11-16").map((x) => x.occurrenceDate), ["2026-11-02", "2026-11-09", "2026-11-16"]);
  const monthly = series({ startDate: "2026-01-31", recurrence: { frequency: "monthly", weekdays: [], until: "" } });
  assert.deepEqual(expand(monthly, "2026-01-01", "2026-04-30").map((x) => x.occurrenceDate), ["2026-01-31", "2026-03-31"]);
  const custom = series({ recurrence: { frequency: "weekdays", weekdays: [1, 3, 5], until: "" } });
  assert.deepEqual(expand(custom, "2026-11-02", "2026-11-08").map((x) => x.occurrenceDate), ["2026-11-02", "2026-11-04", "2026-11-06"]);
  assert.equal(addDays("2026-11-02", -1), "2026-11-01");
  assert.equal(expand(daily, "2026-11-03", "2026-11-03")[0].startTime, "19:00", "wall-clock time remains stable across dates");
});

test("occurrence overrides can be completed, moved and canceled without duplicating the series", () => {
  const recurring = series({ recurrence: { frequency: "daily", weekdays: [], until: "" }, occurrences: [{ date: "2026-11-03", status: "completed" }, { date: "2026-11-04", canceled: true }, { date: "2026-11-05", title: "Moved session", startTime: "20:00", endTime: "20:45" }] });
  assert.equal(asOccurrence(recurring, "2026-11-03").status, "completed");
  assert.equal(asOccurrence(recurring, "2026-11-04"), null);
  assert.equal(isOccurrence(recurring, "2026-11-05"), true);
  assert.equal(asOccurrence(recurring, "2026-11-05").title, "Moved session");
  assert.equal(asOccurrence(recurring, "2026-11-05").startTime, "20:00");
  const legacy = asOccurrence(series({ timezone: undefined, startTime: "19:00", endTime: "20:00" }), "2026-11-02");
  assert.equal(legacy.startTime, "19:00", "existing wall-clock values are returned unchanged");
  assert.equal(legacy.timezone, "Asia/Kolkata", "legacy rows without timezone metadata keep the established default");
});

test("conflicts include overlaps and all-day events, allow boundary touching, and exclude the edited series", () => {
  const existing = [
    series({ _id: "aaaaaaaaaaaaaaaaaaaaaaaa", title: "Same series", recurrence: { frequency: "daily", weekdays: [], until: "" } }),
    series({ _id: "bbbbbbbbbbbbbbbbbbbbbbbb", title: "Overlap", startTime: "19:30", endTime: "20:30" }),
    series({ _id: "cccccccccccccccccccccccc", title: "Adjacent", startTime: "19:45", endTime: "20:15" }),
    series({ _id: "dddddddddddddddddddddddd", title: "All day", allDay: true }),
  ];
  const conflicts = conflictRows(existing, "2026-11-02", "19:15", "19:40", "aaaaaaaaaaaaaaaaaaaaaaaa");
  assert.deepEqual(conflicts.map((x) => x.title), ["Overlap", "All day"]);
  assert.equal(conflictRows(existing, "2026-11-02", "19:15", "19:40", "", true).length, 4);
});

test("recurring conflict checks cover generated dates and cap unbounded rules at one year", () => {
  assert.deepEqual(proposedDates("2026-11-02", { frequency: "weekly", until: "2026-11-20" }), ["2026-11-02", "2026-11-09", "2026-11-16"]);
  const unboundedDaily = proposedDates("2026-11-02", { frequency: "daily" });
  assert.equal(unboundedDaily.length, 367);
  assert.equal(unboundedDaily.at(-1), "2027-11-03");
});

test("create persists ownership from the session and status, edit, and delete operate on one occurrence", async () => {
  const originals = { create: Schedule.create, find: Schedule.find, findOne: Schedule.findOne };
  const user = { _id: "user-a", settings: { timezone: "America/New_York" } };
  const created = series({ _id: "eeeeeeeeeeeeeeeeeeeeeeee", userId: user._id });
  created.toObject = () => ({ ...created });
  created.save = async () => {};
  try {
    Schedule.create = async (document) => { assert.equal(document.userId, user._id); Object.assign(created, document); return created; };
    Schedule.find = () => ({ lean: async () => [] });
    const createResult = await runRoute("post", "/", { user, body: { title: "Study", category: "Learning", startDate: "2026-11-02", startTime: "19:00", endTime: "19:45" } });
    assert.equal(createResult.status, 201);
    assert.equal(createResult.body.item.seriesId, created._id);
    assert.equal(created.timezone, "America/New_York");

    Schedule.findOne = (query) => { assert.equal(query.userId, user._id); return created; };
    const statusResult = await runRoute("patch", "/:id/status", { user, params: { id: created._id }, body: { date: "2026-11-02", status: "completed" } });
    assert.equal(statusResult.body.item.status, "completed");

    const editResult = await runRoute("put", "/:id", { user, params: { id: created._id }, query: { date: "2026-11-02", mode: "occurrence" }, body: { title: "Study moved", category: "Learning", startDate: "2026-11-02", startTime: "20:00", endTime: "20:45", recurrence: { frequency: "none", weekdays: [], until: "" } } });
    assert.equal(editResult.body.item.title, "Study moved");

    const deleteResult = await runRoute("delete", "/:id", { user, params: { id: created._id }, query: { date: "2026-11-02", mode: "occurrence" } });
    assert.deepEqual(deleteResult.body, { ok: true });
    assert.equal(created.occurrences.find((x) => x.date === "2026-11-02").canceled, true);

    Schedule.findOne = (query) => { assert.equal(query.userId, "another-user"); return null; };
    const unauthorized = await runRoute("put", "/:id", { user: { _id: "another-user" }, params: { id: created._id }, query: { date: "2026-11-02", mode: "series" }, body: { title: "Study", category: "Learning", startDate: "2026-11-02", startTime: "19:00", endTime: "19:45" } });
    assert.equal(unauthorized.status, 404);
  } finally {
    Schedule.create = originals.create; Schedule.find = originals.find; Schedule.findOne = originals.findOne;
  }
});
