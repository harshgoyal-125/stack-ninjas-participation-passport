const mongoose = require('mongoose');
const DEPARTMENTS = ['CSE', 'IT', 'ECE', 'EE', 'ME', 'CE'];
const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 120 },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['student', 'faculty', 'admin'], default: 'student' },
  department: { type: String, enum: DEPARTMENTS, required: true },
  year: { type: Number, min: 1, max: 4 },
}, { timestamps: true });
module.exports = mongoose.model('User', schema);
module.exports.DEPARTMENTS = DEPARTMENTS;
