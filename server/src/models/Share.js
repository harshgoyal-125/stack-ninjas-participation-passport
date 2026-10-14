const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  token: { type: String, required: true, unique: true },
  scope: { type: String, enum: ['profile', 'activity'], required: true },
  activity: { type: mongoose.Schema.Types.ObjectId, ref: 'Activity' },
  revoked: { type: Boolean, default: false },
}, { timestamps: true });
module.exports = mongoose.model('Share', schema);
