import test from "node:test";
import assert from "node:assert/strict";
import { LearningSession, LearningSubject } from "./models.js";
import { migrateLegacyLearningSubjects } from "./learningMigration.js";

test("legacy session migration links matching subjects without replacing session details", async () => {
  const originals = {
    distinct: LearningSession.distinct,
    updateMany: LearningSession.updateMany,
    findOne: LearningSubject.findOne,
    create: LearningSubject.create,
  };
  const updates = [];
  try {
    LearningSession.distinct = async (field) => field === "userId" ? ["user-a"] : ["Java", "Uncategorized"];
    LearningSubject.findOne = () => ({ collation: async () => null });
    LearningSubject.create = async ({ userId, name }) => ({ _id: `${userId}-${name}`, name });
    LearningSession.updateMany = async (filter, update) => updates.push({ filter, update });
    await migrateLegacyLearningSubjects();
    assert.equal(updates.length, 2);
    assert.equal(updates[0].filter.userId, "user-a");
    assert.equal(updates[0].filter.subject, "Java");
    assert.deepEqual(Object.keys(updates[0].update.$set).sort(), ["subject", "subjectId"]);
    assert.equal(updates[1].filter.subject, "Uncategorized");
  } finally {
    LearningSession.distinct = originals.distinct;
    LearningSession.updateMany = originals.updateMany;
    LearningSubject.findOne = originals.findOne;
    LearningSubject.create = originals.create;
  }
});
