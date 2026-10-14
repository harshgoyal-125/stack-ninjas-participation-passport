const router = require('express').Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { requireAuth, requireRole } = require('../middleware');
const str = (v) => (typeof v === 'string' ? v.trim() : '');
router.use(requireAuth, requireRole('admin'));
// Only an admin can create faculty/admin accounts.
router.post('/users', async (req, res, next) => {
  try {
    const name = str(req.body.name), email = str(req.body.email).toLowerCase(), password = str(req.body.password), role = str(req.body.role), department = str(req.body.department);
    if (!['faculty', 'admin'].includes(role)) return res.status(400).json({ error: 'Role must be faculty or admin' });
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || !User.DEPARTMENTS.includes(department)) return res.status(400).json({ error: 'Invalid details' });
    if (await User.findOne({ email })) return res.status(409).json({ error: 'Email already registered' });
    const u = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 10), role, department });
    res.status(201).json({ user: { id: u._id, name: u.name, email: u.email, role: u.role, department: u.department } });
  } catch (e) { next(e); }
});
router.get('/users', async (req, res, next) => {
  try { const u = await User.find().select('name email role department year').sort({ role: 1, name: 1 }).limit(300); res.json({ users: u }); } catch (e) { next(e); }
});
module.exports = router;
