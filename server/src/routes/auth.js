const router = require('express').Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { sign, requireAuth } = require('../middleware');
const str = (v) => (typeof v === 'string' ? v : '');
const pub = (u) => ({ id: u._id, name: u.name, email: u.email, role: u.role, department: u.department, year: u.year });

// Public registration creates STUDENTS only. Role is never read from the request body.
router.post('/register', async (req, res, next) => {
  try {
    const name = str(req.body.name).trim(), email = str(req.body.email).trim().toLowerCase(), password = str(req.body.password);
    const department = str(req.body.department), year = Number(req.body.year);
    if (!name || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Name and a valid email are required' });
    if (password.length < 8 || password.length > 72) return res.status(400).json({ error: 'Password must be 8-72 characters' });
    if (!User.DEPARTMENTS.includes(department)) return res.status(400).json({ error: 'Choose a valid department' });
    if (!(year >= 1 && year <= 4)) return res.status(400).json({ error: 'Year must be 1-4' });
    if (await User.findOne({ email })) return res.status(409).json({ error: 'Email already registered' });
    const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 10), role: 'student', department, year });
    res.status(201).json({ token: sign(user), user: pub(user) });
  } catch (e) { next(e); }
});
router.post('/login', async (req, res, next) => {
  try {
    const email = str(req.body.email).trim().toLowerCase(), password = str(req.body.password);
    const user = await User.findOne({ email });
    const ok = user && await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Wrong email or password' });
    res.json({ token: sign(user), user: pub(user) });
  } catch (e) { next(e); }
});
router.get('/me', requireAuth, (req, res) => res.json({ user: pub(req.user) }));
module.exports = { router, pub };
