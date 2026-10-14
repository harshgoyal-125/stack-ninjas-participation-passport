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

const reg = async (email, dept = 'IT') => { await User.create({ name: email.split('@')[0], email, passwordHash: await bcrypt.hash('password123', 4), role: 'student', department: dept, year: 3 }); return (await request(app).post('/api/auth/login').send({ email, password: 'password123' })).body; };
const mk = async (role, email, dept) => { await User.create({ name: email, email, passwordHash: await bcrypt.hash('password123', 4), role, department: dept }); return (await request(app).post('/api/auth/login').send({ email, password: 'password123' })).body.token; };
const submit = (token, extra = {}, file = PDF, name = 'c.pdf') => {
  const r = request(app).post('/api/activities').set('Authorization', 'Bearer ' + token).field('title', extra.title || 'Hack').field('type', 'Hackathon').field('date', '2026-01-10');
  return file ? r.attach('certificate', file, name) : r;
};

test('public self sign-up no longer exists', async () => {
  const res = await request(app).post('/api/auth/register').send({ name: 'x', email: 'x@a.com', password: 'password123', department: 'IT', year: 2, role: 'admin' });
  expect(res.status).toBe(404); expect(await User.countDocuments()).toBe(0);
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

describe('first login, CSV import, counsellor scope', () => {
  const H = 'name,branch,year,semester,email,initial password,group,roll number\n';
  const imp = (t, csv) => request(app).post('/api/admin/users/import').set('Authorization', 'Bearer ' + t).attach('file', Buffer.from(csv), 'students.csv');
  test('CSV import: good rows in, bad rows listed, no passwords echoed, hashed, forced change', async () => {
    const t = await mk('admin', 'ad@a.com', 'CSE');
    await User.create({ name: 'old', email: 'dup@a.com', passwordHash: 'x', role: 'student', department: 'IT', year: 1, rollNo: 'R9' });
    const csv = H + 'Asha,IT,2,3,asha@a.com,Secret-pass-1,G1,R1\n"Ravi, K",CSE,3,5,ravi@a.com,Secret-pass-2,G2,R2\n' +
      'Bad Year,IT,9,3,by@a.com,Secret-pass-3,G1,R3\nShort,IT,2,3,sp@a.com,abc,G1,R4\nDupMail,IT,2,3,asha@a.com,Secret-pass-5,G1,R5\nDupRoll,IT,2,3,dr@a.com,Secret-pass-6,G1,R1\nExists,IT,2,3,dup@a.com,Secret-pass-7,G1,R7\nRoll9,IT,2,3,r9@a.com,Secret-pass-8,G1,R9\n=cmd(),IT,2,3,f@a.com,Secret-pass-9,G1,R10\nBadBranch,XX,2,3,bb@a.com,Secret-pass-0,G1,R11\n';
    const r = await imp(t, csv);
    expect(r.status).toBe(201); expect(r.body.created).toBe(2); expect(r.body.failed.length).toBe(8);
    expect(r.body.failed.map((f) => f.row)).toEqual([4, 5, 6, 7, 8, 9, 10, 11]);
    expect(JSON.stringify(r.body)).not.toMatch(/Secret-pass/);
    const u = await User.findOne({ email: 'ravi@a.com' });
    expect(u.name).toBe('Ravi, K'); expect(u.mustChangePassword).toBe(true); expect(u.passwordHash).not.toContain('Secret'); expect(u.rollNo).toBe('R2');
    expect(await User.countDocuments()).toBe(4);
    const bad = await imp(t, 'name,email\nA,a@a.com\n'); expect(bad.status).toBe(400); expect(bad.body.help).toBe(true);
    expect((await imp(await mk('hod', 'h@a.com', 'IT'), csv)).status).toBe(403);
    const again = await imp(t, csv); expect(again.body.created).toBe(0);
    const noRoll = await imp(t, H + 'NoRoll,IT,1,1,nr@a.com,Secret-pass-1,G1,\n'); expect(noRoll.body.created).toBe(1);
    const noRoll2 = await imp(t, H + 'NoRoll2,IT,1,1,nr2@a.com,Secret-pass-1,G1,\n'); expect(noRoll2.body.created).toBe(1);
    const unreadable = await imp(t, 'hello\nworld\n'); expect(unreadable.status).toBe(400); expect(unreadable.body.help).toBe(true);
  });
  test('forced password change: blocked until changed, then works', async () => {
    const t = await mk('admin', 'ad@a.com', 'CSE');
    await imp(t, H + 'Asha,IT,2,3,asha@a.com,Secret-pass-1,G1,R1\n');
    const login = await request(app).post('/api/auth/login').send({ email: 'asha@a.com', password: 'Secret-pass-1' });
    expect(login.body.user.mustChangePassword).toBe(true);
    const tok = login.body.token, auth = (r) => r.set('Authorization', 'Bearer ' + tok);
    const blocked = await auth(request(app).get('/api/activities')); expect(blocked.status).toBe(403); expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect((await auth(request(app).get('/api/auth/me'))).status).toBe(200);
    expect((await auth(request(app).post('/api/auth/change-password')).send({ current: 'wrong-pass-1', next: 'New-pass-12345' })).status).toBe(401);
    expect((await auth(request(app).post('/api/auth/change-password')).send({ current: 'Secret-pass-1', next: 'short' })).status).toBe(400);
    expect((await auth(request(app).post('/api/auth/change-password')).send({ current: 'Secret-pass-1', next: 'Secret-pass-1' })).status).toBe(400);
    const ok = await auth(request(app).post('/api/auth/change-password')).send({ current: 'Secret-pass-1', next: 'New-pass-12345' });
    expect(ok.status).toBe(200); expect(ok.body.user.mustChangePassword).toBe(false);
    expect((await request(app).get('/api/activities').set('Authorization', 'Bearer ' + ok.body.token)).status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ email: 'asha@a.com', password: 'Secret-pass-1' })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email: 'asha@a.com', password: 'New-pass-12345' })).status).toBe(200);
  });
  test('counsellor sees and reviews only students in own batch/section/group; HOD sees whole department', async () => {
    const mkS = (email, group) => User.create({ name: email, email, passwordHash: bcrypt.hashSync('password123', 4), role: 'student', department: 'IT', year: 2, batch: '2024', section: 'A', group }).then(async () => (await request(app).post('/api/auth/login').send({ email, password: 'password123' })).body.token);
    const s1 = await mkS('s1@a.com', 'G1'), s2 = await mkS('s2@a.com', 'G2');
    const id1 = (await submit(s1, { title: 'One' })).body.activity.id, id2 = (await submit(s2, { title: 'Two' })).body.activity.id;
    await User.create({ name: 'c', email: 'c@a.com', passwordHash: bcrypt.hashSync('password123', 4), role: 'counsellor', department: 'IT', batch: '2024', section: 'A', group: 'G1' });
    const c = (await request(app).post('/api/auth/login').send({ email: 'c@a.com', password: 'password123' })).body.token, ho = await mk('hod', 'h@a.com', 'IT');
    const list = await request(app).get('/api/activities').set('Authorization', 'Bearer ' + c);
    expect(list.body.activities.map((a) => a.title)).toEqual(['One']);
    expect((await request(app).get('/api/activities/' + id2).set('Authorization', 'Bearer ' + c)).status).toBe(404);
    expect((await request(app).post(`/api/activities/${id2}/review`).set('Authorization', 'Bearer ' + c).send({ decision: 'verify' })).status).toBe(404);
    expect((await request(app).post(`/api/activities/${id1}/review`).set('Authorization', 'Bearer ' + c).send({ decision: 'verify' })).status).toBe(200);
    expect((await request(app).get('/api/activities').set('Authorization', 'Bearer ' + ho)).body.activities.length).toBe(2);
    const st = await request(app).get('/api/reports/students').set('Authorization', 'Bearer ' + c);
    expect(st.body.students.map((x) => x.name)).toEqual(['s1@a.com']);
    const H = (t) => ({ Authorization: 'Bearer ' + t });
    const an = await request(app).get('/api/reports/analytics').set(H(c));
    expect(an.body.students).toBe(1); expect(an.body.totals.verified).toBe(1); expect(an.body.byEvent[0].key).toBe('One'); expect(an.body.byCounsellor).toBeUndefined();
    const anH = await request(app).get('/api/reports/analytics').set(H(ho));
    expect(anH.body.students).toBe(2); expect(anH.body.byCounsellor.length).toBe(1); expect(anH.body.byCounsellor[0].students).toBe(1); expect(anH.body.byCounsellor[0].verified).toBe(1);
    expect((await request(app).get('/api/reports/analytics?year=3').set(H(ho))).body.students).toBe(0);
    const sl = await request(app).get('/api/reports/student-list?q=s1').set(H(c));
    expect(sl.body.students.length).toBe(1); expect(sl.body.students[0].verified).toBe(1); expect(JSON.stringify(sl.body)).not.toMatch(/passwordHash/);
    expect((await request(app).get('/api/reports/student-list?q=' + encodeURIComponent('.*')).set(H(ho))).body.students.length).toBe(0);
    const other = (await User.findOne({ email: 's2@a.com' }))._id, mine = (await User.findOne({ email: 's1@a.com' }))._id;
    expect((await request(app).get('/api/reports/student/' + other).set(H(c))).status).toBe(404);
    expect((await request(app).get('/api/reports/student/' + mine).set(H(c))).body.activities.length).toBe(1);
    expect((await request(app).get('/api/reports/student/' + other).set(H(ho))).status).toBe(200);
    expect((await request(app).get('/api/reports/analytics').set(H(s1))).status).toBe(403);
    expect((await request(app).get('/api/reports/student-list').set(H(s1))).status).toBe(403);
  });
});

