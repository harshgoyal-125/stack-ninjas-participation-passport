const router = require('express').Router();
const Activity = require('../models/Activity');
const User = require('../models/User');
const { requireAuth, requireRole } = require('../middleware');
router.use(requireAuth);
const { activityScope, studentQuery, paging } = require('../scope');
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
router.get('/summary', requireRole('coordinator', 'hod', 'admin'), async (req, res, next) => {
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
router.get('/export.csv', requireRole('coordinator', 'hod', 'admin'), async (req, res, next) => {
  try {
    const match = { status: 'verified', ...(await activityScope(req.user)) };
    const rows = await Activity.find(match).populate('student', 'name year').sort({ date: -1 }).limit(20000).lean();
    const lines = ['Student,Year,Department,Title,Type,Organizer,Date'].concat(rows.map((a) => [a.student?.name, a.student?.year, a.department, a.title, a.type, a.organizer, a.date.toISOString().slice(0, 10)].map(csvCell).join(',')));
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="verified-participation.csv"' }).send(lines.join('\n'));
  } catch (e) { next(e); }
});
router.get('/students', requireRole('coordinator', 'hod', 'admin'), async (req, res, next) => {
  try {
    const match = { status: 'verified', ...(await activityScope(req.user)) };
    const g = await Activity.aggregate([{ $match: match }, { $group: { _id: '$student', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 50 }]);
    const users = await User.find({ _id: { $in: g.map((x) => x._id) } }).select('name department year');
    const m = new Map(users.map((u) => [String(u._id), u]));
    res.json({ students: g.map((x) => ({ name: m.get(String(x._id))?.name, department: m.get(String(x._id))?.department, year: m.get(String(x._id))?.year, verifiedCount: x.count })) });
  } catch (e) { next(e); }
});
const STAFF = ['coordinator', 'hod', 'admin'];
// Charts data: verified records only, inside the caller's scope. Filters: year, semester, department (admin), section, group.
// Every breakdown is computed by the database, capped at the top 8 and an "Other" row, so the response size does not grow with the data.
const TOP = 8;
const topN = (rows, n = TOP) => { const s = rows.slice().sort((a, b) => b.count - a.count); if (s.length <= n) return s; return s.slice(0, n).concat({ key: 'Other', count: s.slice(n).reduce((t, r) => t + r.count, 0) }); };
const rowsOf = (g) => g.map((x) => ({ key: String(x._id ?? '?'), count: x.count }));
router.get('/analytics', requireRole(...STAFF), async (req, res, next) => {
  try {
    const year = num(req.query.year), sem = num(req.query.semester);
    const sq = await studentQuery(req.user);
    if (year) sq.year = year; if (sem) sq.semester = sem;
    if (req.user.role === 'admin' && User.DEPARTMENTS.includes(req.query.department)) sq.department = req.query.department;
    if (req.user.role !== 'coordinator') for (const k of ['section', 'group']) if (typeof req.query[k] === 'string' && req.query[k].trim()) sq[k] = req.query[k].trim().slice(0, 10);
    const students = await User.find(sq).select('year department batch section group').lean();
    const ids = students.map((x) => x._id);
    const base = { ...(await activityScope(req.user)), student: { $in: ids } };
    const ver = { ...base, status: 'verified' };
    const cnt = [{ $group: { _id: null, count: { $sum: 1 } } }];
    const [st, byType, byMonth, byEvent, perStudent] = await Promise.all([
      Activity.aggregate([{ $match: base }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Activity.aggregate([{ $match: ver }, { $group: { _id: '$type', count: { $sum: 1 } } }]),
      Activity.aggregate([{ $match: ver }, { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$date' } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
      Activity.aggregate([{ $match: ver }, { $group: { _id: '$title', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: TOP * 3 }]),
      Activity.aggregate([{ $match: ver }, { $group: { _id: '$student', count: { $sum: 1 } } }]),
    ]);
    const status = Object.fromEntries(st.map((x) => [x._id, x.count]));
    const per = new Map(perStudent.map((x) => [String(x._id), x.count]));
    const by = (keyFn) => { const m = {}; students.forEach((u) => { const c = per.get(String(u._id)) || 0; if (c) { const k = keyFn(u); m[k] = (m[k] || 0) + c; } }); return Object.entries(m).map(([key, count]) => ({ key, count })); };
    const months = rowsOf(byMonth);
    const out = {
      students: students.length,
      totals: { verified: status.verified || 0, inReview: status.submitted || 0, changesNeeded: status.changes_needed || 0 },
      charts: {
        year: by((u) => 'Year ' + (u.year || '?')).sort((a, b) => a.key.localeCompare(b.key)),
        type: topN(rowsOf(byType)),
        month: months.slice(-12),
        event: topN(rowsOf(byEvent), 10),
        branch: topN(by((u) => u.department)),
        status: [{ key: 'Verified', count: status.verified || 0 }, { key: 'In review', count: status.submitted || 0 }, { key: 'Changes needed', count: status.changes_needed || 0 }],
      },
    };
    if (req.user.role === 'hod' || req.user.role === 'admin') {
      const cq = { role: 'coordinator' }; if (req.user.role === 'hod') cq.department = req.user.department;
      const cs = await User.find(cq).select('name email department batch section group').lean();
      const all = students;
      const rows = cs.map((c) => {
        const mine = all.filter((u) => u.department === c.department && ['section', 'group'].every((k) => !c[k] || u[k] === c[k]) && (!c.batch || !u.batch || u.batch === c.batch));
        return { name: c.name, email: c.email, department: c.department, batch: c.batch || '', section: c.section || '', group: c.group || '', students: mine.length, verified: mine.reduce((t, u) => t + (per.get(String(u._id)) || 0), 0) };
      });
      out.byCoordinator = rows.sort((a, b) => b.verified - a.verified);
      out.charts.coordinator = topN(rows.filter((r) => r.verified).map((r) => ({ key: r.name, count: r.verified })));
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
    const pg = paging(req.query, 25, 100);
    const total = await User.countDocuments(sq);
    const us = await User.find(sq).select('name email department year semester enrollmentNo rollNo batch section group').sort({ name: 1 }).skip(pg.skip).limit(pg.pageSize).lean();
    const ag = await Activity.aggregate([{ $match: { student: { $in: us.map((u) => u._id) } } }, { $group: { _id: { s: '$student', st: '$status' }, c: { $sum: 1 } } }]);
    const cnt = {}; ag.forEach((g) => { const k = String(g._id.s); cnt[k] = cnt[k] || {}; cnt[k][g._id.st] = g.c; });
    res.json({ total, page: pg.page, pages: Math.max(1, Math.ceil(total / pg.pageSize)), students: us.map((u) => ({ id: u._id, name: u.name, email: u.email, department: u.department, year: u.year, semester: u.semester, enrollmentNo: u.enrollmentNo, rollNo: u.rollNo || '', batch: u.batch || '', section: u.section || '', group: u.group || '', verified: cnt[String(u._id)]?.verified || 0, inReview: cnt[String(u._id)]?.submitted || 0, changesNeeded: cnt[String(u._id)]?.changes_needed || 0 })) });
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
