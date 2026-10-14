// OPTIONAL demo data (synthetic, clearly fake). Run only on purpose: npm run demo --prefix server
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const Activity = require('./models/Activity');
(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const pw = process.env.DEMO_PASSWORD;
  if (!pw || pw.length < 8) throw new Error('Set DEMO_PASSWORD (8+ chars)');
  const hash = await bcrypt.hash(pw, 10);
  const mk = (name, email, role, department, year) => User.findOneAndUpdate({ email }, { name, email, passwordHash: hash, role, department, year }, { upsert: true, new: true });
  const f = await mk('Demo Faculty (IT)', 'demo.faculty@example.test', 'coordinator', 'IT');
  const s = await mk('Demo Student', 'demo.student@example.test', 'student', 'IT', 3);
  const pdf = Buffer.from('%PDF-1.4\n% synthetic demo certificate\n');
  const rows = [['Demo Hackathon (sample)', 'Hackathon', 'verified'], ['Demo Workshop (sample)', 'Workshop', 'submitted']];
  for (const [title, type, status] of rows) {
    if (!(await Activity.findOne({ student: s._id, title }))) await Activity.create({ student: s._id, department: 'IT', title, type, organizer: 'Sample Org', date: new Date('2026-09-01'), status, reviewedBy: status === 'verified' ? f._id : undefined, reviewedAt: status === 'verified' ? new Date() : undefined, certificate: { filename: 'sample.pdf', mime: 'application/pdf', size: pdf.length, data: pdf } });
  }
  console.log('Demo data ready: demo.faculty@example.test / demo.student@example.test (password from DEMO_PASSWORD)');
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
