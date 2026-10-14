const router = require('express').Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Activity = require('../models/Activity');
const { requireAuth, requireRole, isId } = require('../middleware');
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
    const doc = { name, email, passwordHash: await bcrypt.hash(password, 10), role, department, demo: b.demo === true };
    if (role === 'student') {
      const year = Number(b.year); if (!(year >= 1 && year <= 4)) return res.status(400).json({ error: 'Students need a year (1-4)' });
      doc.year = year;
      if (b.semester !== undefined && b.semester !== '') { const s = Number(b.semester); if (!(s >= 1 && s <= 8)) return res.status(400).json({ error: 'Semester must be 1-8' }); doc.semester = s; }
    }
    for (const k of ['rollNo', 'batch', 'section', 'group']) if (str(b[k])) doc[k] = str(b[k]).slice(0, 30);
    if (await User.findOne({ email })) return res.status(409).json({ error: 'Email already registered' });
    const u = await User.create(doc);
    res.status(201).json({ user: view(u) });
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
