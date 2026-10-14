const User = require('./models/User');
// Which activities a user may see. student: own. hod: own department.
// coordinator (Faculty Coordinator): own department AND only students matching the coordinator's section/group (and batch, where a student still has one).
// A coordinator sees students of the same section and group (when set). Batch is no longer entered for students,
// so a coordinator's old batch value only narrows students that still have a batch; students without one are matched by section and group.
function coordinatorFilter(user, q) {
  for (const k of ['section', 'group']) if (user[k]) q[k] = user[k];
  if (user.batch) q.batch = { $in: [user.batch, null, ''] };
  return q;
}
async function activityScope(user) {
  if (user.role === 'student') return { student: user._id };
  if (user.role === 'hod') return { department: user.department };
  if (user.role === 'coordinator') {
    const q = coordinatorFilter(user, { role: 'student', department: user.department });
    const ids = await User.find(q).distinct('_id');
    return { department: user.department, student: { $in: ids } };
  }
  return {};
}
// Students a staff user may see (same rules as activityScope).
async function studentQuery(user) {
  if (user.role === 'admin') return { role: 'student' };
  const q = { role: 'student', department: user.department };
  return user.role === 'coordinator' ? coordinatorFilter(user, q) : q;
}
// page / pageSize from the query string, clamped so one request never returns an unbounded list.
function paging(query, def = 25, max = 100) {
  const pageSize = Math.min(max, Math.max(1, parseInt(query.pageSize, 10) || def));
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  return { page, pageSize, skip: (page - 1) * pageSize };
}
module.exports = { activityScope, studentQuery, paging };
