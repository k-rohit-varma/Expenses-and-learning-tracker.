import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { bounds, expenseInput, learningInput, localDay } from "./util.js";
import { auth, learningSubjectInput, requireOwner, subjectPatchInput, zRegister } from "./app.js";
import { config } from "./config.js";
import { LearningSession, LearningSubject, User } from "./models.js";
test("expense validation rejects zero, negative, and non-finite amounts", () => {
  for (const amount of [0, -1, Infinity, NaN])
    assert.equal(
      expenseInput.safeParse({
        amount,
        category: "Food",
        description: "Lunch",
        transactionDate: "2026-10-25T12:00:00+05:30",
        paymentMethod: "UPI",
      }).success,
      false,
    );
});
test("learning duration must be a positive integer", () => {
  const base = {
    subjectId: "0123456789abcdef01234567",
    topic: "Trees",
    sessionDate: "2026-10-25T12:00:00+05:30",
  };
  assert.equal(
    learningInput.safeParse({ ...base, durationMinutes: 30 }).success,
    true,
  );
  assert.equal(
    learningInput.safeParse({ ...base, durationMinutes: 0 }).success,
    false,
  );
  assert.equal(
    learningInput.safeParse({ ...base, durationMinutes: 1.5 }).success,
    false,
  );
  assert.equal(learningInput.safeParse({ ...base, subjectId: "not-an-id", durationMinutes: 30 }).success, false);
});
test("learning subject names are unique per owner with case-insensitive collation", () => {
  assert.ok(LearningSubject.schema.indexes().some(([keys, options]) => keys.userId === 1 && keys.name === 1 && options.unique && options.collation?.strength === 2));
  assert.equal(LearningSubject.schema.path("userId").isRequired, true);
  assert.equal(LearningSession.schema.path("subjectId").options.ref, "LearningSubject");
});
test("learning subject inputs validate custom fields and reject client ownership fields", () => {
  assert.equal(learningSubjectInput.safeParse({ name: " Java ", description: "Backend", icon: "Code2", color: "#123456", weeklyGoalMinutes: 300 }).success, true);
  assert.equal(learningSubjectInput.safeParse({ name: "Java", color: "blue" }).success, false);
  assert.equal(learningSubjectInput.safeParse({ name: "Java", userId: "0123456789abcdef01234567" }).success, false);
  assert.equal(subjectPatchInput.safeParse({ archived: true }).success, true);
});
test("date bounds use Asia/Kolkata midnight and exclusive next midnight", () => {
  const b = bounds("2026-10-25", "2026-10-25");
  assert.equal(b.$gte.toISOString(), "2026-10-24T18:30:00.000Z");
  assert.equal(b.$lt.toISOString(), "2026-10-25T18:30:00.000Z");
  assert.equal(localDay(new Date("2026-10-24T18:30:00Z")), "2026-10-25");
});
test("auth middleware rejects requests without an HTTP-only session cookie", async () => {
  const result = { status: null, body: null, cleared: false };
  const req = { cookies: {} };
  const res = {
    status(n) {
      result.status = n;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    },
    clearCookie() {
      result.cleared = true;
    },
  };
  await auth(req, res, () =>
    assert.fail("unauthenticated request must not advance"),
  );
  assert.equal(result.status, 401);
  assert.equal(result.body.error, "Please sign in to continue.");
});
test("registration only accepts ordinary usernames and strong passwords", () => {
  assert.equal(
    zRegister.safeParse({
      username: "viewer_1",
      password: "long-enough-password",
    }).success,
    true,
  );
  assert.equal(
    zRegister.safeParse({
      username: "owner",
      password: "long-enough-password",
      role: "owner",
    }).success,
    false,
  );
  assert.equal(
    zRegister.safeParse({ username: "ab", password: "long-enough-password" })
      .success,
    false,
  );
  assert.equal(
    zRegister.safeParse({ username: "viewer", password: "short" }).success,
    false,
  );
});
test("user schema distinguishes pending, active, blocked, and rejected states", () => {
  assert.deepEqual(User.schema.path("status").enumValues, [
    "pending_approval",
    "active",
    "blocked",
    "rejected",
  ]);
  assert.deepEqual(User.schema.path("role").enumValues, ["owner", "user"]);
});
test("owner-only middleware rejects normal accounts and allows the owner", () => {
  let called = false;
  const res = {
    status(code) {
      assert.equal(code, 403);
      return this;
    },
    json(body) {
      assert.equal(body.error, "Owner access is required.");
      return this;
    },
  };
  requireOwner({ user: { role: "user" } }, res, () => {
    called = true;
  });
  assert.equal(called, false);
  requireOwner({ user: { role: "owner" } }, res, () => {
    called = true;
  });
  assert.equal(called, true);
});
test("auth rejects blocked users and revoked pre-existing session versions", async () => {
  const oldSecret = config.authSecret,
    oldFind = User.findById;
  config.authSecret = "unit-test-session-secret";
  const result = { status: null, cleared: false };
  const res = {
    clearCookie() {
      result.cleared = true;
    },
    status(code) {
      result.status = code;
      return this;
    },
    json() {
      return this;
    },
  };
  try {
    for (const account of [
      { status: "blocked", tokenVersion: 0 },
      { status: "active", tokenVersion: 2 },
    ]) {
      User.findById = async () => account;
      const req = {
        cookies: {
          lifeledger: jwt.sign({ sub: "user-id", ver: 0 }, config.authSecret),
        },
      };
      await auth(req, res, () =>
        assert.fail("revoked session must not advance"),
      );
      assert.equal(result.status, 401);
      assert.equal(result.cleared, true);
      result.status = null;
      result.cleared = false;
    }
  } finally {
    User.findById = oldFind;
    config.authSecret = oldSecret;
  }
});
test("valid JWT cookie resolves the active account and reaches the protected route", async () => {
  const oldSecret = config.authSecret,
    oldFind = User.findById;
  config.authSecret = "unit-test-session-secret";
  const account = { status: "active", tokenVersion: 3 };
  const result = { next: false };
  User.findById = async (id) => {
    assert.equal(id, "user-id");
    return account;
  };
  try {
    await auth(
      {
        cookies: {
          lifeledger: jwt.sign({ sub: "user-id", ver: 3 }, config.authSecret),
        },
        method: "GET",
        path: "/api/dashboard/summary",
      },
      {},
      () => {
        result.next = true;
      },
    );
    assert.equal(result.next, true);
  } finally {
    User.findById = oldFind;
    config.authSecret = oldSecret;
  }
});
test("pending users are rejected by auth even with a correctly signed cookie", async () => {
  const oldSecret = config.authSecret,
    oldFind = User.findById;
  config.authSecret = "unit-test-session-secret";
  User.findById = async () => ({ status: "pending_approval", tokenVersion: 0 });
  const result = { status: null, cleared: false };
  const res = {
    clearCookie() {
      result.cleared = true;
    },
    status(code) {
      result.status = code;
      return this;
    },
    json() {
      return this;
    },
  };
  try {
    await auth(
      {
        cookies: {
          lifeledger: jwt.sign({ sub: "user-id", ver: 0 }, config.authSecret),
        },
        method: "GET",
        path: "/api/dashboard/summary",
      },
      res,
      () => assert.fail("pending account must not advance"),
    );
    assert.equal(result.status, 401);
    assert.equal(result.cleared, true);
  } finally {
    User.findById = oldFind;
    config.authSecret = oldSecret;
  }
});
