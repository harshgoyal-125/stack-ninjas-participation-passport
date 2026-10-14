const bcrypt = require('bcryptjs');
const User = require('./models/User');
// Creates the first admin from env vars (no passwords in the repo). Idempotent.
async function seedAdminFromEnv() {
  const email = (process.env.ADMIN_EMAIL || '').toLowerCase(), password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 8) return;
  if (await User.findOne({ email })) return;
  await User.create({ name: 'Administrator', email, passwordHash: await bcrypt.hash(password, 10), role: 'admin', department: 'CSE' });
  console.log('Admin account created');
}
module.exports = { seedAdminFromEnv };
