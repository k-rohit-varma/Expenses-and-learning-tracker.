import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { app } from './app.js';
import { config } from './config.js';
import { User, WeeklyBudget, LearningSubject } from './models.js';
import { migrateLegacyLearningSubjects } from './learningMigration.js';

if (!config.mongoUri || !config.authSecret || !config.username || !config.password || !config.frontendOrigin) {
  console.error('Missing required environment configuration. See backend/.env.example.'); process.exit(1);
}
await mongoose.connect(config.mongoUri);
const passwordHash = await bcrypt.hash(config.password, 12);
await User.init();
await WeeklyBudget.createIndexes();
await LearningSubject.createIndexes();
let owner = await User.findOne({ role: 'owner' });
if (!owner) {
  const bootstrapUsername = config.username.trim().toLowerCase();
  owner = await User.findOne({ username: new RegExp(`^${bootstrapUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
}
if (!owner) owner = await User.create({ username: config.username.trim().toLowerCase(), passwordHash, role: 'owner', status: 'active' });
else {
  owner.username = owner.username.trim().toLowerCase();
  owner.role = 'owner';
  owner.status = 'active';
  await owner.save();
}
await User.updateMany(
  { _id: { $ne: owner._id }, role: { $exists: false } },
  { $set: { role: 'user', status: 'active', tokenVersion: 0 } },
);
await User.updateMany(
  { role: 'user', status: { $exists: false } },
  { $set: { status: 'active', tokenVersion: 0 } },
);
const owners = await User.countDocuments({ role: 'owner' });
if (owners !== 1) throw new Error(`Expected exactly one owner account; found ${owners}.`);
await migrateLegacyLearningSubjects();
const server = app.listen(config.port, () => console.log(`LifeLedger API listening on port ${config.port}`));
async function shutdown() { server.close(async () => { await mongoose.disconnect(); process.exit(0); }); }
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
