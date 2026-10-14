const router = require('express').Router();
const Activity = require('../models/Activity');
const User = require('../models/User');
const { requireAuth, requireRole } = require('../middleware');
router.use(requireAuth);
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
router.get('/summary', requireRole('faculty', 'admin'), async (req, res, next) => {
  try {
    const match = { status: 'verified' };
    if (req.user.role === 'faculty') match.department = req.user.department;
    const [byDept, byType, pending] = await Promise.all([
      Activity.aggregate([{ $match: match }, { $group: { _id: '$department', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
      Activity.aggregate([{ $match: match }, { $group: { _id: '$type', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
      Activity.countDocuments({ status: 'submitted', ...(req.user.role === 'faculty' ? { department: req.user.department } : {}) }),
    ]);
    res.json({ verifiedByDepartment: byDept.map((x) => ({ department: x._id, count: x.count })), verifiedByType: byType.map((x) => ({ type: x._id, count: x.count })), pendingReview: pending });
  } catch (e) { next(e); }
});
router.get('/export.csv', requireRole('faculty', 'admin'), async (req, res, next) => {
  try {
    const match = { status: 'verified' };
    if (req.user.role === 'faculty') match.department = req.user.department;
    const rows = await Activity.find(match).populate('student', 'name year').sort({ date: -1 }).limit(5000);
    const lines = ['Student,Year,Department,Title,Type,Organizer,Date'].concat(rows.map((a) => [a.student?.name, a.student?.year, a.department, a.title, a.type, a.organizer, a.date.toISOString().slice(0, 10)].map(csvCell).join(',')));
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="verified-participation.csv"' }).send(lines.join('\n'));
  } catch (e) { next(e); }
});
router.get('/students', requireRole('faculty', 'admin'), async (req, res, next) => {
  try {
    const match = { status: 'verified' }; if (req.user.role === 'faculty') match.department = req.user.department;
    const g = await Activity.aggregate([{ $match: match }, { $group: { _id: '$student', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 50 }]);
    const users = await User.find({ _id: { $in: g.map((x) => x._id) } }).select('name department year');
    const m = new Map(users.map((u) => [String(u._id), u]));
    res.json({ students: g.map((x) => ({ name: m.get(String(x._id))?.name, department: m.get(String(x._id))?.department, year: m.get(String(x._id))?.year, verifiedCount: x.count })) });
  } catch (e) { next(e); }
});
module.exports = router;
