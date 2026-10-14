process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-test-secret-123456';
const request = require('supertest');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createApp } = require('../src/app');
const User = require('../src/models/User');
const Activity = require('../src/models/Activity');

let mem, app;
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]);
beforeAll(async () => { if (process.env.TEST_MONGO_URI) { await mongoose.connect(process.env.TEST_MONGO_URI); } else { mem = await MongoMemoryServer.create(); await mongoose.connect(mem.getUri()); } app = createApp(); }, 120000);
afterAll(async () => { await mongoose.disconnect(); if (mem) await mem.stop(); });
beforeEach(async () => { await User.deleteMany({}); await Activity.deleteMany({}); });

const reg = async (email, dept = 'IT') => (await request(app).post('/api/auth/register').send({ name: email.split('@')[0], email, password: 'password123', department: dept, year: 3 })).body;
const mk = async (role, email, dept) => { await User.create({ name: email, email, passwordHash: await bcrypt.hash('password123', 4), role, department: dept }); return (await request(app).post('/api/auth/login').send({ email, password: 'password123' })).body.token; };
const submit = (token, extra = {}, file = PDF, name = 'c.pdf') => {
  const r = request(app).post('/api/activities').set('Authorization', 'Bearer ' + token).field('title', extra.title || 'Hack').field('type', 'Hackathon').field('date', '2026-01-10');
  return file ? r.attach('certificate', file, name) : r;
};

