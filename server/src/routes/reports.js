const router = require('express').Router();
const Activity = require('../models/Activity');
const User = require('../models/User');
const { requireAuth, requireRole } = require('../middleware');
router.use(requireAuth);
const { activityScope, studentQuery } = require('../scope');
const mongoose = require('mongoose');
const num = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 && n < 20 ? n : null; };
const tally = (arr, key) => { const m = {}; arr.forEach((x) => { const k = key(x); m[k] = (m[k] || 0) + 1; }); return m; };
const list = (m, sort) => Object.entries(m).map(([k, count]) => ({ key: k, count })).sort(sort);
const csvCell = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };

// Reports count VERIFIED records only. Pending and rejected never appear.
router.get('/me', requireRole('student'), async (req, res, next) => {
  try {
    const rows = await Activity.find({ student: req.user._id, status: 'verified' }).sort({ date: -1 });
    const byType = {};
    rows.forEach((a) => { byType[a.type] = (byType[a.type] || 0) + 1; });
    res.json({ verifiedCount: rows.length, byType, activities: rows.map((a) => ({ id: a._id, title: a.title, type: a.type, organizer: a.organizer, date: a.date })) });
  } catch (e) { next(e); }
});
router.get('/summary', requireRole('faculty', 'counsellor', 'hod', 'admin'), async (req, res, next) => {
  try {
    const match = { status: 'verified', ...(await activityScope(req.user)) };
    const [byDept, byType, pending] = await Promise.all([
      Activity.aggregate([{ $match: match }, { $group: { _id: '$department', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
      Activity.aggregate([{ $match: match }, { $group: { _id: '$type', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
      Activity.countDocuments({ status: 'submitted', ...(await activityScope(req.user)) }),
    ]);
    res.json({ verifiedByDepartment: byDept.map((x) => ({ department: x._id, count: x.count })), verifiedByType: byType.map((x) => ({ type: x._id, count: x.count })), pendingReview: pending });
  } catch (e) { next(e); }
});
router.get('/export.csv', requireRole('faculty', 'counsellor', 'hod', 'admin'), async (req, res, next) => {
  try {
    const match = { status: 'verified', ...(await activityScope(req.user)) };
    const rows = await Activity.find(match).populate('student', 'name year').sort({ date: -1 }).limit(5000);
    const lines = ['Student,Year,Department,Title,Type,Organizer,Date'].concat(rows.map((a) => [a.student?.name, a.student?.year, a.department, a.title, a.type, a.organizer, a.date.toISOString().slice(0, 10)].map(csvCell).join(',')));
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="verified-participation.csv"' }).send(lines.join('\n'));
  } catch (e) { next(e); }
});
router.get('/students', requireRole('faculty', 'counsellor', 'hod', 'admin'), async (req, res, next) => {
  try {
    const match = { status: 'verified', ...(await activityScope(req.user)) };
    const g = await Activity.aggregate([{ $match: match }, { $group: { _id: '$student', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 50 }]);
    const users = await User.find({ _id: { $in: g.map((x) => x._id) } }).select('name department year');
    const m = new Map(users.map((u) => [String(u._id), u]));
    res.json({ students: g.map((x) => ({ name: m.get(String(x._id))?.name, department: m.get(String(x._id))?.department, year: m.get(String(x._id))?.year, verifiedCount: x.count })) });
  } catch (e) { next(e); }
});
const STAFF = ['faculty', 'counsellor', 'hod', 'admin'];
// Charts data: verified records only, inside the caller's scope. Optional year/semester filter.
router.get('/analytics', requireRole(...STAFF), async (req, res, next) => {
  try {
    const year = num(req.query.year), sem = num(req.query.semester);
    const sq = await studentQuery(req.user);
    if (year) sq.year = year; if (sem) sq.semester = sem;
    const students = await User.find(sq).select('year semester name');
    const ids = students.map((x) => x._id);
    const base = await activityScope(req.user);
    const acts = await Activity.find({ ...base, student: { $in: ids } }).select('student type title date status').limit(5000).lean();
    const yearOf = new Map(students.map((x) => [String(x._id), x.year]));
    const ver = acts.filter((a) => a.status === 'verified');
    const out = {
      students: students.length,
      totals: { verified: ver.length, inReview: acts.filter((a) => a.status === 'submitted').length, changesNeeded: acts.filter((a) => a.status === 'changes_needed').length },
      byYear: list(tally(ver, (a) => 'Year ' + (yearOf.get(String(a.student)) || '?')), (a, b) => a.key.localeCompare(b.key)),
      byType: list(tally(ver, (a) => a.type), (a, b) => b.count - a.count),
      byMonth: list(tally(ver, (a) => a.date.toISOString().slice(0, 7)), (a, b) => a.key.localeCompare(b.key)),
      byEvent: list(tally(ver, (a) => a.title), (a, b) => b.count - a.count).slice(0, 10),
    };
    if (req.user.role === 'hod' || req.user.role === 'admin') {
      const cq = { role: 'counsellor' }; if (req.user.role === 'hod') cq.department = req.user.department;
      const cs = await User.find(cq).select('name email role department batch section group');
      out.byCounsellor = [];
      for (const c of cs) {
        const q = await studentQuery(c);
        const sids = await User.find(q).distinct('_id');
        const n = await Activity.countDocuments({ status: 'verified', department: c.department, student: { $in: sids } });
        out.byCounsellor.push({ name: c.name, email: c.email, department: c.department, batch: c.batch || '', section: c.section || '', group: c.group || '', students: sids.length, verified: n });
      }
    }
    res.json(out);
  } catch (e) { next(e); }
});
// Student list with counts. Query: q (name/email/roll), year, semester.
router.get('/student-list', requireRole(...STAFF), async (req, res, next) => {
  try {
    const sq = await studentQuery(req.user);
    const year = num(req.query.year), sem = num(req.query.semester);
    if (year) sq.year = year; if (sem) sq.semester = sem;
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 60) : '';
    if (q) { const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); sq.$or = [{ name: re }, { email: re }, { rollNo: re }, { enrollmentNo: re }]; }
    const us = await User.find(sq).select('name email department year semester enrollmentNo rollNo batch section group').sort({ name: 1 }).limit(300).lean();
    const ag = await Activity.aggregate([{ $match: { student: { $in: us.map((u) => u._id) } } }, { $group: { _id: { s: '$student', st: '$status' }, c: { $sum: 1 } } }]);
    const cnt = {}; ag.forEach((g) => { const k = String(g._id.s); cnt[k] = cnt[k] || {}; cnt[k][g._id.st] = g.c; });
    res.json({ students: us.map((u) => ({ id: u._id, name: u.name, email: u.email, department: u.department, year: u.year, semester: u.semester, enrollmentNo: u.enrollmentNo, rollNo: u.rollNo || '', batch: u.batch || '', section: u.section || '', group: u.group || '', verified: cnt[String(u._id)]?.verified || 0, inReview: cnt[String(u._id)]?.submitted || 0, changesNeeded: cnt[String(u._id)]?.changes_needed || 0 })) });
  } catch (e) { next(e); }
});
router.get('/student/:id', requireRole(...STAFF), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const sq = await studentQuery(req.user); sq._id = req.params.id;
    const u = await User.findOne(sq).select('name email department year semester enrollmentNo rollNo batch section group');
    if (!u) return res.status(404).json({ error: 'Not found' });
    const acts = await Activity.find({ student: u._id }).select('title type organizer date status reviewNote').sort({ date: -1 }).limit(200);
    res.json({ student: { id: u._id, name: u.name, email: u.email, department: u.department, year: u.year, semester: u.semester, enrollmentNo: u.enrollmentNo, rollNo: u.rollNo || '', batch: u.batch || '', section: u.section || '', group: u.group || '' }, activities: acts.map((a) => ({ id: a._id, title: a.title, type: a.type, organizer: a.organizer, date: a.date, status: a.status, reviewNote: a.reviewNote })) });
  } catch (e) { next(e); }
});
module.exports = router;
