import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api, setToken, hasToken, openBlob } from './api.js';

const DEPTS = ['CSE', 'IT', 'ECE', 'EE', 'ME', 'CE'];
const TYPES = ['Hackathon', 'Workshop', 'Seminar', 'Sports', 'Cultural', 'Competition', 'Other'];
const STATUS = { submitted: ['Active', '⏳'], verified: ['Successful', '✓'], changes_needed: ['Failed', '!'] };
const fmt = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function Mark({ size = 40 }) {
  const id = React.useId().replace(/:/g, '');
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="CampusTrace logo" focusable="false">
      <defs><linearGradient id={'g' + id} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#4F46E5" /><stop offset=".55" stopColor="#6366F1" /><stop offset="1" stopColor="#22D3EE" /></linearGradient></defs>
      <rect width="64" height="64" rx="16" fill={'url(#g' + id + ')'} />
      <path d="M32 13 55 25 32 37 9 25Z" fill="#fff" />
      <path d="M19 31v9c0 4 6.2 7 13 7s13-3 13-7v-9l-13 6.5Z" fill="#fff" opacity=".88" />
      <path d="M55 25v13" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" /><circle cx="55" cy="40.5" r="2.6" fill="#fff" />
      <circle cx="47" cy="47" r="9.5" fill="#0B0F19" stroke="#22D3EE" strokeWidth="2" /><path d="m42.6 47.2 3.2 3.2 5.8-6.4" fill="none" stroke="#22D3EE" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function Logo({ size = 40, text = true }) { return <span className="logo"><Mark size={size} />{text && <span className="wordmark">Campus<b>Trace</b></span>}</span>; }

function Badge({ s }) { const [t, i] = STATUS[s]; return <span className={'badge ' + s}><b aria-hidden="true">{i}</b> {t}</span>; }
function PwInput(props) {
  const [show, setShow] = useState(false);
  return (
    <span className="pw-wrap">
      <input {...props} type={show ? 'text' : 'password'} />
      <button type="button" className="pw-eye" aria-pressed={show} aria-label={show ? 'Hide password' : 'Show password'} title={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
    </span>
  );
}
function ThemeToggle() {
  const [t, setT] = useState(document.documentElement.dataset.theme || 'light');
  function flip() { const h = document.documentElement; h.classList.add('theme-fade'); setTimeout(() => h.classList.remove('theme-fade'), 500); const n = t === 'light' ? 'dark' : 'light'; document.documentElement.dataset.theme = n; try { localStorage.setItem('pp_theme', n); } catch (e) { /* private mode */ } setT(n); }
  return <button type="button" className="theme-toggle" onClick={flip} aria-pressed={t === 'dark'} aria-label={t === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}>{t === 'light' ? '☾ Dark' : '☀ Light'}</button>;
}
function Err({ e }) { return e ? <p className="err" role="alert">{e}</p> : null; }

function Auth({ onAuth, onBack }) {
  const [f, setF] = useState({}); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const [site, setSite] = useState(''); const [mail, setMail] = useState(false); const [forgot, setForgot] = useState(false); const [tok, setTok] = useState(''); const box = React.useRef(null); const wid = React.useRef(null);
  useEffect(() => { api('/auth/config').then((c) => { setSite(c.turnstileSiteKey || ''); setMail(!!c.resetEmail); }).catch(() => {}); }, []);
  useEffect(() => {
    if (!site) return;
    const mount = () => { if (window.turnstile && box.current && wid.current === null) wid.current = window.turnstile.render(box.current, { sitekey: site, theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light', callback: setTok, 'expired-callback': () => setTok(''), 'error-callback': () => setTok('') }); };
    if (window.turnstile) mount(); else { const sc = document.createElement('script'); sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; sc.async = true; sc.onload = mount; document.head.appendChild(sc); }
  }, [site]);
  async function go(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const r = await api('/auth/login', { method: 'POST', body: { ...f, turnstileToken: tok } }); setToken(r.token); onAuth(r.user); } catch (x) { setErr(x.message); if (window.turnstile && wid.current !== null) { window.turnstile.reset(wid.current); setTok(''); } } finally { setBusy(false); }
  }
  if (forgot) return <Forgot mail={mail} site={site} onBack={() => setForgot(false)} />;
  return (
    <main className="center split">
      <aside className="auth-art" aria-hidden="true">
        <div className="hex"><Mark size={92} /></div>
        <div className="mile m1"><b>Active</b><span>Waiting for your counsellor</span><i><u style={{ width: '45%' }} /></i></div>
        <div className="mile m2"><b>Successful</b><span>Checked and verified</span><i><u style={{ width: '90%' }} /></i></div>
        <h2>Every activity.<br />One verified record.</h2>
        <p>A certificate becomes part of your record only after your college checks it.</p>
      </aside>
      <form className="card auth" onSubmit={go}>
        <div className="auth-logo"><Mark size={64} /><h1 className="wordmark big">Campus<b>Trace</b></h1></div>
        <p className="muted">Log in to your verified participation record.</p>
        <label>Email<input type="email" required autoComplete="email" onChange={set('email')} /></label>
        <label>Password<PwInput required autoComplete="current-password" onChange={set('password')} /></label>
        {site && <div ref={box} className="cf" />}
        <Err e={err} />
        <button className="btn" disabled={busy || (!!site && !tok)}>Log in</button>
        <button type="button" className="link" onClick={() => setForgot(true)}>Forgot password?</button>
        <p className="muted small" style={{ textAlign: "center" }}>Accounts are created by your college administrator.</p>
        {onBack && <button type="button" className="link" onClick={onBack}>← Back to home</button>}
      </form>
    </main>
  );
}

function ActivityForm({ initial, onDone, onCancel }) {
  const [f, setF] = useState(initial ? { title: initial.title, type: initial.type, organizer: initial.organizer, description: initial.description, date: initial.date.slice(0, 10) } : { type: 'Hackathon' });
  const [file, setFile] = useState(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function go(e) {
    e.preventDefault(); setErr('');
    if (!initial && !file) return setErr('Attach your certificate (PDF, PNG or JPG, max 2 MB)');
    if (file && file.size > 2 * 1024 * 1024) return setErr('File is larger than 2 MB');
    const form = new FormData(); Object.entries(f).forEach(([k, v]) => v != null && form.append(k, v)); if (file) form.append('certificate', file);
    setBusy(true);
    try { await api(initial ? '/activities/' + initial.id : '/activities', { method: initial ? 'PUT' : 'POST', form }); onDone(); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  }
  return (
    <form className="glass form" onSubmit={go}>
      <h2>{initial ? 'Fix and resubmit' : 'Add participation'}</h2>
      <label>Activity title<input required maxLength={120} value={f.title || ''} onChange={set('title')} /></label>
      <div className="row">
        <label>Type<select value={f.type} onChange={set('type')}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label>Date<input type="date" required max={new Date().toISOString().slice(0, 10)} value={f.date || ''} onChange={set('date')} /></label>
      </div>
      <label>Organizer<input maxLength={120} value={f.organizer || ''} onChange={set('organizer')} /></label>
      <label>Notes (optional)<textarea maxLength={600} rows={2} value={f.description || ''} onChange={set('description')} /></label>
      <label>Certificate {initial && '(leave empty to keep current)'}<input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => setFile(e.target.files[0])} /></label>
      <p className="muted small">PDF, PNG or JPG, up to 2 MB. A reviewer checks it before it counts.</p>
      <Err e={err} />
      <div className="row"><button className="btn" disabled={busy}>{initial ? 'Resubmit' : 'Submit for review'}</button><button type="button" className="ghost" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}


function Splash({ onDone }) {
  useEffect(() => { const t = setTimeout(onDone, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 700 : 3000); return () => clearTimeout(t); }, []);
  return (
    <div className="intro" role="status" aria-label="CampusTrace loading" onClick={onDone}>
      <div className="intro-in">
        <div className="intro-tile"><Mark size={132} /><i className="shine" aria-hidden="true" /><i className="spark s1" aria-hidden="true" /><i className="spark s2" aria-hidden="true" /><i className="spark s3" aria-hidden="true" /></div>
        <h1 className="intro-word">Campus<b>Trace</b></h1>
        <p className="intro-tag">Learn <span aria-hidden="true">•</span> Verify <span aria-hidden="true">•</span> Grow</p>
        <span className="intro-bar" aria-hidden="true" />
      </div>
    </div>
  );
}

function Landing({ onLogin }) {
  const steps = [['01', 'Submit', 'A student adds an activity and uploads the certificate as proof.', 'Active', 'submitted'], ['02', 'Review', 'The batch counsellor checks it, then verifies it or sends it back with a reason.', 'Under review', 'submitted'], ['03', 'Report', 'Reports and CSV exports count verified activities only.', 'Successful', 'verified']];
  const who = [['Students', 'Upload certificates, follow each status, and share a link or QR to your verified items only.'], ['Counsellors', 'Review the students in your batch, section and group, with their certificates beside each record.'], ['HODs', 'See department-wide verified participation, a per-counsellor breakdown and every student list. Read-only.'], ['Admins', 'Create accounts one by one or from a CSV, set roles and groups, and remove accounts made by mistake.']];
  return (
    <div className="landing">
      <header className="top"><Logo size={36} /><div className="navlinks"><button className="btn outline small" onClick={onLogin}>Login</button></div></header>
      <main className="lp">
        <section className="lp-hero">
          <div className="lp-copy">
            <span className="pill-badge">Student participation platform</span>
            <h1>Every activity.<em>One verified record.</em></h1>
            <p className="lead">An uploaded certificate is evidence, not a verified record. CampusTrace gets every activity checked by your college before it counts.</p>
            <div className="row"><button className="btn big" onClick={onLogin}>Get started</button><a className="ghost big" href="#how">See how it works</a></div>
            <p className="muted small">Accounts are created by your college administrator.</p>
          </div>
          <div className="lp-visual" aria-hidden="true">
            <div className="orb" />
            <div className="vcard"><Mark size={96} /><div className="vword">Campus<b>Trace</b></div><div className="vtag">Learn • Verify • Grow</div></div>
            <span className="fchip c1"><i /> Successful</span><span className="fchip c2"><i /> Active</span><span className="fchip c3"><i /> Failed</span>
          </div>
        </section>
        <section id="how" className="lp-sec"><p className="eyebrow">How it works</p><h2>From certificate to verified record in three steps</h2>
          <div className="grid3">{steps.map(([n, t, d, c, k]) => <article key={n} className="card step"><span className="stepno">{n}</span><h3>{t}</h3><p className="muted">{d}</p><span className={'badge ' + k}>{c}</span></article>)}</div></section>
        <section className="lp-sec"><p className="eyebrow">Who it is for</p><h2>One platform, four roles</h2>
          <div className="grid4">{who.map(([t, d]) => <article key={t} className="card role"><h3>{t}</h3><p className="muted">{d}</p></article>)}</div></section>
        <section className="lp-sec"><p className="eyebrow">Status words</p><h2>Every record is always in one of three states</h2>
          <div className="grid3">
            <div className="card state ok"><b>Successful</b><span>Verified by a counsellor. Counted in reports.</span></div>
            <div className="card state mid"><b>Active</b><span>Submitted and waiting for review. Not counted yet.</span></div>
            <div className="card state bad"><b>Failed</b><span>Sent back with a reason. Update the proof and resubmit.</span></div>
          </div></section>
        <section className="card cta"><div><h2>Ready to see your record?</h2><p className="muted">Log in with the account your administrator created.</p></div><button className="btn big" onClick={onLogin}>Login</button></section>
        <footer className="foot">CampusTrace · Team Stack Ninjas · IEEE IGNITE SKIT021</footer>
      </main>
    </div>
  );
}

function Student({ user }) {
  const [list, setList] = useState([]); const [rep, setRep] = useState(null); const [form, setForm] = useState(null); const [tab, setTab] = useState('activities'); const [group, setGroup] = useState('All'); const [err, setErr] = useState('');
  const load = () => Promise.all([api('/activities'), api('/reports/me')]).then(([a, r]) => { setList(a.activities); setRep(r); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  if (form) return <ActivityForm initial={form === 'new' ? null : form} onDone={() => { setForm(null); load(); }} onCancel={() => setForm(null)} />;
  const GROUP = { Hackathon: 'Technical', Workshop: 'Technical', Seminar: 'Technical', Competition: 'Technical', Cultural: 'Cultural', Sports: 'Sports', Other: 'Technical' };
  const ICON = { Technical: '/img/tech.jpg', Cultural: '/img/art.jpg', Sports: '/img/sport.jpg' };
  const shown = list.filter((a) => group === 'All' || GROUP[a.type] === group);
  const n = (st) => list.filter((a) => a.status === st).length;
  return (
    <>
      <section className="glass hero">
        <div>
          <p className="eyebrow">Your participation record</p>
          <p className="who">{user.name} · {user.department} · Year {user.year}</p>
          <h2>Hello, {user.name.split(" ")[0]}.<em>Your record, verified.</em></h2>
          <p className="lead">Add activities with certificates, follow their review status, and share only what is verified.</p>
          <div className="row"><button className="btn" onClick={() => setForm('new')}>+ Add participation</button><button className="ghost" onClick={() => setTab('report')}>Verified record</button></div>
        </div>
        <div className="art" aria-hidden="true"><Mark size={120} /></div>
      </section>
      <section className="glass stats" aria-label="Your activity counts">
        <div className="v"><b>{rep ? rep.verifiedCount : '–'}</b><span>✓ Successful</span></div>
        <div className="r"><b>{n('submitted')}</b><span>⏳ Active</span></div>
        <div className="c"><b>{n('changes_needed')}</b><span>! Failed</span></div>
      </section>
      <Sharing />
      <div className="sechead"><h2>Your activity trail</h2>
        <div className="chips" role="group" aria-label="Filter">{['All', 'Technical', 'Cultural', 'Sports'].map((g) => <button key={g} aria-pressed={group === g} onClick={() => { setGroup(g); setTab('activities'); }}>{g}</button>)}</div></div>
      <Err e={err} />
      {tab === 'activities' && (shown.length === 0 ? <p className="empty glass">No activities here yet. Add one with its certificate.</p> : <div className="grid">{shown.map((a) => (
        <article key={a.id} className="glass card acard">
          <img className="icon" src={ICON[GROUP[a.type]]} alt="" aria-hidden="true" />
          <h3>{a.title}</h3>
          <p className="muted">{a.type} · {fmt(a.date)}{a.organizer && ' · ' + a.organizer}</p>
          <Badge s={a.status} />
          {a.status === 'changes_needed' && <p className="note"><b>Reviewer note:</b> {a.reviewNote}</p>}
          <div className="row">
            <button className="ghost" onClick={() => openBlob(`/activities/${a.id}/certificate`)}>View certificate</button>
            {a.status === 'changes_needed' && <button className="btn small" onClick={() => setForm(a)}>Update evidence</button>}
          </div>
        </article>))}</div>)}
      {tab === 'report' && rep && (
        <section className="glass card">
          <h3>Verified record</h3>
          {rep.activities.length === 0 ? <p className="muted">Nothing verified yet.</p> : <table><thead><tr><th>Activity</th><th>Type</th><th>Date</th></tr></thead><tbody>{rep.activities.map((a) => <tr key={a.id}><td>{a.title}</td><td>{a.type}</td><td>{fmt(a.date)}</td></tr>)}</tbody></table>}
          <button className="ghost" onClick={() => window.print()}>Print or save as PDF</button>
        </section>)}
      <section className="glass banner"><div><h2>Your verified record</h2><p className="muted">See and print everything that has been verified.</p></div><button className="btn" onClick={() => { setTab('report'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>View verified record</button></section>
    </>
  );
}

function Review({ user }) {
  const [list, setList] = useState([]); const [filter, setFilter] = useState('submitted'); const [err, setErr] = useState(''); const [note, setNote] = useState({});
  const load = () => api('/activities?status=' + filter).then((r) => setList(r.activities)).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [filter]);
  async function decide(id, decision) {
    setErr('');
    try { await api(`/activities/${id}/review`, { method: 'POST', body: { decision, note: note[id] || '' } }); load(); } catch (x) { setErr(x.message); }
  }
  return (
    <>
      <h2>Review inbox · {user.department}</h2>
      <nav className="tabs">{[['submitted', 'To review'], ['changes_needed', 'Sent back'], ['verified', 'Verified']].map(([k, l]) => <button key={k} aria-selected={filter === k} onClick={() => setFilter(k)}>{l}</button>)}</nav>
      <Err e={err} />
      {list.length === 0 && <p className="empty glass">Nothing here.</p>}
      {list.map((a) => (
        <article key={a.id} className="glass card">
          <div className="between"><h3>{a.title}</h3><Badge s={a.status} /></div>
          <p className="muted">{a.student && a.student.name} (Year {a.student && a.student.year}) · {a.type} · {fmt(a.date)}{a.organizer && ' · ' + a.organizer}</p>
          {a.description && <p>{a.description}</p>}
          <button className="ghost" onClick={() => openBlob(`/activities/${a.id}/certificate`)}>Open certificate</button>
          {a.status !== 'verified' && <>
            <label>Reason (required to request changes)<input maxLength={400} value={note[a.id] || ''} onChange={(e) => setNote({ ...note, [a.id]: e.target.value })} /></label>
            <div className="row"><button className="btn small" onClick={() => decide(a.id, 'verify')}>Verify</button><button className="ghost" onClick={() => decide(a.id, 'changes_needed')}>Request changes</button></div>
          </>}
        </article>))}
    </>
  );
}

function Bars({ title, rows, empty }) {
  const max = Math.max(1, ...rows.map((x) => x.count));
  return (
    <section className="glass card chart"><h3>{title}</h3>
      {rows.length === 0 && <p className="muted">{empty || 'No verified records yet.'}</p>}
      {rows.map((x) => <div key={x.key} className="bar"><span title={x.key}>{x.key}</span><i style={{ width: (x.count / max) * 100 + '%' }} /><b>{x.count}</b></div>)}
    </section>
  );
}
function MonthChart({ rows }) {
  const max = Math.max(1, ...rows.map((x) => x.count));
  const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return (
    <section className="glass card chart"><h3>By month</h3>
      {rows.length === 0 ? <p className="muted">No verified records yet.</p> :
        <div className="cols" role="img" aria-label={'Verified activities per month: ' + rows.map((x) => x.key + ' ' + x.count).join(', ')}>
          {rows.map((x) => <div key={x.key} className="col"><b>{x.count}</b><i style={{ height: (x.count / max) * 100 + '%' }} /><span>{MN[+x.key.slice(5) - 1]} {x.key.slice(2, 4)}</span></div>)}
        </div>}
    </section>
  );
}
function StudentDetail({ id, onBack }) {
  const [d, setD] = useState(null); const [err, setErr] = useState('');
  useEffect(() => { api('/reports/student/' + id).then(setD).catch((e) => setErr(e.message)); }, [id]);
  if (!d) return <><button className="link" onClick={onBack}>Back to list</button><Err e={err} /></>;
  const s = d.student;
  return (
    <>
      <button className="link" onClick={onBack}>Back to list</button>
      <section className="glass card"><h3>{s.name}</h3>
        <p className="muted">{s.email} · {s.department}{s.year ? ' · Year ' + s.year : ''}{s.semester ? ' · Sem ' + s.semester : ''}{s.rollNo ? ' · Roll ' + s.rollNo : ''}{s.batch ? ' · Batch ' + s.batch : ''}{s.section ? ' · Sec ' + s.section : ''}{s.group ? ' · Grp ' + s.group : ''}</p>
        {d.activities.length === 0 && <p className="muted">No activities yet.</p>}
        {d.activities.map((a) => <div key={a.id} className="srow"><div><b>{a.title}</b><p className="muted">{a.type} · {new Date(a.date).toLocaleDateString()}{a.organizer ? ' · ' + a.organizer : ''}</p>{a.reviewNote && <p className="muted">Note: {a.reviewNote}</p>}</div><Badge s={a.status} /></div>)}
      </section>
    </>
  );
}
function Reports({ user }) {
  const [an, setAn] = useState(null); const [st, setSt] = useState([]); const [err, setErr] = useState('');
  const [year, setYear] = useState(''); const [sem, setSem] = useState(''); const [q, setQ] = useState(''); const [open, setOpen] = useState(null);
  const qs = (extra) => '?' + new URLSearchParams({ ...(year && { year }), ...(sem && { semester: sem }), ...extra }).toString();
  useEffect(() => { setErr(''); Promise.all([api('/reports/analytics' + qs({})), api('/reports/student-list' + qs(q ? { q } : {}))]).then(([a, b]) => { setAn(a); setSt(b.students); }).catch((e) => setErr(e.message)); }, [year, sem, q]);
  if (open) return <StudentDetail id={open} onBack={() => setOpen(null)} />;
  if (!an) return <Err e={err} />;
  const t = an.totals;
  return (
    <>
      <h2>Verified participation report</h2>
      <p className="muted">Charts count verified records only. {t.inReview} in review and {t.changesNeeded} needing changes are not included.</p>
      <div className="glass filters">
        <label>Year<select value={year} onChange={(e) => setYear(e.target.value)}><option value="">All</option>{[1, 2, 3, 4].map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
        <label>Semester<select value={sem} onChange={(e) => setSem(e.target.value)}><option value="">All</option>{[1, 2, 3, 4, 5, 6, 7, 8].map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
        <label className="grow">Find student<input value={q} placeholder="Name, email or roll number" onChange={(e) => setQ(e.target.value)} /></label>
      </div>
      <div className="kpis"><div className="glass kpi"><b>{an.students}</b><span>Students</span></div><div className="glass kpi"><b>{t.verified}</b><span>Verified</span></div><div className="glass kpi"><b>{t.inReview}</b><span>In review</span></div><div className="glass kpi"><b>{t.changesNeeded}</b><span>Changes needed</span></div></div>
      <div className="charts"><Bars title="By year" rows={an.byYear} /><Bars title="By type" rows={an.byType} /><MonthChart rows={an.byMonth} /><Bars title="By event name (top 10)" rows={an.byEvent} /></div>
      {an.byCounsellor && <section className="glass card"><h3>By counsellor</h3>
        {an.byCounsellor.length === 0 && <p className="muted">No counsellors yet.</p>}
        <div className="tbl">{an.byCounsellor.map((c) => <div key={c.email} className="srow"><div><b>{c.name}</b><p className="muted">{c.department}{c.batch ? ' · Batch ' + c.batch : ''}{c.section ? ' · Sec ' + c.section : ''}{c.group ? ' · Grp ' + c.group : ''}</p></div><span><b>{c.verified}</b> verified · {c.students} students</span></div>)}</div></section>}
      <section className="glass card"><h3>Students ({st.length})</h3>
        {st.length === 0 && <p className="muted">No students match.</p>}
        <div className="tbl">{st.map((x) => <button key={x.id} className="srow rowbtn" onClick={() => setOpen(x.id)}><div><b>{x.name}</b><p className="muted">{x.department}{x.year ? ' · Y' + x.year : ''}{x.semester ? ' · S' + x.semester : ''}{x.rollNo ? ' · ' + x.rollNo : ''}</p></div><span><b>{x.verified}</b> verified · {x.inReview} review · {x.changesNeeded} changes</span></button>)}</div></section>
      <button className="btn" onClick={() => openBlob('/reports/export.csv', 'verified-participation.csv')}>Download CSV (opens in Excel)</button>
      {user.role === 'admin' && <AdminUsers />}
    </>
  );
}

function AdminUsers() {
  const blank = { role: 'student', department: 'IT', year: 1 };
  const [f, setF] = useState(blank); const [msg, setMsg] = useState(''); const [err, setErr] = useState(''); const [users, setUsers] = useState([]); const [del, setDel] = useState(null); const [edit, setEdit] = useState(null); const [rst, setRst] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const load = () => api('/admin/users').then((r) => setUsers(r.users)).catch((x) => setErr(x.message));
  useEffect(() => { load(); }, []);
  async function go(e) { e.preventDefault(); setErr(''); setMsg(''); try { const r = await api('/admin/users', { method: 'POST', body: f }); setMsg('Created ' + r.user.role + ': ' + r.user.email); setF(blank); e.target.reset(); load(); } catch (x) { setErr(x.message); } }
  async function remove() { const u = del; setDel(null); setErr(''); setMsg(''); try { const r = await api('/admin/users/' + u.id, { method: 'DELETE' }); setMsg('Deleted ' + u.email + (r.activitiesRemoved ? ' and ' + r.activitiesRemoved + ' record(s)' : '')); load(); } catch (x) { setErr(x.message); } }
  const stu = f.role === 'student', cou = f.role === 'counsellor';
  return (
    <>
      <form className="glass form" onSubmit={go}>
        <h3>Create account</h3>
        <label>Name<input required onChange={set('name')} /></label>
        <label>Email<input type="email" required onChange={set('email')} /></label>
        <label>Temporary password (8+)<PwInput minLength={8} required onChange={set('password')} /></label>
        <div className="row"><label>Role<select value={f.role} onChange={set('role')}>{['student', 'counsellor', 'hod', 'faculty', 'admin'].map((r) => <option key={r}>{r}</option>)}</select></label>
          <label>Department<select value={f.department} onChange={set('department')}>{DEPTS.map((d) => <option key={d}>{d}</option>)}</select></label></div>
        {stu && <div className="row"><label>Year<select value={f.year} onChange={set('year')}>{[1, 2, 3, 4].map((y) => <option key={y}>{y}</option>)}</select></label><label>Roll number<input onChange={set('rollNo')} /></label></div>}
        {(stu || cou) && <div className="row"><label>Batch<input onChange={set('batch')} /></label><label>Section<input onChange={set('section')} /></label><label>Group<input onChange={set('group')} /></label></div>}
        <Err e={err} />{msg && <p className="ok" role="status">{msg}</p>}
        <button className="btn">Create</button>
      </form>
      <CsvImport onDone={load} />
      <section className="glass card"><h3>All users ({users.length})</h3>
        <div style={{ overflowX: 'auto' }}><table><thead><tr><th>Name</th><th>Role</th><th>Dept</th><th>Details</th><th></th></tr></thead><tbody>
          {users.map((u) => <tr key={u.id}><td>{u.name}<br /><span className="muted small">{u.email}</span></td><td>{u.role}{u.demo ? ' (demo)' : ''}</td><td>{u.department}</td>
            <td className="small">{[u.year && 'Y' + u.year, u.semester && 'Sem ' + u.semester, u.rollNo, u.batch, u.section, u.group].filter(Boolean).join(' · ')}</td>
            <td className="actions"><button className="ghost" onClick={() => setEdit(u)} aria-label={'Edit ' + u.email}>Edit</button><button className="ghost" onClick={() => setRst(u)} aria-label={'Reset password for ' + u.email}>Reset password</button><button className="ghost" onClick={() => setDel(u)} aria-label={'Delete ' + u.email}>Delete</button></td></tr>)}
        </tbody></table></div>
      </section>
      {del && <ConfirmDelete u={del} onCancel={() => setDel(null)} onConfirm={remove} />}
      {edit && <EditUser u={edit} onCancel={() => setEdit(null)} onDone={(m) => { setEdit(null); setMsg(m); load(); }} />}
      {rst && <ResetPw u={rst} onCancel={() => setRst(null)} onDone={(m) => { setRst(null); setMsg(m); }} />}
    </>
  );
}

function EditUser({ u, onCancel, onDone }) {
  const [f, setF] = useState({ name: u.name, department: u.department, year: u.year || '', semester: u.semester || '', batch: u.batch || '', section: u.section || '', group: u.group || '' }); const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function go(e) { e.preventDefault(); setErr(''); try { await api('/admin/users/' + u.id, { method: 'PATCH', body: f }); onDone('Updated ' + u.email); } catch (x) { setErr(x.message); } }
  return (
    <div className="overlay" onClick={onCancel}>
      <form className="dialog glass" role="dialog" aria-modal="true" aria-labelledby="ed-t" onClick={(e) => e.stopPropagation()} onSubmit={go}>
        <h2 id="ed-t">Edit {u.email}</h2>
        <label>Name<input required value={f.name} onChange={set('name')} /></label>
        <div className="row"><label>Department<select value={f.department} onChange={set('department')}>{DEPTS.map((d) => <option key={d}>{d}</option>)}</select></label>
          {u.role === 'student' && <><label>Year<select value={f.year} onChange={set('year')}><option value="">-</option>{[1, 2, 3, 4].map((y) => <option key={y}>{y}</option>)}</select></label><label>Semester<select value={f.semester} onChange={set('semester')}><option value="">-</option>{[1, 2, 3, 4, 5, 6, 7, 8].map((y) => <option key={y}>{y}</option>)}</select></label></>}</div>
        {(u.role === 'student' || u.role === 'counsellor') && <div className="row"><label>Batch<input value={f.batch} onChange={set('batch')} /></label><label>Section<input value={f.section} onChange={set('section')} /></label><label>Group<input value={f.group} onChange={set('group')} /></label></div>}
        <Err e={err} />
        <div className="row"><button type="button" className="ghost" onClick={onCancel}>Cancel</button><button className="btn">Save</button></div>
      </form>
    </div>
  );
}
function ResetPw({ u, onCancel, onDone }) {
  const [pw, setPw] = useState(''); const [err, setErr] = useState('');
  async function go(e) { e.preventDefault(); setErr(''); try { await api('/admin/users/' + u.id + '/reset-password', { method: 'POST', body: { password: pw } }); onDone('Temporary password set for ' + u.email + (u.demo ? '.' : '. They must change it at next login.')); } catch (x) { setErr(x.message); } }
  return (
    <div className="overlay" onClick={onCancel}>
      <form className="dialog glass" role="dialog" aria-modal="true" aria-labelledby="rp-t" onClick={(e) => e.stopPropagation()} onSubmit={go}>
        <h2 id="rp-t">Reset password</h2>
        <p className="muted">Set a temporary password for {u.name} ({u.email}). Share it with them privately.</p>
        <label>Temporary password (8+)<PwInput required minLength={8} maxLength={72} autoComplete="new-password" onChange={(e) => setPw(e.target.value)} /></label>
        <Err e={err} />
        <div className="row"><button type="button" className="ghost" onClick={onCancel}>Cancel</button><button className="btn">Set password</button></div>
      </form>
    </div>
  );
}
function Forgot({ onBack, mail, site }) {
  const [tok, setTok] = useState(''); const box = React.useRef(null); const wid = React.useRef(null);
  useEffect(() => {
    if (!site || !mail) return;
    const mount = () => { if (window.turnstile && box.current && wid.current === null) wid.current = window.turnstile.render(box.current, { sitekey: site, theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light', callback: setTok, 'expired-callback': () => setTok(''), 'error-callback': () => setTok('') }); };
    if (window.turnstile) mount(); else { const sc = document.createElement('script'); sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; sc.async = true; sc.onload = mount; document.head.appendChild(sc); }
  }, [site, mail]);
  const [email, setEmail] = useState(''); const [msg, setMsg] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  async function go(e) { e.preventDefault(); setErr(''); setBusy(true); try { const r = await api('/auth/forgot', { method: 'POST', body: { email, turnstileToken: tok } }); setMsg(r.message); } catch (x) { setErr(x.message); } finally { setBusy(false); if (window.turnstile && wid.current !== null) { window.turnstile.reset(wid.current); setTok(''); } } }
  return (
    <main className="center"><form className="card auth" onSubmit={go}>
      <div className="auth-logo"><Mark size={56} /><h1 className="wordmark big">Forgot password</h1></div>
      {mail ? <>
        <p className="muted">Enter your account email. If it exists, we send a link that works for 30 minutes.</p>
        <label>Email<input type="email" required autoComplete="email" onChange={(e) => setEmail(e.target.value)} /></label>
        {site && <div ref={box} className="cf" />}
        <Err e={err} />{msg && <p className="ok" role="status">{msg}</p>}
        <button className="btn" disabled={busy || (!!site && !tok)}>Send reset link</button></>
        : <p className="muted">Email reset is not switched on yet. Ask your college administrator to set a temporary password for you.</p>}
      <button type="button" className="link" onClick={onBack}>← Back to login</button>
    </form></main>
  );
}
function ResetPage({ token }) {
  const [pw, setPw] = useState(''); const [again, setAgain] = useState(''); const [err, setErr] = useState(''); const [done, setDone] = useState(false);
  async function go(e) { e.preventDefault(); setErr(''); if (pw !== again) return setErr('The two passwords do not match'); try { await api('/auth/reset', { method: 'POST', body: { token, password: pw } }); setDone(true); } catch (x) { setErr(x.message); } }
  return (
    <main className="center"><form className="card auth" onSubmit={go}>
      <div className="auth-logo"><Mark size={56} /><h1 className="wordmark big">Choose a new password</h1></div>
      {done ? <><p className="ok" role="status">Password changed. You can log in now.</p><a className="btn" href="/">Go to login</a></> : <>
        <label>New password (8+)<PwInput required minLength={8} maxLength={72} autoComplete="new-password" onChange={(e) => setPw(e.target.value)} /></label>
        <label>New password again<PwInput required minLength={8} maxLength={72} autoComplete="new-password" onChange={(e) => setAgain(e.target.value)} /></label>
        <Err e={err} /><button className="btn">Save password</button></>}
    </form></main>
  );
}

function ChangePassword({ onDone, onCancel }) {
  const [f, setF] = useState({ current: '', next: '', again: '' }); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function go(e) {
    e.preventDefault(); setErr('');
    if (f.next !== f.again) return setErr('The two new passwords do not match');
    setBusy(true);
    try { const r = await api('/auth/change-password', { method: 'POST', body: { current: f.current, next: f.next } }); setToken(r.token); onDone(r.user); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  }
  return (
    <div className="overlay">
      <form className="dialog glass" role="dialog" aria-modal="true" aria-labelledby="cp-t" onSubmit={go}>
        <h2 id="cp-t">Set your own password</h2>
        <p className="muted">{onCancel ? 'Choose a new password (8+ characters).' : 'You are using a password given by the admin. Choose a new one (8+ characters) to continue.'}</p>
        <label>Current password<PwInput required autoComplete="current-password" onChange={set('current')} /></label>
        <label>New password<PwInput required minLength={8} maxLength={72} autoComplete="new-password" onChange={set('next')} /></label>
        <label>New password again<PwInput required minLength={8} maxLength={72} autoComplete="new-password" onChange={set('again')} /></label>
        <Err e={err} /><button className="btn" disabled={busy}>Save and continue</button>{onCancel && <button type="button" className="link" onClick={onCancel}>Cancel</button>}
      </form>
    </div>
  );
}

function CsvImport({ onDone }) {
  const [res, setRes] = useState(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [help, setHelp] = useState(false);
  const sample = 'name,branch,year,semester,email,initial password,group,roll number\nAsha Rao,IT,2,3,asha@college.edu,Temp-pass-123,G1,21IT001\nRavi Kumar,CSE,1,1,ravi@college.edu,Temp-pass-456,G2,\n';
  const download = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([sample], { type: 'text/csv' })); a.download = 'students-template.csv'; a.click(); };
  async function go(e) {
    e.preventDefault(); setErr(''); setRes(null); setHelp(false);
    const file = e.target.elements.file.files[0]; if (!file) return setErr('Choose a CSV file');
    const form = new FormData(); form.append('file', file); setBusy(true);
    try { const r = await api('/admin/users/import', { method: 'POST', form }); setRes(r); onDone(); } catch (x) { setErr(x.message); setHelp(!!x.help); } finally { setBusy(false); }
  }
  return (
    <form className="glass form" onSubmit={go}>
      <h3>Import students from CSV</h3>
      <p className="muted small">Required columns: name, branch, year, semester, email, initial password, group. Max 200 rows. Good rows are created; bad rows are listed below. Students must change the password at first login.</p>
      <input type="file" name="file" accept=".csv,text/csv" />
      <Err e={err} />
      <button type="button" className="link" onClick={() => setHelp(!help)} aria-expanded={help}>{help ? 'Hide CSV format help' : 'Show CSV format help'}</button>
      {help && <div className="note" role="region" aria-label="CSV format help"><p><b>The first row must be these column names</b> (any order, upper or lower case):</p>
        <p className="small">name, branch, year, semester, email, initial password, group, roll number (optional), batch (optional), section (optional)</p>
        <ul className="small"><li>branch: CSE, IT, ECE, EE, ME or CE</li><li>year: 1 to 4. semester: 1 to 8</li><li>email must be unique. Roll number is optional but unique if given</li><li>initial password: 8 to 72 characters</li><li>Save as CSV (comma separated), max 200 rows, 1 MB</li></ul>
        <pre className="small" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{sample}</pre><button type="button" className="ghost" onClick={download}>Download template</button></div>}
      {res && <div role="status"><p className="ok">Created {res.created} student(s). {res.failed.length} row(s) skipped.</p>
        {res.failed.map((f) => <p key={f.row} className="muted small">Row {f.row} {f.email}: {f.error}</p>)}</div>}
      <button className="btn" disabled={busy}>{busy ? 'Importing…' : 'Import'}</button>
    </form>
  );
}

function ConfirmDelete({ u, onCancel, onConfirm }) {
  useEffect(() => { const k = (e) => e.key === 'Escape' && onCancel(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); });
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="dialog glass" role="dialog" aria-modal="true" aria-labelledby="del-t" onClick={(e) => e.stopPropagation()}>
        <h2 id="del-t">Delete this user?</h2>
        <p className="muted">{u.name} ({u.email}, {u.role}) will be removed.{u.role === 'student' ? ' Their activities and certificates will also be deleted.' : ''} This cannot be undone.</p>
        <div className="row"><button className="ghost" autoFocus onClick={onCancel}>Cancel</button><button className="btn" onClick={onConfirm}>Delete</button></div>
      </div>
    </div>
  );
}

function Avatar({ user, onLogout, onChangePw }) {
  const [open, setOpen] = useState(false); const ref = React.useRef(null);
  const initials = user.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
  useEffect(() => {
    const out = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', out); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', out); document.removeEventListener('keydown', esc); };
  }, []);
  const rows = [['Role', user.role], ['Email', user.email], ['Department', user.department], user.year && ['Year', user.year], user.semester && ['Semester', user.semester], user.rollNo && ['Roll no', user.rollNo], user.batch && ['Batch', user.batch], user.section && ['Section', user.section], user.group && ['Group', user.group]].filter(Boolean);
  return (
    <div className={'avatar-wrap' + (open ? ' open' : '')} ref={ref} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      <button className="avatar" aria-label={'Account: ' + user.name} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(true)}>{initials}</button>
      <div className="avatar-pop glass" role="region" aria-label="Account details">
        <b className="ap-name">{user.name}</b>
        <dl>{rows.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl>
        <button className="ghost" onClick={() => { setOpen(false); onChangePw(); }}>Change password</button>
        <button className="ghost" onClick={() => { setOpen(false); onLogout(); }}>Log out</button>
      </div>
    </div>
  );
}

function ConfirmLogout({ onCancel, onConfirm }) {
  const [closing, setClosing] = useState(null);
  const close = (fn) => { if (closing) return; setClosing(true); setTimeout(fn, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220); };
  useEffect(() => { const k = (e) => e.key === 'Escape' && close(onCancel); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); });
  return (
    <div className={'overlay' + (closing ? ' out' : '')} onClick={() => close(onCancel)}>
      <div className="dialog glass" role="dialog" aria-modal="true" aria-labelledby="lo-t" onClick={(e) => e.stopPropagation()}>
        <h2 id="lo-t">Log out?</h2>
        <p className="muted">You will need to log in again to see your activities.</p>
        <div className="row"><button className="ghost" autoFocus onClick={() => close(onCancel)}>Stay logged in</button><button className="btn" onClick={() => close(onConfirm)}>Log out</button></div>
      </div>
    </div>
  );
}

function Qr({ url, label }) {
  const [src, setSrc] = useState('');
  useEffect(() => { QRCode.toDataURL(url, { width: 220, margin: 2, errorCorrectionLevel: 'M' }).then(setSrc).catch(() => setSrc('')); }, [url]);
  return src ? <img src={src} width="140" height="140" alt={'QR code for ' + label} style={{ background: '#fff', borderRadius: 12 }} /> : null;
}
function ShareRow({ title, share, onCreate, onStop }) {
  const url = share ? location.origin + '/p/' + share.token : ''; const [copied, setCopied] = useState(false);
  const copy = () => navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  return (
    <div className="between" style={{ alignItems: 'center', gap: 14 }}>
      <div style={{ flex: 1, minWidth: 200 }}><b>{title}</b>
        {share ? <><p className="small" style={{ wordBreak: 'break-all', margin: '4px 0' }}>{url}</p><div className="row"><button className="ghost" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button><button className="ghost" onClick={onStop}>Stop sharing</button></div></> : <p className="muted small">Not shared. Only you can see it.</p>}
        {!share && <button className="btn small" onClick={onCreate}>Create share link</button>}</div>
      {share && <Qr url={url} label={title} />}
    </div>
  );
}
function Sharing() {
  const [shares, setShares] = useState([]); const [acts, setActs] = useState([]); const [err, setErr] = useState('');
  const load = () => Promise.all([api('/shares'), api('/reports/me')]).then(([s, r]) => { setShares(s.shares); setActs(r.activities); }).catch((x) => setErr(x.message));
  useEffect(() => { load(); }, []);
  const act = (fn) => async () => { setErr(''); try { await fn(); await load(); } catch (x) { setErr(x.message); } };
  const prof = shares.find((s) => s.scope === 'profile');
  return (
    <section className="glass card" aria-label="Sharing">
      <h3>Share your record</h3>
      <p className="muted small">Links are off until you create one. Anyone with a link sees your name, department, year and verified items only (title, type, organizer, date). No email, no certificate file. You can stop sharing any time.</p>
      <Err e={err} />
      <ShareRow title="My full profile" share={prof} onCreate={act(() => api('/shares', { method: 'POST', body: { scope: 'profile' } }))} onStop={act(() => api('/shares/' + prof.id + '/revoke', { method: 'POST' }))} />
      {acts.length === 0 && <p className="muted small">Verified activities appear here so you can share one certificate on its own.</p>}
      {acts.map((a) => { const s = shares.find((x) => x.scope === 'activity' && String(x.activity) === String(a.id));
        return <ShareRow key={a.id} title={a.title} share={s} onCreate={act(() => api('/shares', { method: 'POST', body: { scope: 'activity', activityId: a.id } }))} onStop={act(() => api('/shares/' + s.id + '/revoke', { method: 'POST' }))} />; })}
    </section>
  );
}
function PublicView({ token }) {
  const [d, setD] = useState(null); const [err, setErr] = useState('');
  useEffect(() => { document.title = 'CampusTrace'; fetch('/api/public/' + encodeURIComponent(token)).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'This link is not available'); setD(j); }).catch((x) => setErr(x.message)); }, [token]);
  return (
    <div className="shell"><header className="top"><Logo size={34} /></header>
      <main className="wrap">
        {err && <section className="glass banner"><div><h2>{err}</h2><p className="muted">The owner may have stopped sharing it.</p></div></section>}
        {!d && !err && <p className="muted">Loading…</p>}
        {d && <><section className="glass hero"><div><p className="eyebrow">Verified participation</p><h2>{d.student.name}</h2><p className="lead">{d.student.department} · Year {d.student.year}</p><p className="muted small">Only items verified by the college are shown.</p></div></section>
          <div className="grid">{d.activities.length === 0 && <p className="empty glass">No verified items yet.</p>}
            {d.activities.map((a, i) => <article key={i} className="glass card"><h3>{a.title}</h3><p className="muted">{a.type}{a.organizer ? ' · ' + a.organizer : ''}</p><p>{new Date(a.date).toLocaleDateString()}</p><span className="badge verified"><b aria-hidden="true">✓</b> Verified</span></article>)}</div></>}
      </main></div>
  );
}

function Main() {
  const [user, setUser] = useState(null); const [ready, setReady] = useState(!hasToken()); const [view, setView] = useState('main'); const [seen, setSeen] = useState(!!sessionStorage.getItem('pp_seen')); const [auth, setAuth] = useState(''); const [askOut, setAskOut] = useState(false); const [askPw, setAskPw] = useState(false);
  useEffect(() => { if (hasToken()) api('/auth/me').then((r) => setUser(r.user)).catch(() => setToken('')).finally(() => setReady(true)); }, []);
  if (!ready) return <main className="center"><p className="muted">Loading…</p></main>;
  if (!user) {
    if (!seen) return <Splash onDone={() => { sessionStorage.setItem('pp_seen', '1'); setSeen(true); }} />;
    if (!auth) return <Landing onLogin={() => setAuth('login')} />;
    return <Auth onAuth={setUser} onBack={() => setAuth('')} />;
  }
  if (user.mustChangePassword) return <ChangePassword onDone={setUser} />;
  const staff = user.role !== 'student';
  return (
    <div className="shell">
      <header className="top"><Logo size={34} />
        <div className="navlinks">{!staff && <><button className="link" aria-current="page" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Home</button></>}
          {staff && <>{['faculty', 'counsellor'].includes(user.role) && <button className="link" aria-current={view === 'main' ? 'page' : undefined} onClick={() => setView('main')}>Review</button>}<button className="link" aria-current={view === 'reports' || ['admin', 'hod'].includes(user.role) ? 'page' : undefined} onClick={() => setView('reports')}>Reports</button></>}
          <Avatar user={user} onLogout={() => setAskOut(true)} onChangePw={() => setAskPw(true)} /></div></header>
      <main className="wrap" key={view}>
        {user.role === 'student' && <Student user={user} />}
        {['faculty', 'counsellor'].includes(user.role) && (view === 'reports' ? <Reports user={user} /> : <Review user={user} />)}
        {['admin', 'hod'].includes(user.role) && <Reports user={user} />}
      </main>
      {askPw && <ChangePassword onCancel={() => setAskPw(false)} onDone={(u) => { setAskPw(false); setUser(u); }} />}
      {askOut && <ConfirmLogout onCancel={() => setAskOut(false)} onConfirm={() => { setAskOut(false); setToken(''); setUser(null); setView('main'); }} />}
    </div>
  );
}

export default function App() { const m = location.pathname.match(/^\/p\/([\w-]+)\/?$/); const r = location.pathname.match(/^\/reset\/([a-f0-9]{64})\/?$/); return <>{r ? <ResetPage token={r[1]} /> : m ? <PublicView token={m[1]} /> : <Main />}<ThemeToggle /></>; }