describe('public sharing', () => {
  const Share = require('../src/models/Share');
  beforeEach(async () => { await Share.deleteMany({}); });
  const verified = async (st, co, title) => { const id = (await submit(st, { title })).body.activity.id; await request(app).post(`/api/activities/${id}/review`).set('Authorization', 'Bearer ' + co).send({ decision: 'verify' }); return id; };
  test('sharing is off by default; profile link shows only verified items and limited details', async () => {
    const st = await reg('s1@a.com'), co = await mk('counsellor', 'c@a.com', 'IT');
    const vId = await verified(st.token, co, 'Verified Hack'); await submit(st.token, { title: 'Pending Secret' });
    expect((await request(app).get('/api/public/' + 'x'.repeat(32))).status).toBe(404);
    const created = await request(app).post('/api/shares').set('Authorization', 'Bearer ' + st.token).send({ scope: 'profile' });
    expect(created.status).toBe(201); const tok = created.body.share.token; expect(tok.length).toBeGreaterThanOrEqual(32);
    const again = await request(app).post('/api/shares').set('Authorization', 'Bearer ' + st.token).send({ scope: 'profile' }); expect(again.body.share.token).toBe(tok);
    const pub = await request(app).get('/api/public/' + tok);
    expect(pub.status).toBe(200); expect(pub.headers['x-robots-tag']).toMatch(/noindex/); expect(pub.headers['cache-control']).toBe('no-store');
    expect(pub.body.activities.map((a) => a.title)).toEqual(['Verified Hack']);
    const text = JSON.stringify(pub.body); expect(text).not.toMatch(/Pending Secret|s1@a\.com|certificate|reviewNote|passwordHash|rollNo/);
    expect(Object.keys(pub.body.student).sort()).toEqual(['department', 'name', 'year']);
    // later change: record sent back -> drops out immediately
    await Activity.updateOne({ _id: vId }, { status: 'changes_needed' });
    expect((await request(app).get('/api/public/' + tok)).body.activities).toEqual([]);
  });
  test('single-activity link, ownership, revoke', async () => {
    const a = await reg('a@a.com'), b = await reg('b@a.com'), co = await mk('counsellor', 'c@a.com', 'IT');
    const idA = await verified(a.token, co, 'A One'); await verified(a.token, co, 'A Two'); const idPending = (await submit(a.token, { title: 'A Pending' })).body.activity.id;
    const auth = (t, r) => r.set('Authorization', 'Bearer ' + t);
    expect((await auth(b.token, request(app).post('/api/shares')).send({ scope: 'activity', activityId: idA })).status).toBe(400);
    expect((await auth(a.token, request(app).post('/api/shares')).send({ scope: 'activity', activityId: idPending })).status).toBe(400);
    const sh = await auth(a.token, request(app).post('/api/shares')).send({ scope: 'activity', activityId: idA });
    expect(sh.status).toBe(201);
    const pub = await request(app).get('/api/public/' + sh.body.share.token);
    expect(pub.body.scope).toBe('activity'); expect(pub.body.activities.map((x) => x.title)).toEqual(['A One']);
    expect((await auth(b.token, request(app).post(`/api/shares/${sh.body.share.id}/revoke`))).status).toBe(404);
    expect((await auth(a.token, request(app).post(`/api/shares/${sh.body.share.id}/revoke`))).status).toBe(200);
    expect((await request(app).get('/api/public/' + sh.body.share.token)).status).toBe(404);
    expect((await auth(a.token, request(app).get('/api/shares'))).body.shares.length).toBe(0);
    expect((await auth(co, request(app).post('/api/shares')).send({ scope: 'profile' })).status).toBe(403);
  });
});

