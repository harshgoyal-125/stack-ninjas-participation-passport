const router = require('express').Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Activity = require('../models/Activity');
const multer = require('multer');
const { requireAuth, requireRole, isId } = require('../middleware');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024, files: 1 } });
const MAX_ROWS = 200;
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const ROLES = ['student', 'faculty', 'counsellor', 'hod', 'admin'];
const view = (u) => ({ id: u._id, name: u.name, email: u.email, role: u.role, department: u.department, year: u.year, semester: u.semester, rollNo: u.rollNo, batch: u.batch, section: u.section, group: u.group, demo: !!u.demo, createdAt: u.createdAt });
router.use(requireAuth, requireRole('admin'));

// Only an admin creates accounts here. Passwords are hashed; the response never contains one.
router.post('/users', async (req, res, next) => {
  try {
    const b = req.body;
    const name = str(b.name), email = str(b.email).toLowerCase(), password = str(b.password), role = str(b.role), department = str(b.department);
    if (!ROLES.includes(role)) return res.status(400).json({ error: 'Role must be one of ' + ROLES.join(', ') });
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || password.length > 72 || !User.DEPARTMENTS.includes(department)) return res.status(400).json({ error: 'Invalid details' });
    const doc = { name, email, passwordHash: await bcrypt.hash(password, 10), role, department, demo: b.demo === true, mustChangePassword: true };
    if (role === 'student') {
      const year = Number(b.year); if (!(year >= 1 && year <= 4)) return res.status(400).json({ error: 'Students need a year (1-4)' });
      doc.year = year;
      if (b.semester !== undefined && b.semester !== '') { const s = Number(b.semester); if (!(s >= 1 && s <= 8)) return res.status(400).json({ error: 'Semester must be 1-8' }); doc.semester = s; }
    }
    for (const k of ['rollNo', 'batch', 'section', 'group']) if (str(b[k])) doc[k] = str(b[k]).slice(0, 30);
    if (await User.findOne({ email })) return res.status(409).json({ error: 'Email already registered' });
    if (doc.rollNo && await User.findOne({ rollNo: doc.rollNo })) return res.status(409).json({ error: 'Roll number already registered' });
    const u = await User.create(doc);
    res.status(201).json({ user: view(u) });
  } catch (e) { next(e); }
});

