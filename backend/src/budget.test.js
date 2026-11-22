import test from "node:test";
import assert from "node:assert/strict";
import { CategoryBudget, Expense, MonthlyCategoryBudget, WeeklyBudget } from "./models.js";
import { addCalendarDays, budgetInput, budgetProgress, indiaDayStart, mondayOf, monthlyCategoryBudgetReport, nextMonthKey, previousMonthKey, weeklyBudgetReport } from "./budget.js";

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
  const oldCategoryBudgetFind = CategoryBudget.find;
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
    CategoryBudget.find = (query) => { assert.equal(String(query.userId), "user-a"); return { select() { return this; }, lean: async () => [{ _id: "allocation-1", category: "Food", amountPaise: 400000, description: "" }] }; };
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
    assert.equal(report.categoryBudgets[0].spent, 2400);
    assert.equal(report.categoryBudgets[0].remaining, 1600);
    assert.equal(report.categoryBudgets[0].status, "On Track");
    assert.equal(report.allocated, 4000);
    assert.equal(report.unallocated, -1000);
    assert.equal(report.allocationsOverBudget, true);
  } finally {
    Expense.find = oldExpenseFind;
    WeeklyBudget.findOne = oldBudgetFind;
    CategoryBudget.find = oldCategoryBudgetFind;
  }
});

test("weekly budget schema enforces one budget per user and week", () => {
  const indexes = WeeklyBudget.schema.indexes();
  assert.ok(indexes.some(([keys, options]) => keys.userId === 1 && keys.weekStart === 1 && options.unique));
});

test("category spending limits enforce a unique user, category, and week combination", () => {
  const indexes = CategoryBudget.schema.indexes();
  assert.ok(indexes.some(([keys, options]) => keys.userId === 1 && keys.category === 1 && keys.weekStart === 1 && options.unique));
  assert.equal(CategoryBudget.schema.path("amountPaise").options.min, 1);
});

test("monthly month navigation handles year boundaries and rejects invalid months", async () => {
  assert.equal(nextMonthKey("2026-12"), "2027-01");
  assert.equal(previousMonthKey("2026-01"), "2025-12");
  assert.equal(await monthlyCategoryBudgetReport("user-a", "2026-13", 2000000), null);
});

test("monthly category allocations summarize real expense rows without double counting", async () => {
  const oldFind = MonthlyCategoryBudget.find;
  try {
    MonthlyCategoryBudget.find = (query) => {
      assert.equal(String(query.userId), "user-a");
      assert.equal(query.month, "2026-06");
      return { select() { return this; }, lean: async () => [
        { _id: "food-limit", category: "Food", amountPaise: 500000, description: "Meals" },
        { _id: "snacks-limit", category: "Snacks", amountPaise: 150000, description: "" },
      ] };
    };
    const report = await monthlyCategoryBudgetReport("user-a", "2026-06", 2000000, [
      { category: "Food", amountPaise: 10000 },
      { category: "Food", amountPaise: 15000 },
      { category: "Food", amountPaise: 20000 },
      { category: "Snacks", amountPaise: 90000 },
    ]);
    assert.equal(report.spent, 1350);
    assert.equal(report.allocated, 6500);
    assert.equal(report.unallocated, 13500);
    assert.equal(report.remaining, 18650);
    assert.equal(report.categoryBudgets.find((x) => x.category === "Food").spent, 450);
    assert.equal(report.categoryBudgets.find((x) => x.category === "Snacks").percentUsed, 60);
    assert.equal(report.expenseCount, 4);
  } finally { MonthlyCategoryBudget.find = oldFind; }
});

test("monthly category budget schema is positive and unique per user, category, and month", () => {
  const indexes = MonthlyCategoryBudget.schema.indexes();
  assert.ok(indexes.some(([keys, options]) => keys.userId === 1 && keys.category === 1 && keys.month === 1 && options.unique));
  assert.equal(MonthlyCategoryBudget.schema.path("amountPaise").options.min, 1);
  assert.equal(MonthlyCategoryBudget.schema.path("showInOverview").defaultValue, true);
  assert.equal(MonthlyCategoryBudget.schema.path("includeInOverallBudget").defaultValue, true);
});

test("monthly category visibility and allocation toggles independently control display and allocation totals", async () => {
  const oldFind = MonthlyCategoryBudget.find;
  const toggles = [
    { category: "Food", amountPaise: 10000, showInOverview: true, includeInOverallBudget: true },
    { category: "Snacks", amountPaise: 20000, showInOverview: true, includeInOverallBudget: false },
    { category: "Travel", amountPaise: 30000, showInOverview: false, includeInOverallBudget: true },
    { category: "Health", amountPaise: 40000, showInOverview: false, includeInOverallBudget: false },
  ];
  try {
    MonthlyCategoryBudget.find = () => ({ select() { return this; }, lean: async () => toggles.map((item) => ({ ...item, _id: item.category })) });
    const report = await monthlyCategoryBudgetReport("user-a", "2026-06", 200000, toggles.map((item) => ({ category: item.category, amountPaise: 1000 })));
    assert.deepEqual(Object.fromEntries(report.categoryBudgets.map((item) => [item.category, [item.showInOverview, item.includeInOverallBudget]])), {
      Food: [true, true], Snacks: [true, false], Travel: [false, true], Health: [false, false],
    });
    assert.equal(report.categoryBudgets.filter((item) => item.showInOverview).length, 2);
    assert.equal(report.allocated, 400);
    assert.equal(report.unallocated, 1600);
    assert.equal(report.spent, 40);
    assert.equal(report.remaining, 1960);
    assert.equal(report.categoryBudgets.find((item) => item.category === "Snacks").spent, 10);
    assert.equal(report.categoryBudgets.find((item) => item.category === "Health").spent, 10);
  } finally { MonthlyCategoryBudget.find = oldFind; }
});
