const router = require('express').Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Activity = require('../models/Activity');
const multer = require('multer');
const { requireAuth, requireRole, isId } = require('../middleware');
const { paging } = require('../scope');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024, files: 1 } });
const MAX_ROWS = 200;
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const ROLES = ['student', 'coordinator', 'hod'];  // admin is never created through the API: there is exactly one admin (from env)
const view = (u) => ({ id: u._id, name: u.name, email: u.email, role: u.role, department: u.department, year: u.year, semester: u.semester, enrollmentNo: u.enrollmentNo, rollNo: u.rollNo, batch: u.batch, section: u.section, group: u.group, demo: !!u.demo, createdAt: u.createdAt });
router.use(requireAuth, requireRole('admin'));

// Only an admin creates accounts here. Passwords are hashed; the response never contains one.
router.post('/users', async (req, res, next) => {
  try {
    const b = req.body;
    const name = str(b.name), email = str(b.email).toLowerCase(), password = str(b.password), role = (['faculty', 'counsellor'].includes(str(b.role)) ? 'coordinator' : str(b.role)), department = str(b.department);
    if (!ROLES.includes(role)) return res.status(400).json({ error: 'Role must be one of ' + ROLES.join(', ') });
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || password.length > 72 || !User.DEPARTMENTS.includes(department)) return res.status(400).json({ error: 'Invalid details' });
    const doc = { name, email, passwordHash: await bcrypt.hash(password, 10), role, department, demo: b.demo === true, mustChangePassword: true };
    if (role === 'student') {
      const year = Number(b.year); if (!(year >= 1 && year <= 4)) return res.status(400).json({ error: 'Students need a year (1-4)' });
      doc.year = year;
      if (b.semester !== undefined && b.semester !== '') { const s = Number(b.semester); if (!(s >= 1 && s <= 8)) return res.status(400).json({ error: 'Semester must be 1-8' }); doc.semester = s; }
    }
    for (const k of ['enrollmentNo', 'rollNo', 'batch', 'section']) if (str(b[k])) doc[k] = str(b[k]).slice(0, 30);
    if (role !== 'coordinator') delete doc.batch;  // batch is entered for coordinators only; students are matched by section and group
    if (str(b.group)) { const g = User.normGroup(b.group); if (!g) return res.status(400).json({ error: 'Group must be G1 or G2' }); doc.group = g; }
    if (doc.enrollmentNo && await User.findOne({ enrollmentNo: doc.enrollmentNo })) return res.status(409).json({ error: 'Enrollment number already registered' });
    if (await User.findOne({ email })) return res.status(409).json({ error: 'Email already registered' });
    if (doc.rollNo && await User.findOne({ rollNo: doc.rollNo })) return res.status(409).json({ error: 'Roll number already registered' });
    const u = await User.create(doc);
    res.status(201).json({ user: view(u) });
  } catch (e) { next(e); }
});