test('login locks after 5 wrong attempts, even with the right password', async () => {
  await User.create({ name: 'L', email: 'lock@a.com', passwordHash: await bcrypt.hash('password123', 4), role: 'student', department: 'IT', year: 2 });
  for (let i = 0; i < 5; i++) expect((await request(app).post('/api/auth/login').send({ email: 'lock@a.com', password: 'bad' + i })).status).toBe(401);
  const r = await request(app).post('/api/auth/login').send({ email: 'lock@a.com', password: 'password123' });
  expect(r.status).toBe(429);
});

test('captcha: when Turnstile is configured, login needs a token verified by Cloudflare', async () => {
  await User.create({ name: 'T', email: 'cap@a.com', passwordHash: await bcrypt.hash('password123', 4), role: 'student', department: 'IT', year: 2 });
  process.env.TURNSTILE_SECRET = 'test-secret'; process.env.TURNSTILE_SITE_KEY = 'site-key';
  const real = global.fetch; let calls = 0;
  global.fetch = async (url, opt) => { calls++; return { json: async () => ({ success: String(opt.body).includes('response=good') }) }; };
  try {
    expect((await request(app).post('/api/auth/login').send({ email: 'cap@a.com', password: 'password123' })).status).toBe(400);
    expect((await request(app).post('/api/auth/login').send({ email: 'cap@a.com', password: 'password123', turnstileToken: 'bad' })).status).toBe(400);
    expect((await request(app).post('/api/auth/login').send({ email: 'cap@a.com', password: 'password123', turnstileToken: 'good' })).status).toBe(200);
    expect(calls).toBe(2);
    expect((await request(app).get('/api/auth/config')).body.turnstileSiteKey).toBe('site-key');
  } finally { global.fetch = real; delete process.env.TURNSTILE_SECRET; delete process.env.TURNSTILE_SITE_KEY; }
  expect((await request(app).get('/api/auth/config')).body.turnstileSiteKey).toBe('');
});

