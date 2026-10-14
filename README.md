# CampusTrace (SKIT021, Team Stack Ninjas)

A student participation record where **an uploaded certificate is evidence, not a verified record**. Students submit, Faculty Coordinators verify or send back with a reason, and every report counts verified records only.

Stack: React (Vite) + Node/Express + MongoDB (Mongoose) + JWT. One service serves the API and the built frontend.

## Flow
Student submits activity + certificate -> Faculty Coordinator (same department) verifies or requests changes with a reason -> Student fixes and resubmits -> Reports/CSV include verified records only.

## Roles
- student: public sign-up. Sees only their own records.
- Faculty Coordinator, Head of Department, admin: created by an admin (`POST /api/admin/users`). The first admin comes from `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars.

## Run locally
```
set env: MONGODB_URI, JWT_SECRET (16+ chars), ADMIN_EMAIL, ADMIN_PASSWORD
npm run build
npm start
```
## Tests
`npm test` (uses an in-memory MongoDB, or set `TEST_MONGO_URI`). 28 tests cover auth, role scoping, uploads, review flow, reports, sharing, CSV import, lockout and password reset.

## Deploy (Render free + MongoDB Atlas M0)
Use `render.yaml`. Set `MONGODB_URI`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`; `JWT_SECRET` is generated. Atlas: allow network access 0.0.0.0/0 and create a DB user.

## Security (what is actually tested)
Tested: no role escalation at sign-up, NoSQL operator injection rejected, token required, student cannot read another student's record/certificate, student cannot call review/admin/report endpoints, a Faculty Coordinator cannot review another department, upload type sniffed from file bytes and 2 MB limit, CSV formula cells neutralised, reports verified-only.
Implemented, not automatically tested: helmet headers/CSP, rate limiting, bcrypt hashing, JWT expiry (8h).
Not done: HTTPS is provided by the host; no email verification, no audit log. Password reset works by emailed link (Brevo) behind a captcha.
