const User = require('./models/User');
// Which activities a user may see. student: own. faculty/hod: own department.
// coordinator (Faculty Coordinator): own department AND only students matching the counsellor's batch/section/group (those that are set).
async function activityScope(user) {
  if (user.role === 'student') return { student: user._id };
  if (user.role === 'hod') return { department: user.department };
  if (user.role === 'coordinator') {
    const q = { role: 'student', department: user.department };
    for (const k of ['batch', 'section', 'group']) if (user[k]) q[k] = user[k];
    const ids = await User.find(q).distinct('_id');
    return { department: user.department, student: { $in: ids } };
  }
  return {};
}
// Students a staff user may see (same rules as activityScope).
async function studentQuery(user) {
  if (user.role === 'admin') return { role: 'student' };
  const q = { role: 'student', department: user.department };
  if (user.role === 'coordinator') for (const k of ['batch', 'section', 'group']) if (user[k]) q[k] = user[k];
  return q;
}
// page / pageSize from the query string, clamped so one request never returns an unbounded list.
function paging(query, def = 25, max = 100) {
  const pageSize = Math.min(max, Math.max(1, parseInt(query.pageSize, 10) || def));
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  return { page, pageSize, skip: (page - 1) * pageSize };
}
module.exports = { activityScope, studentQuery, paging };
