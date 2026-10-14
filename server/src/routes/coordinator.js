const router = require('express').Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { requireAuth, requireRole } = require('../middleware');
router.use(requireAuth, requireRole('coordinator'));
const str = (v) => (typeof v === 'string' ? v.trim() : '');

// A Faculty Coordinator adds one student the admin missed. Branch, section and group come from the
// coordinator's own account, never from the request, so a student can only be added inside their own scope.
router.post('/students', async (req, res, next) => {
  try {
    const b = req.body, me = req.user;
    const name = str(b.name).slice(0, 80), email = str(b.email).toLowerCase(), password = str(b.password);
    const enrollmentNo = str(b.enrollmentNo), rollNo = str(b.rollNo);
    const year = Number(b.year), semester = Number(b.semester);
    if (!name || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Name and a valid email are required' });
    if (password.length < 8 || password.length > 72) return res.status(400).json({ error: 'Temporary password must be 8-72 characters' });
    if (!enrollmentNo || enrollmentNo.length > 30 || /^[=+\-@\t]/.test(enrollmentNo)) return res.status(400).json({ error: 'Enrollment number is required (max 30 characters)' });
    if (rollNo && (rollNo.length > 30 || /^[=+\-@\t]/.test(rollNo))) return res.status(400).json({ error: 'Roll number is invalid (max 30 characters)' });
    if (!(year >= 1 && year <= 4) || !(semester >= 1 && semester <= 8)) return res.status(400).json({ error: 'Year must be 1-4 and semester 1-8' });
    const group = me.group || User.normGroup(b.group), section = me.section || str(b.section).slice(0, 30);
    if (!group) return res.status(400).json({ error: 'Group must be G1 or G2' });
    if (await User.findOne({ email })) return res.status(409).json({ error: 'Email already registered' });
    if (await User.findOne({ enrollmentNo })) return res.status(409).json({ error: 'Enrollment number already registered' });
    if (rollNo && await User.findOne({ rollNo })) return res.status(409).json({ error: 'Roll number already registered' });
    const u = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 10), role: 'student', department: me.department, year, semester, enrollmentNo, rollNo: rollNo || undefined, section: section || undefined, group, mustChangePassword: true });
    res.status(201).json({ student: { id: u._id, name: u.name, email: u.email, department: u.department, year: u.year, semester: u.semester, enrollmentNo: u.enrollmentNo, rollNo: u.rollNo || '', section: u.section || '', group: u.group } });
  } catch (e) { if (e.code === 11000) return res.status(409).json({ error: 'Enrollment number, roll number or email already registered' }); next(e); }
});
module.exports = router;
