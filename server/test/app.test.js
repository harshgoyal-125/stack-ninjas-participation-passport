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
