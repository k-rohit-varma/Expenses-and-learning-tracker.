import mongoose from "mongoose";
const { Schema, model } = mongoose;
const base = {
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
};
const expenseSchema = new Schema(
  {
    ...base,
    amountPaise: { type: Number, required: true, min: 1 },
    category: { type: String, required: true, maxlength: 60 },
    description: { type: String, required: true, trim: true, maxlength: 140 },
    transactionDate: { type: Date, required: true, index: true },
    paymentMethod: {
      type: String,
      enum: ["UPI", "Cash", "Card", "Bank transfer", "Other"],
      required: true,
    },
    notes: { type: String, maxlength: 1000, default: "" },
  },
  { timestamps: true },
);
expenseSchema.index({ userId: 1, transactionDate: -1 });
const learningSchema = new Schema(
  {
    ...base,
    subject: { type: String, required: true, maxlength: 60 },
    topic: { type: String, required: true, trim: true, maxlength: 140 },
    durationMinutes: { type: Number, required: true, min: 1, max: 1440 },
    sessionDate: { type: Date, required: true, index: true },
    whatILearned: { type: String, default: "", maxlength: 2000 },
    problemsSolved: { type: Number, min: 0, default: 0 },
    tasksCompleted: { type: Number, min: 0, default: 0 },
    difficulty: {
      type: String,
      enum: ["Easy", "Medium", "Hard", ""],
      default: "",
    },
    notes: { type: String, maxlength: 1000, default: "" },
  },
  { timestamps: true },
);
learningSchema.index({ userId: 1, sessionDate: -1 });
const userSchema = new Schema(
  {
    username: { type: String, unique: true, required: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["owner", "user"], default: "user", required: true },
    status: { type: String, enum: ["pending_approval", "active", "blocked", "rejected"], default: "active", required: true },
    tokenVersion: { type: Number, default: 0, min: 0 },
    lastLoginAt: { type: Date, default: null },
    settings: {
      monthlyBudgetPaise: { type: Number, default: 0 },
      dailyGoalMinutes: { type: Number, default: 60 },
      weeklyGoalMinutes: { type: Number, default: 420 },
      timezone: { type: String, default: "Asia/Kolkata" },
      theme: { type: String, default: "light" },
      subjects: {
        type: [String],
        default: [
          "DSA",
          "Java",
          "MERN Stack",
          "Backend Development",
          "AI and Machine Learning",
          "Japanese",
          "Finance and Investing",
          "Other",
        ],
      },
      categories: {
        type: [String],
        default: [
          "Food",
          "Snacks and beverages",
          "Travel",
          "Shopping",
          "Hostel essentials",
          "Education",
          "Entertainment",
          "Health and personal care",
          "Bills and subscriptions",
          "Miscellaneous",
        ],
      },
    },
  },
  { timestamps: true },
);
userSchema.index({ role:  1 }, { unique: true, partialFilterExpression: { role: "owner" } });
const reviewSchema = new Schema(
  {
    ...base,
    date: { type: String, required: true },
    reflection: { type: String, maxlength: 2000, default: "" },
  },
  { timestamps: true },
);
reviewSchema.index({ userId: 1, date: 1 }, { unique: true });
export const Expense =
  mongoose.models.Expense || model("Expense", expenseSchema);
export const LearningSession =
  mongoose.models.LearningSession || model("LearningSession", learningSchema);
export const User = mongoose.models.User || model("User", userSchema);
export const DailyReview =
  mongoose.models.DailyReview || model("DailyReview", reviewSchema);