test('register ignores a role field and makes a student', async () => {
  const res = await request(app).post('/api/auth/register').send({ name: 'x', email: 'x@a.com', password: 'password123', department: 'IT', year: 2, role: 'admin' });
  expect(res.status).toBe(201); expect(res.body.user.role).toBe('student');
});
test('NoSQL operator injection in login is rejected', async () => {
  await reg('a@a.com');
  const res = await request(app).post('/api/auth/login').send({ email: { $ne: '' }, password: { $ne: '' } });
  expect(res.status).toBe(400);
});
test('protected routes need a token', async () => {
  expect((await request(app).get('/api/activities')).status).toBe(401);
  expect((await request(app).get('/api/activities').set('Authorization', 'Bearer junk')).status).toBe(401);
});
test('student A cannot read B record or certificate', async () => {
  const a = (await reg('a@a.com')).token, b = (await reg('b@a.com')).token;
  const id = (await submit(a)).body.activity.id;
  expect((await request(app).get('/api/activities/' + id).set('Authorization', 'Bearer ' + b)).status).toBe(404);
  expect((await request(app).get(`/api/activities/${id}/certificate`).set('Authorization', 'Bearer ' + b)).status).toBe(404);
  expect((await request(app).get(`/api/activities/${id}/certificate`).set('Authorization', 'Bearer ' + a)).status).toBe(200);
  const list = await request(app).get('/api/activities').set('Authorization', 'Bearer ' + b);
  expect(list.body.activities).toHaveLength(0);
});
test('student cannot call review endpoint or admin endpoints', async () => {
  const a = (await reg('a@a.com')).token; const id = (await submit(a)).body.activity.id;
  expect((await request(app).post(`/api/activities/${id}/review`).set('Authorization', 'Bearer ' + a).send({ decision: 'verify' })).status).toBe(403);
  expect((await request(app).get('/api/admin/users').set('Authorization', 'Bearer ' + a)).status).toBe(403);
  expect((await request(app).get('/api/reports/summary').set('Authorization', 'Bearer ' + a)).status).toBe(403);
});
test('faculty cannot review another department', async () => {
  const a = (await reg('a@a.com', 'IT')).token; const id = (await submit(a)).body.activity.id;
  const ece = await mk('faculty', 'f1@a.com', 'ECE');
  expect((await request(app).post(`/api/activities/${id}/review`).set('Authorization', 'Bearer ' + ece).send({ decision: 'verify' })).status).toBe(404);
  const it = await mk('faculty', 'f2@a.com', 'IT');
  expect((await request(app).post(`/api/activities/${id}/review`).set('Authorization', 'Bearer ' + it).send({ decision: 'verify' })).status).toBe(200);
});
test('changes_needed requires a reason; resubmit flow; report counts verified only', async () => {
  const a = (await reg('a@a.com')).token; const f = await mk('faculty', 'f@a.com', 'IT');
  const id1 = (await submit(a, { title: 'One' })).body.activity.id; const id2 = (await submit(a, { title: 'Two' })).body.activity.id; await submit(a, { title: 'Three' });
  const rv = (id, body) => request(app).post(`/api/activities/${id}/review`).set('Authorization', 'Bearer ' + f).send(body);
  expect((await rv(id1, { decision: 'changes_needed' })).status).toBe(400);
  expect((await rv(id1, { decision: 'verify' })).status).toBe(200);
  expect((await rv(id2, { decision: 'changes_needed', note: 'blurry' })).status).toBe(200);
  const rep = await request(app).get('/api/reports/me').set('Authorization', 'Bearer ' + a);
  expect(rep.body.verifiedCount).toBe(1); expect(rep.body.activities[0].title).toBe('One');
  const put = await request(app).put('/api/activities/' + id2).set('Authorization', 'Bearer ' + a).field('title', 'Two fixed').field('type', 'Workshop').field('date', '2026-01-11');
  expect(put.status).toBe(200); expect(put.body.activity.status).toBe('submitted');
  expect((await request(app).put('/api/activities/' + id1).set('Authorization', 'Bearer ' + a).field('title', 'x').field('type', 'Workshop').field('date', '2026-01-11')).status).toBe(409);
});
test('uploads: reject fake type, no file and oversized; accept png', async () => {
  const a = (await reg('a@a.com')).token;
  expect((await submit(a, {}, Buffer.from('<script>alert(1)</script>'), 'evil.pdf')).status).toBe(400);
  expect((await submit(a, {}, null)).status).toBe(400);
  expect((await submit(a, {}, Buffer.concat([PDF, Buffer.alloc(3 * 1024 * 1024)]), 'big.pdf')).status).toBe(413);
  expect((await submit(a, {}, PNG, 'c.png')).status).toBe(201);
});
test('summary and CSV export are verified-only, and neutralise formula cells', async () => {
  const a = (await reg('a@a.com')).token; const f = await mk('faculty', 'f@a.com', 'IT');
  const id = (await submit(a, { title: '=HYPERLINK("x")' })).body.activity.id; await submit(a, { title: 'Pending' });
  await request(app).post(`/api/activities/${id}/review`).set('Authorization', 'Bearer ' + f).send({ decision: 'verify' });
  const csv = await request(app).get('/api/reports/export.csv').set('Authorization', 'Bearer ' + f);
  expect(csv.text).toContain("\"'=HYPERLINK"); expect(csv.text).not.toContain('Pending');
  const s = await request(app).get('/api/reports/summary').set('Authorization', 'Bearer ' + f);
  expect(s.body.pendingReview).toBe(1); expect(s.body.verifiedByDepartment).toEqual([{ department: 'IT', count: 1 }]);
});
test('only admin can create faculty', async () => {
  const admin = await mk('admin', 'ad@a.com', 'CSE');
  const r = await request(app).post('/api/admin/users').set('Authorization', 'Bearer ' + admin).send({ name: 'F', email: 'ff@a.com', password: 'password123', role: 'faculty', department: 'IT' });
  expect(r.status).toBe(201);
});

