const mongoose = require('mongoose');
const DEPARTMENTS = ['CSE', 'IT', 'ECE', 'EE', 'ME', 'CE'];
const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 120 },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['student', 'faculty', 'counsellor', 'hod', 'admin'], default: 'student' },
  department: { type: String, enum: DEPARTMENTS, required: true },
  year: { type: Number, min: 1, max: 4 },
  semester: { type: Number, min: 1, max: 8 },
  rollNo: { type: String, trim: true, maxlength: 30 },
  batch: { type: String, trim: true, maxlength: 30 },
  section: { type: String, trim: true, maxlength: 10 },
  group: { type: String, trim: true, maxlength: 10 },
  demo: { type: Boolean, default: false },
  mustChangePassword: { type: Boolean, default: false },
  resetTokenHash: { type: String, select: false },
  resetExpires: { type: Date, select: false },
  resetRequestedAt: { type: Date, select: false },
}, { timestamps: true });
schema.index({ rollNo: 1 }, { unique: true, partialFilterExpression: { rollNo: { $type: 'string' } } });
module.exports = mongoose.model('User', schema);
module.exports.DEPARTMENTS = DEPARTMENTS;