describe('password reset', () => {
  const crypto = require('crypto');
  const setup = async () => { await User.create({ name: 'R', email: 'r@a.com', passwordHash: await bcrypt.hash('password123', 4), role: 'student', department: 'IT', year: 2 }); };
  test('forgot: same answer for unknown email; token stored hashed; single use; expires; email never leaks', async () => {
    await setup();
    process.env.BREVO_API_KEY = 'k'; process.env.MAIL_FROM = 'from@a.com';
    const real = global.fetch; const sent = [];
    global.fetch = async (u, o) => { sent.push(JSON.parse(o.body)); return { ok: true }; };
    try {
      const a = await request(app).post('/api/auth/forgot').send({ email: 'nobody@a.com' });
      const b = await request(app).post('/api/auth/forgot').send({ email: 'r@a.com' });
      expect(a.status).toBe(200); expect(b.status).toBe(200); expect(a.body).toEqual(b.body);
      expect(sent.length).toBe(1); expect(sent[0].to[0].email).toBe('r@a.com');
      const token = sent[0].textContent.match(/reset\/([a-f0-9]{64})/)[1];
      const row = await User.findOne({ email: 'r@a.com' }).select('+resetTokenHash +resetExpires');
      expect(row.resetTokenHash).toBe(crypto.createHash('sha256').update(token).digest('hex')); expect(row.resetTokenHash).not.toBe(token);
      expect((await request(app).post('/api/auth/reset').send({ token, password: 'short' })).status).toBe(400);
      expect((await request(app).post('/api/auth/reset').send({ token, password: 'brand-new-pass' })).status).toBe(200);
      expect((await request(app).post('/api/auth/reset').send({ token, password: 'another-pass-1' })).status).toBe(400);
      expect((await request(app).post('/api/auth/login').send({ email: 'r@a.com', password: 'brand-new-pass' })).status).toBe(200);
      expect((await request(app).post('/api/auth/login').send({ email: 'r@a.com', password: 'password123' })).status).toBe(401);
      await User.updateOne({ email: 'r@a.com' }, { resetTokenHash: crypto.createHash('sha256').update('f'.repeat(64)).digest('hex'), resetExpires: new Date(Date.now() - 1000) });
      expect((await request(app).post('/api/auth/reset').send({ token: 'f'.repeat(64), password: 'brand-new-pass2' })).status).toBe(400);
    } finally { global.fetch = real; delete process.env.BREVO_API_KEY; delete process.env.MAIL_FROM; }
  });
  test('forgot does nothing when mail is not configured', async () => {
    await setup();
    const r = await request(app).post('/api/auth/forgot').send({ email: 'r@a.com' });
    expect(r.status).toBe(200); expect((await User.findOne({ email: 'r@a.com' }).select('+resetTokenHash')).resetTokenHash).toBeUndefined();
    expect((await request(app).get('/api/auth/config')).body.resetEmail).toBe(false);
  });
  test('admin sets a temporary password and can fix student details; others cannot', async () => {
    await setup(); const ad = await mk('admin', 'ad@a.com', 'IT'); const st = await mk('student', 'st@a.com', 'IT');
    const id = String((await User.findOne({ email: 'r@a.com' }))._id); const H = (t) => ({ Authorization: 'Bearer ' + t });
    expect((await request(app).post(`/api/admin/users/${id}/reset-password`).set(H(st)).send({ password: 'temp-pass-123' })).status).toBe(403);
    expect((await request(app).post(`/api/admin/users/${id}/reset-password`).set(H(ad)).send({ password: 'short' })).status).toBe(400);
    const ok = await request(app).post(`/api/admin/users/${id}/reset-password`).set(H(ad)).send({ password: 'temp-pass-123' });
    expect(ok.status).toBe(200); expect(JSON.stringify(ok.body)).not.toContain('temp-pass-123');
    const l = await request(app).post('/api/auth/login').send({ email: 'r@a.com', password: 'temp-pass-123' });
    expect(l.status).toBe(200); expect(l.body.user.mustChangePassword).toBe(true);
    const p = await request(app).patch('/api/admin/users/' + id).set(H(ad)).send({ batch: '2024', section: 'A', group: 'G1', semester: 4 });
    expect(p.status).toBe(200); expect(p.body.user.batch).toBe('2024'); expect(p.body.user.group).toBe('G1');
    expect((await request(app).patch('/api/admin/users/' + id).set(H(st)).send({ batch: 'x' })).status).toBe(403);
    expect((await request(app).patch('/api/admin/users/' + id).set(H(ad)).send({ year: 9 })).status).toBe(400);
  });
});