// Minimal RFC4180 parser (quoted fields, doubled quotes, CRLF).
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some((x) => x.trim())) rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell); if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}
const HEADERS = { name: 'name', branch: 'branch', department: 'branch', year: 'year', semester: 'semester', email: 'email', password: 'password', initialpassword: 'password', group: 'group', rollno: 'rollNo', rollnumber: 'rollNo', batch: 'batch', section: 'section' };
// Bulk-create students. Good rows are imported, bad rows are listed with the reason. Passwords are never echoed back.
router.post('/users/import', (req, res, next) => upload.single('file')(req, res, next), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ help: true, error: 'Attach a CSV file in the "file" field (max 1 MB)' });
    const rows = parseCsv(req.file.buffer.toString('utf8'));
    if (rows.length < 2) return res.status(400).json({ help: true, error: 'The file has no data rows' });
    const cols = rows[0].map((h) => HEADERS[h.trim().toLowerCase().replace(/[^a-z]/g, '')] || null);
    for (const need of ['name', 'branch', 'year', 'semester', 'email', 'password', 'group']) if (!cols.includes(need)) return res.status(400).json({ help: true, error: 'Missing column: ' + need + '. Required columns: name, branch, year, semester, email, initial password, group. Optional: roll number, batch, section.' });
    if (rows.length - 1 > MAX_ROWS) return res.status(400).json({ error: 'Too many rows (max ' + MAX_ROWS + ' per file)' });
    const failed = []; const good = []; const seenEmail = new Set(), seenRoll = new Set();
    rows.slice(1).forEach((r, idx) => {
      const line = idx + 2, v = {}; cols.forEach((k, i) => { if (k) v[k] = (r[i] || '').trim(); });
      const bad = (m) => failed.push({ row: line, email: v.email || '', error: m });
      v.email = (v.email || '').toLowerCase();
      if (!v.name || v.name.length > 80) return bad('Name is required (max 80 characters)');
      if (/^[=+\-@\t]/.test(v.name) || /^[=+\-@\t]/.test(v.rollNo || '')) return bad('Name or roll number starts with a formula character (= + - @)');
      if (!/^\S+@\S+\.\S+$/.test(v.email)) return bad('Invalid email');
      const dept = (v.branch || '').toUpperCase(); if (!User.DEPARTMENTS.includes(dept)) return bad('Branch must be one of ' + User.DEPARTMENTS.join(', '));
      const year = Number(v.year); if (!(year >= 1 && year <= 4)) return bad('Year must be 1-4');
      const sem = Number(v.semester); if (!(sem >= 1 && sem <= 8)) return bad('Semester must be 1-8');
      if (!v.password || v.password.length < 8 || v.password.length > 72) return bad('Initial password must be 8-72 characters');
      if (v.rollNo && v.rollNo.length > 30) return bad('Roll number is too long (max 30 characters)');
      if (!v.group || v.group.length > 10) return bad('Group is required (max 10 characters)');
      if (seenEmail.has(v.email)) return bad('Duplicate email in this file');
      if (v.rollNo && seenRoll.has(v.rollNo)) return bad('Duplicate roll number in this file');
      seenEmail.add(v.email); if (v.rollNo) seenRoll.add(v.rollNo);
      good.push({ line, v, dept, year, sem });
    });
    const emails = good.map((g) => g.v.email), rolls = good.map((g) => g.v.rollNo).filter(Boolean);
    const [ex1, ex2] = await Promise.all([User.find({ email: { $in: emails } }).distinct('email'), User.find({ rollNo: { $in: rolls } }).distinct('rollNo')]);
    const e1 = new Set(ex1), e2 = new Set(ex2); const ok = [];
    for (const g of good) {
      if (e1.has(g.v.email)) failed.push({ row: g.line, email: g.v.email, error: 'Email already registered' });
      else if (g.v.rollNo && e2.has(g.v.rollNo)) failed.push({ row: g.line, email: g.v.email, error: 'Roll number already registered' });
      else ok.push(g);
    }
    const docs = [];
    for (const g of ok) docs.push({ name: g.v.name, email: g.v.email, passwordHash: await bcrypt.hash(g.v.password, 10), role: 'student', department: g.dept, year: g.year, semester: g.sem, rollNo: g.v.rollNo || undefined, group: g.v.group, batch: g.v.batch || undefined, section: g.v.section || undefined, mustChangePassword: true });
    let created = 0;
    try { created = (await User.insertMany(docs, { ordered: false })).length; } catch (e) { if (e.insertedDocs) created = e.insertedDocs.length; else throw e; }
    failed.sort((a, b) => a.row - b.row);
    res.status(created ? 201 : 200).json({ created, failed });
  } catch (e) { next(e); }
});
router.get('/users', async (req, res, next) => {
  try { const u = await User.find().sort({ role: 1, name: 1 }).limit(500); res.json({ users: u.map(view) }); } catch (e) { next(e); }
});
// Delete a user created by mistake. Safeguards: not yourself, never the last admin.
// Deleting a student also deletes their activities and certificates (they would be orphaned otherwise).
router.delete('/users/:id', async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const u = await User.findById(req.params.id);
    if (!u) return res.status(404).json({ error: 'Not found' });
    if (String(u._id) === String(req.user._id)) return res.status(400).json({ error: 'You cannot delete your own account' });
    if (u.role === 'admin' && (await User.countDocuments({ role: 'admin' })) <= 1) return res.status(409).json({ error: 'Cannot delete the last admin' });
    let removed = 0;
    if (u.role === 'student') removed = (await Activity.deleteMany({ student: u._id })).deletedCount;
    await u.deleteOne();
    res.json({ deleted: { id: u._id, email: u.email, role: u.role }, activitiesRemoved: removed });
  } catch (e) { next(e); }
});
module.exports = router;
