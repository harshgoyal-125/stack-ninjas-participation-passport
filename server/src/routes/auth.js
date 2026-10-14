const router = require('express').Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { sign, requireAuth } = require('../middleware');
const str = (v) => (typeof v === 'string' ? v : '');
const pub = (u) => ({ id: u._id, name: u.name, email: u.email, role: u.role, department: u.department, year: u.year, mustChangePassword: !!u.mustChangePassword });

const fails = new Map();
// Cloudflare Turnstile: only enforced when TURNSTILE_SECRET is set (production). Verified on the server.
async function turnstileOk(token, ip) {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) return true;
  if (typeof token !== 'string' || !token || token.length > 2048) return false;
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ secret, response: token, remoteip: ip || '' }), signal: AbortSignal.timeout(8000) });
    const j = await r.json(); return j.success === true;
  } catch { return false; }
}
const LOCK_MS = 15 * 60 * 1000;
router.post('/login', async (req, res, next) => {
  try {
    const email = str(req.body.email).trim().toLowerCase(), password = str(req.body.password);
    if (!(await turnstileOk(req.body.turnstileToken, req.ip))) return res.status(400).json({ error: 'Please complete the human check and try again.', captcha: true });
    const f = fails.get(email);
    if (f && f.n >= 5 && Date.now() - f.t < LOCK_MS) return res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.' });
    const user = await User.findOne({ email });
    const ok = user && await bcrypt.compare(password, user.passwordHash);
    if (!ok) { const g = f && Date.now() - f.t < LOCK_MS ? f : { n: 0 }; fails.set(email, { n: g.n + 1, t: Date.now() }); return res.status(401).json({ error: 'Wrong email or password' }); }
    fails.delete(email);
    res.json({ token: sign(user), user: pub(user) });
  } catch (e) { next(e); }
});
router.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const cur = str(req.body.current), next_ = str(req.body.next);
    if (!(await bcrypt.compare(cur, req.user.passwordHash))) return res.status(401).json({ error: 'Current password is wrong' });
    if (next_.length < 8 || next_.length > 72) return res.status(400).json({ error: 'New password must be 8-72 characters' });
    if (next_ === cur) return res.status(400).json({ error: 'New password must be different' });
    req.user.passwordHash = await bcrypt.hash(next_, 10); req.user.mustChangePassword = false; await req.user.save();
    res.json({ token: sign(req.user), user: pub(req.user) });
  } catch (e) { next(e); }
});
router.get('/config', (req, res) => res.json({ turnstileSiteKey: process.env.TURNSTILE_SECRET ? (process.env.TURNSTILE_SITE_KEY || '') : '' }));
router.get('/me', requireAuth, (req, res) => res.json({ user: pub(req.user) }));
module.exports = { router, pub };
