const User = require('./models/User');
// Which activities a user may see. student: own. faculty/hod: own department.
// counsellor: own department AND only students matching the counsellor's batch/section/group (those that are set).
async function activityScope(user) {
  if (user.role === 'student') return { student: user._id };
  if (user.role === 'faculty' || user.role === 'hod') return { department: user.department };
  if (user.role === 'counsellor') {
    const q = { role: 'student', department: user.department };
    for (const k of ['batch', 'section', 'group']) if (user[k]) q[k] = user[k];
    const ids = await User.find(q).distinct('_id');
    return { department: user.department, student: { $in: ids } };
  }
  return {};
}
module.exports = { activityScope };
