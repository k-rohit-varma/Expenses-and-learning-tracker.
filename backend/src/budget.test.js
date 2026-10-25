import test from "node:test";
import assert from "node:assert/strict";
import { Expense, WeeklyBudget } from "./models.js";
import { addCalendarDays, budgetInput, budgetProgress, indiaDayStart, mondayOf, weeklyBudgetReport } from "./budget.js";

test("weekly date helpers handle month and year boundaries in calendar dates", () => {
  assert.equal(mondayOf("2026-11-01"), "2026-10-26");
  assert.equal(mondayOf("2027-01-01"), "2026-12-28");
  assert.equal(addCalendarDays("2026-10-26", 6), "2026-11-01");
  assert.equal(addCalendarDays("2026-12-28", 6), "2027-01-03");
  assert.equal(indiaDayStart("2026-10-19").toISOString(), "2026-10-18T18:30:00.000Z");
});

test("weekly budget validation requires non-negative amounts and a Monday week start", () => {
  assert.equal(budgetInput.safeParse({ weekStart: "2026-10-19", amount: 3000 }).success, true);
  assert.equal(budgetInput.safeParse({ weekStart: "2026-10-20", amount: 3000 }).success, false);
  assert.equal(budgetInput.safeParse({ weekStart: "2026-10-19", amount: -1 }).success, false);
  assert.equal(budgetInput.safeParse({ weekStart: "2026-10-19", amount: Infinity }).success, false);
});

test("weekly progress handles 0%, 50%, 80%, 100%, over-budget and an unset budget", () => {
  assert.deepEqual(budgetProgress(300000, 0), { remainingPaise: 300000, percentUsed: 0 });
  assert.equal(budgetProgress(300000, 150000).percentUsed, 50);
  assert.equal(budgetProgress(300000, 240000).percentUsed, 80);
  assert.equal(budgetProgress(300000, 300000).percentUsed, 100);
  assert.deepEqual(budgetProgress(300000, 330000), { remainingPaise: -30000, percentUsed: 110 });
  assert.deepEqual(budgetProgress(null, 100), { remainingPaise: null, percentUsed: null });
});

test("weekly report counts Monday through Sunday, includes zero days and handles zero previous spend", async () => {
  const oldExpenseFind = Expense.find;
  const oldBudgetFind = WeeklyBudget.findOne;
  try {
    Expense.find = (query) => {
      assert.equal(String(query.userId), "user-a");
      return ({
      select() { return this; },
      lean: async () => query.transactionDate.$gte.toISOString() === "2026-10-18T18:30:00.000Z"
        ? [
          { transactionDate: new Date("2026-10-19T04:00:00.000Z"), amountPaise: 240000, category: "Food" },
          { transactionDate: new Date("2026-10-25T10:00:00.000Z"), amountPaise: 90000, category: "Travel" },
        ]
        : [],
      });
    };
    WeeklyBudget.findOne = (query) => { assert.equal(String(query.userId), "user-a"); return { lean: async () => ({ amountPaise: 300000 }) }; };
    const report = await weeklyBudgetReport("user-a", "2026-10-19");
    assert.equal(report.weekEnd, "2026-10-25");
    assert.equal(report.spent, 3300);
    assert.equal(report.remaining, -300);
    assert.equal(report.percentUsed, 110);
    assert.equal(report.expenseCount, 2);
    assert.equal(report.daily.length, 7);
    assert.equal(report.daily.filter((day) => day.amount === 0).length, 5);
    assert.deepEqual(report.categories.map((item) => item.name), ["Food", "Travel"]);
    assert.equal(report.previousSpent, 0);
    assert.equal(report.changePercent, null);
  } finally {
    Expense.find = oldExpenseFind;
    WeeklyBudget.findOne = oldBudgetFind;
  }
});

test("weekly budget schema enforces one budget per user and week", () => {
  const indexes = WeeklyBudget.schema.indexes();
  assert.ok(indexes.some(([keys, options]) => keys.userId === 1 && keys.weekStart === 1 && options.unique));
});
