const jwt = require('jsonwebtoken');
const User = require('./models/User');
function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) throw new Error('JWT_SECRET must be set (16+ chars)');
  return s;
}
function sign(user) {
  return jwt.sign({ sub: String(user._id), role: user.role }, secret(), { expiresIn: '8h' });
}
async function requireAuth(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) return res.status(401).json({ error: 'Login required' });
    const p = jwt.verify(h.slice(7), secret());
    const user = await User.findById(p.sub);
    if (!user) return res.status(401).json({ error: 'Login required' });
    req.user = user;
    next();
  } catch (e) {
    if (e.name === 'JsonWebTokenError' || e.name === 'TokenExpiredError') return res.status(401).json({ error: 'Login required' });
    next(e);
  }
}
const requireRole = (...roles) => (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Not allowed' });
const isId = (v) => /^[a-f0-9]{24}$/i.test(String(v));
module.exports = { sign, requireAuth, requireRole, isId };
