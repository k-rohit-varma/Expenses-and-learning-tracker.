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
    subjectId: { type: Schema.Types.ObjectId, ref: "LearningSubject", default: null, index: true },
    topic: { type: String, trim: true, maxlength: 140, default: "" },
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
      subjects: { type: [String], default: [] },
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
const weeklyBudgetSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  weekStart: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  weekEnd: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  amountPaise: { type: Number, required: true, min: 0 },
}, { timestamps: true });
weeklyBudgetSchema.index({ userId: 1, weekStart: 1 }, { unique: true });
const learningSubjectSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  name: { type: String, required: true, trim: true, maxlength: 60 },
  description: { type: String, trim: true, maxlength: 500, default: "" },
  icon: { type: String, trim: true, default: "BookOpen" },
  color: { type: String, match: /^#[0-9a-fA-F]{6}$/, default: "#637ee8" },
  archived: { type: Boolean, default: false },
  weeklyGoalMinutes: { type: Number, min: 1, max: 10080, default: null },
}, { timestamps: true });
learningSubjectSchema.index({ userId: 1, name: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });
const noteSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  subjectId: { type: Schema.Types.ObjectId, ref: "LearningSubject", required: true, index: true },
  title: { type: String, trim: true, maxlength: 160, default: "" },
  content: { type: String, required: true, trim: true, maxlength: 20000 },
  pinned: { type: Boolean, default: false },
}, { timestamps: true });
noteSchema.index({ userId:  1, subjectId: 1, pinned: -1, updatedAt: -1 });
const fitnessExerciseSchema = new Schema({
  ...base,
  name: { type: String, required: true, trim: true, maxlength: 80 },
  category: { type: String, required: true, enum: ["Cardio", "Chest", "Back", "Shoulders", "Arms", "Legs", "Core / Abs"] },
  type: { type: String, required: true, enum: ["strength", "cardio", "duration", "repetition"] },
  description: { type: String, trim: true, maxlength: 500, default: "" },
}, { timestamps: true });
fitnessExerciseSchema.index({ userId: 1, name: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });
const workoutSchema = new Schema({
  ...base,
  workoutDate: { type: Date, required: true, index: true },
  notes: { type: String, maxlength: 2000, default: "" },
  exercises: [{ exerciseId: { type: Schema.Types.ObjectId, default: null }, name: { type: String, required: true, maxlength: 80 }, category: { type: String, required: true }, type: { type: String, required: true }, sets: { type: Number, min: 1, default: null }, reps: { type: Number, min: 1, default: null }, weightKg: { type: Number, min: 0, default: null }, durationMinutes: { type: Number, min: 1, default: null }, distanceKm: { type: Number, min: 0, default: null }, notes: { type: String, maxlength: 500, default: "" } }],
}, { timestamps: true });
workoutSchema.index({ userId: 1, workoutDate: -1 });
const runningSessionSchema = new Schema({
  ...base,
  sessionDate: { type: Date, required: true, index: true },
  durationMinutes: { type: Number, required: true, min: 1, max: 1440 },
  distanceKm: { type: Number, required: true, min: 0.01, max: 1000 },
  startTime: { type: String, default: "" }, notes: { type: String, maxlength: 1000, default: "" },
}, { timestamps: true });
runningSessionSchema.index({ userId: 1, sessionDate: -1 });
const scheduleOccurrenceSchema = new Schema({
  date: { type: String, required: true },
  movedFrom: { type: String, default: null },
  canceled: { type: Boolean, default: false },
  status: { type: String, enum: ["pending", "completed", "skipped"], default: null },
  title: { type: String, trim: true, maxlength: 120, default: null },
  description: { type: String, maxlength: 1000, default: null },
  category: { type: String, enum: ["Work", "Personal", "Fitness", "Learning", "Finance", "Appointments", "Travel", "Other"], default: null },
  startTime: { type: String, default: null },
  endTime: { type: String, default: null },
  allDay: { type: Boolean, default: null },
  location: { type: String, maxlength: 200, default: null },
  notes: { type: String, maxlength: 2000, default: null },
});
const scheduleSchema = new Schema({
  ...base,
  title: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, maxlength: 1000, default: "" },
  category: { type: String, enum: ["Work", "Personal", "Fitness", "Learning", "Finance", "Appointments", "Travel", "Other"], required: true },
  startDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  startTime: { type: String, default: "" },
  endTime: { type: String, default: "" },
  allDay: { type: Boolean, default: false },
  timezone: { type: String, default: "Asia/Kolkata" },
  location: { type: String, maxlength: 200, default: "" },
  notes: { type: String, maxlength: 2000, default: "" },
  status: { type: String, enum: ["pending", "completed", "skipped"], default: "pending" },
  recurrence: {
    frequency: { type: String, enum: ["none", "daily", "weekly", "monthly", "weekdays"], default: "none" },
    weekdays: { type: [Number], default: [] },
    until: { type: String, default: "" },
  },
  occurrences: { type: [scheduleOccurrenceSchema], default: [] },
}, { timestamps: true });
scheduleSchema.index({ userId: 1, startDate: 1 });
scheduleSchema.index({ userId: 1, "recurrence.frequency": 1, startDate: 1 });
export const Expense =
  mongoose.models.Expense || model("Expense", expenseSchema);
export const LearningSession =
  mongoose.models.LearningSession || model("LearningSession", learningSchema);
export const User = mongoose.models.User || model("User", userSchema);
export const DailyReview =
  mongoose.models.DailyReview || model("DailyReview", reviewSchema);
export const WeeklyBudget = mongoose.models.WeeklyBudget || model("WeeklyBudget", weeklyBudgetSchema);
export const LearningSubject = mongoose.models.LearningSubject || model("LearningSubject", learningSubjectSchema);
export const Note = mongoose.models.Note || model("Note", noteSchema);
export const FitnessExercise = mongoose.models.FitnessExercise || model("FitnessExercise", fitnessExerciseSchema);
export const Workout = mongoose.models.Workout || model("Workout", workoutSchema);
export const RunningSession = mongoose.models.RunningSession || model("RunningSession", runningSessionSchema);
export const Schedule = mongoose.models.Schedule || model("Schedule", scheduleSchema);