describe('admin user management', () => {
  const adm = async (email = 'ad@a.com') => mk('admin', email, 'CSE');
  const post = (t, body) => request(app).post('/api/admin/users').set('Authorization', 'Bearer ' + t).send(body);
  test('only admin can list, create or delete users', async () => {
    const st = (await reg('s@a.com')).token, fa = await mk('faculty', 'f@a.com', 'IT'), co = await mk('counsellor', 'c@a.com', 'IT'), ho = await mk('hod', 'h@a.com', 'IT');
    for (const t of [st, fa, co, ho]) {
      expect((await request(app).get('/api/admin/users').set('Authorization', 'Bearer ' + t)).status).toBe(403);
      expect((await post(t, { name: 'x', email: 'x@a.com', password: 'password123', role: 'admin', department: 'IT' })).status).toBe(403);
      expect((await request(app).delete('/api/admin/users/' + 'a'.repeat(24)).set('Authorization', 'Bearer ' + t)).status).toBe(403);
    }
    expect((await request(app).get('/api/admin/users')).status).toBe(401);
  });
  test('admin creates every role, hashed password, no password in response or list', async () => {
    const t = await adm();
    const mkU = (role, extra = {}) => post(t, { name: role, email: role + '@d.com', password: 'Str0ng-pass-1', role, department: 'IT', demo: true, ...extra });
    expect((await mkU('student', { year: 2, rollNo: '21IT01', group: 'G1' })).status).toBe(201);
    expect((await mkU('counsellor', { batch: '2022', section: 'A', group: 'G1' })).status).toBe(201);
    expect((await mkU('hod')).status).toBe(201);
    expect((await mkU('student', { email: 'bad@d.com', year: 9 })).status).toBe(400);
    expect((await mkU('student', { year: 2 })).status).toBe(409);
    expect((await post(t, { name: 'x', email: 'q@d.com', password: 'short', role: 'hod', department: 'IT' })).status).toBe(400);
    expect((await post(t, { name: 'x', email: 'q@d.com', password: 'password123', role: 'superuser', department: 'IT' })).status).toBe(400);
    const raw = await User.findOne({ email: 'student@d.com' });
    expect(raw.passwordHash).not.toContain('Str0ng'); expect(raw.passwordHash.startsWith('$2')).toBe(true);
    const list = await request(app).get('/api/admin/users').set('Authorization', 'Bearer ' + t);
    expect(list.status).toBe(200); expect(list.body.users.length).toBe(4);
    expect(JSON.stringify(list.body)).not.toMatch(/passwordHash|\$2[aby]\$|Str0ng/);
    expect(list.body.users.find((u) => u.role === 'student').rollNo).toBe('21IT01');
    const login = await request(app).post('/api/auth/login').send({ email: 'hod@d.com', password: 'Str0ng-pass-1' });
    expect(login.body.user.role).toBe('hod');
  });
  test('delete: not self, not last admin, student data removed, other users untouched', async () => {
    const t = await adm('ad@a.com');
    const me = await User.findOne({ email: 'ad@a.com' });
    expect((await request(app).delete('/api/admin/users/' + me._id).set('Authorization', 'Bearer ' + t)).status).toBe(400);
    const st = await reg('s@a.com'); await submit(st.token);
    const other = await reg('o@a.com'); await submit(other.token);
    expect(await Activity.countDocuments()).toBe(2);
    const del = await request(app).delete('/api/admin/users/' + st.user.id).set('Authorization', 'Bearer ' + t);
    expect(del.status).toBe(200); expect(del.body.activitiesRemoved).toBe(1);
    expect(await User.findOne({ email: 's@a.com' })).toBeNull();
    expect(await Activity.countDocuments()).toBe(1);
    expect(await User.findOne({ email: 'o@a.com' })).not.toBeNull();
    expect((await request(app).delete('/api/admin/users/' + st.user.id).set('Authorization', 'Bearer ' + t)).status).toBe(404);
    expect((await request(app).delete('/api/admin/users/not-an-id').set('Authorization', 'Bearer ' + t)).status).toBe(404);
    // last admin: a second admin deleting the first is fine, but the final one is protected
    const t2 = await adm('ad2@a.com');
    const second = await User.findOne({ email: 'ad2@a.com' });
    expect((await request(app).delete('/api/admin/users/' + me._id).set('Authorization', 'Bearer ' + t2)).status).toBe(200);
    expect((await request(app).delete('/api/admin/users/' + second._id).set('Authorization', 'Bearer ' + t2)).status).toBe(400);
  });
  test('counsellor reviews own department; hod can read reports but not review', async () => {
    const st = await reg('s@a.com', 'IT'); const id = (await submit(st.token)).body.activity.id;
    const co = await mk('counsellor', 'c@a.com', 'IT'), ho = await mk('hod', 'h@a.com', 'IT'), coOther = await mk('counsellor', 'c2@a.com', 'ECE');
    expect((await request(app).post(`/api/activities/${id}/review`).set('Authorization', 'Bearer ' + coOther).send({ decision: 'verify' })).status).toBe(404);
    expect((await request(app).post(`/api/activities/${id}/review`).set('Authorization', 'Bearer ' + ho).send({ decision: 'verify' })).status).toBe(403);
    expect((await request(app).get('/api/reports/summary').set('Authorization', 'Bearer ' + ho)).status).toBe(200);
    expect((await request(app).post(`/api/activities/${id}/review`).set('Authorization', 'Bearer ' + co).send({ decision: 'verify' })).status).toBe(200);
  });
});