// Admin sets a temporary password; the user must change it at next login. The password is never echoed back.
router.post('/users/:id/reset-password', async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const pw = str(req.body.password);
    if (pw.length < 8 || pw.length > 72) return res.status(400).json({ error: 'Temporary password must be 8-72 characters' });
    const u = await User.findById(req.params.id);
    if (!u) return res.status(404).json({ error: 'Not found' });
    u.passwordHash = await bcrypt.hash(pw, 10); u.mustChangePassword = !u.demo; await u.save();
    res.json({ ok: true, email: u.email });
  } catch (e) { next(e); }
});
// Admin fixes a user's details (not password, not role, not email).
router.patch('/users/:id', async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const u = await User.findById(req.params.id);
    if (!u) return res.status(404).json({ error: 'Not found' });
    const b = req.body;
    if (b.name !== undefined) { if (!str(b.name)) return res.status(400).json({ error: 'Name cannot be empty' }); u.name = str(b.name).slice(0, 80); }
    if (b.department !== undefined) { if (!User.DEPARTMENTS.includes(str(b.department))) return res.status(400).json({ error: 'Invalid department' }); u.department = str(b.department); }
    if (b.year !== undefined && b.year !== '') { const y = Number(b.year); if (!(y >= 1 && y <= 4)) return res.status(400).json({ error: 'Year must be 1-4' }); u.year = y; }
    if (b.semester !== undefined && b.semester !== '') { const y = Number(b.semester); if (!(y >= 1 && y <= 8)) return res.status(400).json({ error: 'Semester must be 1-8' }); u.semester = y; }
    for (const k of ['batch', 'section']) if (b[k] !== undefined) u[k] = str(b[k]).slice(0, 30) || undefined;
    if (b.group !== undefined) { const g = str(b.group) ? User.normGroup(b.group) : ''; if (str(b.group) && !g) return res.status(400).json({ error: 'Group must be G1 or G2' }); u.group = g || undefined; }
    for (const k of ['rollNo', 'enrollmentNo']) if (b[k] !== undefined) {
      const v = str(b[k]).slice(0, 30);
      if (v && /^[=+\-@\t]/.test(v)) return res.status(400).json({ error: 'Invalid ' + k });
      if (v && await User.findOne({ [k]: v, _id: { $ne: u._id } })) return res.status(409).json({ error: (k === 'rollNo' ? 'Roll number' : 'Enrollment number') + ' already registered' });
      u[k] = v || undefined;
    }
    // Branch / roll no / section / group change: keep the old values in history, move the student's records to the new branch
    const changed = u.role === 'student' && ['department', 'rollNo', 'section', 'group'].some((k) => u.isModified(k));
    if (changed) { const was = await User.findById(u._id).select('department rollNo section group').lean(); u.history.push({ at: new Date(), department: was.department, rollNo: was.rollNo, section: was.section, group: was.group }); }
    const deptChanged = u.isModified('department');
    await u.save();
    if (deptChanged && u.role === 'student') await Activity.updateMany({ student: u._id }, { $set: { department: u.department } });
    res.json({ user: view(u) });
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
const HEADERS = { name: 'name', branch: 'branch', department: 'branch', year: 'year', semester: 'semester', email: 'email', password: 'password', initialpassword: 'password', group: 'group', rollno: 'rollNo', rollnumber: 'rollNo', enrollmentno: 'enrollmentNo', enrollmentnumber: 'enrollmentNo', enrolment: 'enrollmentNo', enrolmentno: 'enrollmentNo', enrolmentnumber: 'enrollmentNo', batch: 'batch', section: 'section' };
// Bulk-create students. Good rows are imported, bad rows are listed with the reason. Passwords are never echoed back.
router.post('/users/import', (req, res, next) => upload.single('file')(req, res, next), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ help: true, error: 'Attach a CSV file in the "file" field (max 1 MB)' });
    const rows = parseCsv(req.file.buffer.toString('utf8'));
    if (rows.length < 2) return res.status(400).json({ help: true, error: 'The file has no data rows' });
    const cols = rows[0].map((h) => HEADERS[h.trim().toLowerCase().replace(/[^a-z]/g, '')] || null);
    for (const need of ['name', 'branch', 'year', 'semester', 'email', 'password', 'group']) if (!cols.includes(need)) return res.status(400).json({ help: true, error: 'Missing column: ' + need + '. Required columns: name, branch, year, semester, email, initial password, group. Optional: enrollment number, roll number, batch, section. Group must be G1 or G2.' });
    if (rows.length - 1 > MAX_ROWS) return res.status(400).json({ error: 'Too many rows (max ' + MAX_ROWS + ' per file)' });
    const failed = []; const good = []; const seenEmail = new Set(), seenRoll = new Set(), seenEnr = new Set();
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
      v.group = User.normGroup(v.group); if (!v.group) return bad('Group must be G1 or G2');
      if (v.enrollmentNo && (v.enrollmentNo.length > 30 || /^[=+\-@\t]/.test(v.enrollmentNo))) return bad('Enrollment number is invalid (max 30 characters)');
      if (v.enrollmentNo && seenEnr.has(v.enrollmentNo)) return bad('Duplicate enrollment number in this file'); if (v.enrollmentNo) seenEnr.add(v.enrollmentNo);
      if (seenEmail.has(v.email)) return bad('Duplicate email in this file');
      if (v.rollNo && seenRoll.has(v.rollNo)) return bad('Duplicate roll number in this file');
      seenEmail.add(v.email); if (v.rollNo) seenRoll.add(v.rollNo);
      good.push({ line, v, dept, year, sem });
    });
    const emails = good.map((g) => g.v.email), rolls = good.map((g) => g.v.rollNo).filter(Boolean);
    const enrs = good.map((g) => g.v.enrollmentNo).filter(Boolean);
    const [ex1, ex2, ex3] = await Promise.all([User.find({ email: { $in: emails } }).distinct('email'), User.find({ rollNo: { $in: rolls } }).distinct('rollNo'), User.find({ enrollmentNo: { $in: enrs } }).distinct('enrollmentNo')]);
    const e1 = new Set(ex1), e2 = new Set(ex2), e3 = new Set(ex3); const ok = [];
    for (const g of good) {
      if (e1.has(g.v.email)) failed.push({ row: g.line, email: g.v.email, error: 'Email already registered' });
      else if (g.v.rollNo && e2.has(g.v.rollNo)) failed.push({ row: g.line, email: g.v.email, error: 'Roll number already registered' });
      else if (g.v.enrollmentNo && e3.has(g.v.enrollmentNo)) failed.push({ row: g.line, email: g.v.email, error: 'Enrollment number already registered' });
      else ok.push(g);
    }
    const docs = [];
    for (const g of ok) docs.push({ name: g.v.name, email: g.v.email, passwordHash: await bcrypt.hash(g.v.password, 10), role: 'student', department: g.dept, year: g.year, semester: g.sem, enrollmentNo: g.v.enrollmentNo || undefined, rollNo: g.v.rollNo || undefined, group: g.v.group, batch: g.v.batch || undefined, section: g.v.section || undefined, mustChangePassword: true });
    let created = 0;
    try { created = (await User.insertMany(docs, { ordered: false })).length; } catch (e) { if (e.insertedDocs) created = e.insertedDocs.length; else throw e; }
    failed.sort((a, b) => a.row - b.row);
    res.status(created ? 201 : 200).json({ created, failed });
  } catch (e) { next(e); }
});
router.get('/users', async (req, res, next) => {
  try {
    const f = {}, role = str(req.query.role), dept = str(req.query.department), q = str(req.query.q).slice(0, 60);
    if (ROLES.includes(role)) f.role = role;
    if (User.DEPARTMENTS.includes(dept)) f.department = dept;
    if (q) { const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); f.$or = [{ name: re }, { email: re }, { rollNo: re }, { enrollmentNo: re }]; }
    const pg = paging(req.query, 25, 100);
    const [u, total] = await Promise.all([User.find(f).sort({ role: 1, name: 1 }).skip(pg.skip).limit(pg.pageSize), User.countDocuments(f)]);
    res.json({ users: u.map(view), total, page: pg.page, pages: Math.max(1, Math.ceil(total / pg.pageSize)) });
  } catch (e) { next(e); }
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
