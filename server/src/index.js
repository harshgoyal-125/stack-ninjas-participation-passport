const mongoose = require('mongoose');
const { createApp } = require('./app');
const { seedAdminFromEnv } = require('./seed');
async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) throw new Error('JWT_SECRET (16+ chars) is required');
  await mongoose.connect(process.env.MONGODB_URI);
  // One-time, idempotent: old faculty and counsellor accounts become Faculty Coordinators (same login, same scope).
  const User = require('./models/User');
  const m = await User.updateMany({ role: { $in: ['faculty', 'counsellor'] } }, { $set: { role: 'coordinator' } }, { strict: false });
  if (m.modifiedCount) console.log('Migrated to coordinator:', m.modifiedCount);
  await seedAdminFromEnv();
  const port = process.env.PORT || 3000;
  createApp().listen(port, () => console.log('Listening on', port));
}
main().catch((e) => { console.error(e.message); process.exit(1); });
