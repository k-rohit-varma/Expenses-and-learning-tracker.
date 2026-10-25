import { LearningSession, LearningSubject } from "./models.js";

async function findOrCreateSubject(userId, name) {
  const normalized = String(name || "Uncategorized").trim().slice(0, 60) || "Uncategorized";
  let subject = await LearningSubject.findOne({ userId, name: normalized }).collation({ locale: "en", strength: 2 });
  if (subject) return subject;
  try {
    return await LearningSubject.create({ userId, name: normalized });
  } catch (error) {
    if (error.code !== 11000) throw error;
    subject = await LearningSubject.findOne({ userId, name: normalized }).collation({ locale: "en", strength: 2 });
    if (!subject) throw error;
    return subject;
  }
}

export async function migrateLegacyLearningSubjects() {
  const userIds = await LearningSession.distinct("userId", { subjectId: null });
  for (const userId of userIds) {
    const names = await LearningSession.distinct("subject", { userId, subjectId: null });
    for (const originalName of names) {
      const subject = await findOrCreateSubject(userId, originalName);
      await LearningSession.updateMany(
        { userId, subjectId: null, subject: originalName },
        { $set: { subjectId: subject._id, subject: subject.name } },
      );
    }
  }
}
