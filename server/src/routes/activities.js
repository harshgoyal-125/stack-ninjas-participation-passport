const router = require('express').Router();
const multer = require('multer');
const Activity = require('../models/Activity');
const { requireAuth, requireRole, isId } = require('../middleware');
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });

// Detect real file type from the first bytes, not the client-supplied name or mime.
function sniff(buf) {
  if (buf.length > 4 && buf.slice(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  return null;
}
const view = (a) => ({
  id: a._id, title: a.title, type: a.type, organizer: a.organizer, date: a.date, description: a.description,
  status: a.status, reviewNote: a.reviewNote, reviewedAt: a.reviewedAt, department: a.department,
  student: a.student && a.student.name ? { id: a.student._id, name: a.student.name, year: a.student.year } : a.student,
  certificate: a.certificate ? { filename: a.certificate.filename, mime: a.certificate.mime, size: a.certificate.size } : null,
  createdAt: a.createdAt,
});
function readFields(body) {
  const f = { title: str(body.title), type: str(body.type), organizer: str(body.organizer), description: str(body.description), date: new Date(str(body.date)) };
  if (!f.title) return { error: 'Title is required' };
  if (!Activity.TYPES.includes(f.type)) return { error: 'Choose a valid type' };
  if (isNaN(f.date) || f.date > new Date(Date.now() + 86400000)) return { error: 'Enter a valid past date' };
  return { f };
}
function cert(file) {
  if (!file) return { error: 'Certificate file is required (PDF, PNG or JPG, max 2 MB)' };
  const mime = sniff(file.buffer);
  if (!mime) return { error: 'Only PDF, PNG or JPG certificates are accepted' };
  const safe = String(file.originalname || 'certificate').replace(/[^\w.\- ]/g, '_').slice(0, 80);
  return { c: { filename: safe, mime, size: file.size, data: file.buffer } };
}
const up = (req, res, next) => upload.single('certificate')(req, res, next);

// Scope: student -> own; faculty -> own department; admin -> all.
function scopeFilter(user) {
  if (user.role === 'student') return { student: user._id };
  if (user.role === 'faculty') return { department: user.department };
  return {};
}
async function loadScoped(req, res, select) {
  if (!isId(req.params.id)) { res.status(404).json({ error: 'Not found' }); return null; }
  let q = Activity.findOne({ _id: req.params.id, ...scopeFilter(req.user) });
  if (select) q = q.select(select);
  const a = await q;
  if (!a) { res.status(404).json({ error: 'Not found' }); return null; } // 404, not 403: do not reveal other records exist
  return a;
}

router.use(requireAuth);

router.post('/', requireRole('student'), up, async (req, res, next) => {
  try {
    const r = readFields(req.body); if (r.error) return res.status(400).json({ error: r.error });
    const c = cert(req.file); if (c.error) return res.status(400).json({ error: c.error });
    const a = await Activity.create({ ...r.f, student: req.user._id, department: req.user.department, certificate: c.c });
    res.status(201).json({ activity: view(a) });
  } catch (e) { next(e); }
});

router.get('/', async (req, res, next) => {
  try {
    const filter = scopeFilter(req.user);
    const status = str(req.query.status), type = str(req.query.type), q = str(req.query.q);
    if (status) { if (!['submitted', 'verified', 'changes_needed'].includes(status)) return res.status(400).json({ error: 'Bad status' }); filter.status = status; }
    if (type) { if (!Activity.TYPES.includes(type)) return res.status(400).json({ error: 'Bad type' }); filter.type = type; }
    if (q) filter.title = { $regex: q.slice(0, 50).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    const list = await Activity.find(filter).populate('student', 'name year').sort({ createdAt: -1 }).limit(200);
    res.json({ activities: list.map(view) });
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try { const a = await loadScoped(req, res); if (a) { await a.populate('student', 'name year'); res.json({ activity: view(a) }); } } catch (e) { next(e); }
});

router.get('/:id/certificate', async (req, res, next) => {
  try {
    const a = await loadScoped(req, res, '+certificate.data'); if (!a) return;
    res.set({ 'Content-Type': a.certificate.mime, 'Content-Disposition': `inline; filename="${a.certificate.filename}"`, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
    res.send(a.certificate.data);
  } catch (e) { next(e); }
});

// Faculty decision. Only faculty of the same department (enforced by scopeFilter).
router.post('/:id/review', requireRole('faculty'), async (req, res, next) => {
  try {
    const a = await loadScoped(req, res); if (!a) return;
    const decision = str(req.body.decision), note = str(req.body.note).slice(0, 400);
    if (!['verify', 'changes_needed'].includes(decision)) return res.status(400).json({ error: 'Decision must be verify or changes_needed' });
    if (decision === 'changes_needed' && !note) return res.status(400).json({ error: 'A reason is required when requesting changes' });
    if (a.status === 'verified') return res.status(409).json({ error: 'Already verified' });
    a.status = decision === 'verify' ? 'verified' : 'changes_needed';
    a.reviewNote = note; a.reviewedBy = req.user._id; a.reviewedAt = new Date();
    await a.save();
    res.json({ activity: view(a) });
  } catch (e) { next(e); }
});

// Student fixes a "changes needed" record and resubmits it.
router.put('/:id', requireRole('student'), up, async (req, res, next) => {
  try {
    const a = await loadScoped(req, res); if (!a) return;
    if (a.status !== 'changes_needed') return res.status(409).json({ error: 'Only records with changes needed can be edited' });
    const r = readFields(req.body); if (r.error) return res.status(400).json({ error: r.error });
    Object.assign(a, r.f);
    if (req.file) { const c = cert(req.file); if (c.error) return res.status(400).json({ error: c.error }); a.certificate = c.c; }
    a.status = 'submitted'; a.reviewNote = '';
    await a.save();
    res.json({ activity: view(a) });
  } catch (e) { next(e); }
});
module.exports = router;
