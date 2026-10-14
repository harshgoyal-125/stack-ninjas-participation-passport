// SAMPLE DATA ONLY. Wipes all users except the admin and the 4 demo logins, deletes every activity and
// share link, then inserts clearly fictional students, activities and sample certificate PDFs.
// Run on purpose: CONFIRM=wipe-all MONGODB_URI=... node src/sample-data.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('./models/User');
const Activity = require('./models/Activity');
const Share = require('./models/Share');

const KEEP = ['admin@passport.example', 'demo.student1@campustrace.test', 'demo.student2@campustrace.test', 'demo.counsellor@campustrace.test', 'demo.hod@campustrace.test'];
let seed = 20261014; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = (a) => a[Math.floor(rnd() * a.length)];

function pdf(lines) {
  const esc = (s) => s.replace(/[()\\]/g, '');
  let t = 'BT /F1 22 Tf 60 740 Td (' + esc(lines[0]) + ') Tj ET\n';
  lines.slice(1).forEach((l, i) => { t += 'BT /F1 13 Tf 60 ' + (690 - i * 28) + ' Td (' + esc(l) + ') Tj ET\n'; });
  const o = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    '<< /Length ' + t.length + ' >>\nstream\n' + t + 'endstream', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let out = '%PDF-1.4\n'; const off = [];
  o.forEach((b, i) => { off.push(out.length); out += (i + 1) + ' 0 obj\n' + b + '\nendobj\n'; });
  const x = out.length; out += 'xref\n0 ' + (o.length + 1) + '\n0000000000 65535 f \n' + off.map((n) => String(n).padStart(10, '0') + ' 00000 n \n').join('');
  out += 'trailer\n<< /Size ' + (o.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + x + '\n%%EOF\n';
  return Buffer.from(out, 'latin1');
}

const FIRST = ['Aarav', 'Diya', 'Rohan', 'Isha', 'Kabir', 'Meera', 'Vivaan', 'Anaya', 'Arjun', 'Saanvi', 'Reyansh', 'Myra', 'Ishaan', 'Kiara', 'Aditya', 'Tara', 'Dev', 'Naina', 'Yuvan', 'Riya', 'Neel', 'Pari'];
const LAST = ['Sharma', 'Verma', 'Mehta', 'Singh', 'Gupta', 'Nair', 'Rao', 'Iyer', 'Joshi', 'Kapoor', 'Bose', 'Reddy', 'Malhotra', 'Chopra'];
// batch, section, group, year, semester, how many
const COHORTS = [['2024', 'A', 'G1', 3, 5, 5], ['2024', 'A', 'G2', 3, 5, 4], ['2024', 'B', 'G1', 3, 5, 3], ['2023', 'A', 'G1', 4, 7, 4], ['2025', 'A', 'G1', 2, 3, 4]];
const EVENTS = {
  Hackathon: [['Smart India Hackathon (sample)', 'Ministry of Education'], ['CodeSprint 24h (sample)', 'Tech Club'], ['HackRajasthan (sample)', 'State IT Dept'], ['Build for Bharat (sample)', 'Open Source Society']],
  Workshop: [['Cloud Fundamentals Workshop (sample)', 'Cloud Study Jams'], ['Git and GitHub Bootcamp (sample)', 'Coding Club'], ['IoT with Arduino (sample)', 'Robotics Cell'], ['Intro to Machine Learning (sample)', 'Data Science Club']],
  Seminar: [['Cyber Security Awareness (sample)', 'Cyber Cell'], ['Future of AI in Industry (sample)', 'Industry Forum'], ['Careers in Product Roles (sample)', 'Placement Cell']],
  Sports: [['Inter-College Cricket Cup (sample)', 'Sports Council'], ['Annual Athletics Meet (sample)', 'Sports Council'], ['Badminton Open (sample)', 'Indoor Games Club']],
  Cultural: [['Annual Fest Dance Night (sample)', 'Cultural Committee'], ['Battle of Bands (sample)', 'Music Society'], ['Street Play Contest (sample)', 'Drama Club']],
  Competition: [['Inter-College Quiz (sample)', 'Quiz Club'], ['Coding Contest Round 2 (sample)', 'Competitive Programming Club'], ['Paper Presentation (sample)', 'IEEE Student Branch']],
  Other: [['Blood Donation Camp Volunteer (sample)', 'NSS Unit'], ['Tree Plantation Drive (sample)', 'Eco Club']],
};
const NOTES = ['Certificate is unclear. Please upload a sharper copy.', 'Event date on the certificate does not match the date entered.', 'Name on the certificate does not match the student profile.', 'Organizer is missing on the certificate. Please re-upload the full page.'];
const DESC = ['Took part as an individual participant.', 'Part of a team of four. We built and presented a working prototype.', 'Attended all sessions and completed the hands-on task.', 'Represented the department.', 'Volunteered at the event for two days.'];

(async () => {
  if (process.env.CONFIRM !== 'wipe-all') throw new Error('Set CONFIRM=wipe-all to run');
  await mongoose.connect(process.env.MONGODB_URI);
  const keep = await User.find({ email: { $in: KEEP } });
  if (keep.length !== KEEP.length) throw new Error('Expected 5 kept accounts, found ' + keep.length);
  const del = await User.deleteMany({ email: { $nin: KEEP } });
  const da = await Activity.deleteMany({}); const ds = await Share.deleteMany({});
  console.log('deleted users', del.deletedCount, 'activities', da.deletedCount, 'shares', ds.deletedCount);
  const by = (e) => keep.find((u) => u.email === e);
  const counsellor = by('demo.counsellor@campustrace.test'), hod = by('demo.hod@campustrace.test');
  const unusable = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
  const students = [by('demo.student1@campustrace.test'), by('demo.student2@campustrace.test')];
  let n = 0; const used = new Set();
  for (const [batch, section, group, year, semester, count] of COHORTS) for (let i = 0; i < count; i++) {
    let name; do { name = pick(FIRST) + ' ' + pick(LAST); } while (used.has(name)); used.add(name); n++;
    const email = name.toLowerCase().replace(' ', '.') + '@campustrace.test';
    students.push(await User.create({ name, email, passwordHash: unusable, role: 'student', department: 'IT', year, semester, rollNo: batch.slice(2) + 'IT' + String(100 + n), batch, section, group, demo: true, mustChangePassword: true }));
  }
  const start = new Date('2025-11-03').getTime(), end = new Date('2026-10-10').getTime();
  let made = 0; const tally = { submitted: 0, verified: 0, changes_needed: 0 };
  for (const s of students) {
    const k = 2 + Math.floor(rnd() * 4);
    for (let j = 0; j < k; j++) {
      const type = pick(Object.keys(EVENTS)); const [title, organizer] = pick(EVENTS[type]);
      const date = new Date(start + rnd() * (end - start));
      const r = rnd(); const status = r < 0.55 ? 'verified' : r < 0.8 ? 'submitted' : 'changes_needed';
      const inScope = s.batch === counsellor.batch && s.section === counsellor.section && s.group === counsellor.group;
      const reviewer = inScope ? counsellor : hod;
      const reviewedAt = new Date(date.getTime() + (2 + Math.floor(rnd() * 6)) * 86400000);
      const data = pdf(['SAMPLE CERTIFICATE - DEMO DATA', 'This file is not a real certificate.', 'Awarded to: ' + s.name, 'For: ' + title, 'Organized by: ' + organizer, 'Date: ' + date.toISOString().slice(0, 10)]);
      await Activity.create({ student: s._id, department: s.department, title, type, organizer, date, description: pick(DESC), status,
        reviewNote: status === 'changes_needed' ? pick(NOTES) : '', reviewedBy: status === 'submitted' ? undefined : reviewer._id, reviewedAt: status === 'submitted' ? undefined : reviewedAt,
        createdAt: new Date(date.getTime() + 86400000), certificate: { filename: 'sample-certificate.pdf', mime: 'application/pdf', size: data.length, data } });
      made++; tally[status]++;
    }
  }
  console.log('students', students.length, 'activities', made, JSON.stringify(tally));
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
