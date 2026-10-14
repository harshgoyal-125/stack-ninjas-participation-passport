const crypto = require('crypto');
const router = require('express').Router();
const Share = require('../models/Share');
const Activity = require('../models/Activity');
const User = require('../models/User');
const { requireAuth, requireRole, isId } = require('../middleware');
const newToken = () => crypto.randomBytes(24).toString('base64url'); // 192 bits, unguessable
const view = (s) => ({ id: s._id, scope: s.scope, activity: s.activity || null, token: s.token, revoked: s.revoked, createdAt: s.createdAt });

// Student-managed links. Sharing is off until the student creates a link.
router.get('/', requireAuth, requireRole('student'), async (req, res, next) => {
  try { res.json({ shares: (await Share.find({ student: req.user._id, revoked: false }).sort({ createdAt: -1 })).map(view) }); } catch (e) { next(e); }
});
router.post('/', requireAuth, requireRole('student'), async (req, res, next) => {
  try {
    const scope = req.body.scope; const q = { student: req.user._id, scope, revoked: false };
    if (scope === 'activity') {
      if (!isId(req.body.activityId)) return res.status(400).json({ error: 'Choose a verified activity' });
      const a = await Activity.findOne({ _id: req.body.activityId, student: req.user._id, status: 'verified' });
      if (!a) return res.status(400).json({ error: 'Only your own verified activities can be shared' });
      q.activity = a._id;
    } else if (scope !== 'profile') return res.status(400).json({ error: 'Scope must be profile or activity' });
    const existing = await Share.findOne(q); if (existing) return res.json({ share: view(existing) });
    const s = await Share.create({ ...q, token: newToken() });
    res.status(201).json({ share: view(s) });
  } catch (e) { next(e); }
});
router.post('/:id/revoke', requireAuth, requireRole('student'), async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const s = await Share.findOne({ _id: req.params.id, student: req.user._id }); if (!s) return res.status(404).json({ error: 'Not found' });
    s.revoked = true; await s.save(); res.json({ ok: true });
  } catch (e) { next(e); }
});

// Public, no login. Limited details only: name, department, year, and VERIFIED items (title, type, organizer, date). Never email, roll number, notes or certificate files.
const pub = require("express").Router();
pub.get('/:token', async (req, res, next) => {
  try {
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
    const s = await Share.findOne({ token: String(req.params.token).slice(0, 80), revoked: false });
    const gone = () => res.status(404).json({ error: 'This link is not available' });
    if (!s) return gone();
    const st = await User.findById(s.student).select('name department year role'); if (!st || st.role !== 'student') return gone();
    const item = (a) => ({ title: a.title, type: a.type, organizer: a.organizer, date: a.date });
    const student = { name: st.name, department: st.department, year: st.year };
    if (s.scope === 'activity') {
      const a = await Activity.findOne({ _id: s.activity, student: s.student, status: 'verified' }); if (!a) return gone();
      return res.json({ scope: 'activity', student, activities: [item(a)] });
    }
    const list = await Activity.find({ student: s.student, status: 'verified' }).sort({ date: -1 }).limit(100);
    res.json({ scope: 'profile', student, activities: list.map(item) });
  } catch (e) { next(e); }
});
module.exports = { router, publicRouter: pub };
