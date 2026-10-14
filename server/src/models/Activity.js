const mongoose = require('mongoose');
const TYPES = ['Hackathon', 'Workshop', 'Seminar', 'Sports', 'Cultural', 'Competition', 'Other'];
const STATUSES = ['submitted', 'verified', 'changes_needed'];
const schema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  department: { type: String, required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  type: { type: String, enum: TYPES, required: true },
  organizer: { type: String, trim: true, maxlength: 120, default: '' },
  date: { type: Date, required: true },
  description: { type: String, trim: true, maxlength: 600, default: '' },
  status: { type: String, enum: STATUSES, default: 'submitted', index: true },
  reviewNote: { type: String, maxlength: 400, default: '' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  certificate: { filename: String, mime: String, size: Number, data: { type: Buffer, select: false } },
}, { timestamps: true });
schema.index({ student: 1, status: 1, date: -1 });
schema.index({ department: 1, status: 1, date: -1 });
schema.index({ status: 1, createdAt: -1 });
module.exports = mongoose.model('Activity', schema);
module.exports.TYPES = TYPES;
