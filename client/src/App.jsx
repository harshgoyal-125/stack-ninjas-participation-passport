import React, { useEffect, useState } from 'react';
import { api, setToken, hasToken, openBlob } from './api.js';

const DEPTS = ['CSE', 'IT', 'ECE', 'EE', 'ME', 'CE'];
const TYPES = ['Hackathon', 'Workshop', 'Seminar', 'Sports', 'Cultural', 'Competition', 'Other'];
const STATUS = { submitted: ['In review', '⏳'], verified: ['Verified', '✓'], changes_needed: ['Changes needed', '!'] };
const fmt = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function Badge({ s }) { const [t, i] = STATUS[s]; return <span className={'badge ' + s}><b aria-hidden="true">{i}</b> {t}</span>; }
function Err({ e }) { return e ? <p className="err" role="alert">{e}</p> : null; }

function Auth({ onAuth, start = 'login', onBack }) {
  const [mode, setMode] = useState(start); const [f, setF] = useState({ department: 'IT', year: 3 }); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function go(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const r = await api('/auth/' + mode, { method: 'POST', body: f }); setToken(r.token); onAuth(r.user); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  }
  return (
    <main className="center">
      <form className="glass auth" onSubmit={go}>
        <img className="hero3d" src="/img/logo.png" alt="CampusTrace" />
        <h1 className="sr">CampusTrace</h1>
        <p className="muted">One verified record of every activity you take part in.</p>
        {mode === 'register' && <label>Full name<input required maxLength={80} onChange={set('name')} /></label>}
        <label>Email<input type="email" required autoComplete="email" onChange={set('email')} /></label>
        <label>Password<input type="password" required minLength={mode === 'register' ? 8 : 1} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} onChange={set('password')} /></label>
        {mode === 'register' && <div className="row">
          <label>Department<select value={f.department} onChange={set('department')}>{DEPTS.map((d) => <option key={d}>{d}</option>)}</select></label>
          <label>Year<select value={f.year} onChange={set('year')}>{[1, 2, 3, 4].map((d) => <option key={d}>{d}</option>)}</select></label>
        </div>}
        <Err e={err} />
        <button className="btn" disabled={busy}>{mode === 'login' ? 'Log in' : 'Create student account'}</button>
        {onBack && <button type="button" className="link" onClick={onBack}>← Back to home</button>}
        <button type="button" className="link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErr(''); }}>{mode === 'login' ? 'New student? Create an account' : 'Have an account? Log in'}</button>
        {mode === 'register' && <p className="muted small">Faculty and admin accounts are created by an administrator.</p>}
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
      <p className="muted small">PDF, PNG or JPG, up to 2 MB. A faculty member checks it before it counts.</p>
      <Err e={err} />
      <div className="row"><button className="btn" disabled={busy}>{initial ? 'Resubmit' : 'Submit for review'}</button><button type="button" className="ghost" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}


function Splash({ onDone }) {
  useEffect(() => { const t = setTimeout(onDone, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 800 : 3800); return () => clearTimeout(t); }, []);
  return (
    <div className="splash" role="status" aria-label="CampusTrace loading" onClick={onDone}>
      <div className="logoframe"><img src="/img/logo.png" alt="CampusTrace logo: Learn, Verify, Grow" /><i className="star" aria-hidden="true" /></div>
    </div>
  );
}

function Landing({ onLogin, onRegister }) {
  const steps = [['1', 'Submit', 'A student adds an activity and uploads the certificate as evidence.'], ['2', 'Review', 'A faculty member from the same department checks it and verifies it, or sends it back with a reason.'], ['3', 'Report', 'Reports and exports count verified activities only.']];
  const who = [['Students', 'One personal record of every activity, with a clear status on each.'], ['Faculty', 'A review inbox with the certificate beside the record.'], ['Admin', 'Verified participation by department and type, with CSV export.']];
  return (
    <div className="shell landing">
      <header className="top glass"><div className="brand"><img src="/img/logo.png" alt="CampusTrace" /></div>
        <div className="navlinks"><button className="link" onClick={onRegister}>Create student account</button><button className="btn small" onClick={onLogin}>Login</button></div></header>
      <main className="wrap">
        <section className="glass hero">
          <div><p className="eyebrow">Student participation platform</p>
            <h2>Every activity.<em>One verified record.</em></h2>
            <p className="lead">An uploaded certificate is evidence, not a verified record. CampusTrace collects the evidence, gets it verified by faculty, and reports only what is verified.</p>
            <div className="row"><button className="btn" onClick={onLogin}>Login</button><button className="ghost" onClick={onRegister}>New student? Sign up</button></div></div>
          <img className="art logo" src="/img/logo.png" alt="CampusTrace logo: Learn, Verify, Grow" />
        </section>
        <h2 className="sec">How it works</h2>
        <div className="grid">{steps.map(([n, t, d]) => <article key={n} className="glass card acard"><span className="num">{n}</span><h3>{t}</h3><p className="muted">{d}</p></article>)}</div>
        <h2 className="sec">Who it is for</h2>
        <div className="grid">{who.map(([t, d]) => <article key={t} className="glass card acard"><h3>{t}</h3><p className="muted">{d}</p></article>)}</div>
        <section className="glass stats" aria-label="Status words">
          <div className="v"><b>✓</b><span>Verified</span></div><div className="r"><b>⏳</b><span>In review</span></div><div className="c"><b>!</b><span>Changes needed</span></div>
        </section>
        <section className="glass banner"><div><h2>Ready to build your record?</h2><p className="muted">Faculty and admin accounts are created by an administrator.</p></div><button className="btn" onClick={onLogin}>Login</button></section>
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
          <p className="eyebrow">Your campus story</p>
          <p className="who">{user.name} · {user.department} · Year {user.year}</p>
          <h2>Every activity.<em>One beautiful journey.</em></h2>
          <p className="lead">Collect evidence. Track reviews. Keep your story.</p>
          <div className="row"><button className="btn" onClick={() => setForm('new')}>+ Add participation</button><button className="ghost" onClick={() => setTab('report')}>View my record</button></div>
        </div>
        <img className="art" src="/img/logo.png" alt="" aria-hidden="true" />
      </section>
      <section className="glass stats" aria-label="Your activity counts">
        <div className="v"><b>{rep ? rep.verifiedCount : '–'}</b><span>✓ Verified</span></div>
        <div className="r"><b>{n('submitted')}</b><span>⏳ In review</span></div>
        <div className="c"><b>{n('changes_needed')}</b><span>! Needs changes</span></div>
      </section>
      <div className="sechead"><h2>Your activity trail</h2>
        <div className="chips" role="group" aria-label="Filter">{['All', 'Technical', 'Cultural', 'Sports'].map((g) => <button key={g} aria-pressed={group === g} onClick={() => { setGroup(g); setTab('activities'); }}>{g}</button>)}</div></div>
      <Err e={err} />
      {tab === 'activities' && (shown.length === 0 ? <p className="empty glass">No activities here yet. Add one with its certificate.</p> : <div className="grid">{shown.map((a) => (
        <article key={a.id} className="glass card acard">
          <img className="icon" src={ICON[GROUP[a.type]]} alt="" aria-hidden="true" />
          <h3>{a.title}</h3>
          <p className="muted">{a.type} · {fmt(a.date)}{a.organizer && ' · ' + a.organizer}</p>
          <Badge s={a.status} />
          {a.status === 'changes_needed' && <p className="note"><b>Faculty note:</b> {a.reviewNote}</p>}
          <div className="row">
            <button className="ghost" onClick={() => openBlob(`/activities/${a.id}/certificate`)}>View certificate</button>
            {a.status === 'changes_needed' && <button className="btn small" onClick={() => setForm(a)}>Update evidence</button>}
          </div>
        </article>))}</div>)}
      {tab === 'report' && rep && (
        <section className="glass card">
          <h3>Semester report (verified only)</h3>
          {rep.activities.length === 0 ? <p className="muted">Nothing verified yet.</p> : <table><thead><tr><th>Activity</th><th>Type</th><th>Date</th></tr></thead><tbody>{rep.activities.map((a) => <tr key={a.id}><td>{a.title}</td><td>{a.type}</td><td>{fmt(a.date)}</td></tr>)}</tbody></table>}
          <button className="ghost" onClick={() => window.print()}>Print / save as PDF</button>
        </section>)}
      <section className="glass banner"><div><h2>Your semester, ready to share.</h2><p className="muted">Build a report from verified activities.</p></div><button className="btn" onClick={() => { setTab('report'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Preview report</button></section>
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

function Reports({ user }) {
  const [s, setS] = useState(null); const [st, setSt] = useState([]); const [err, setErr] = useState('');
  useEffect(() => { Promise.all([api('/reports/summary'), api('/reports/students')]).then(([a, b]) => { setS(a); setSt(b.students); }).catch((e) => setErr(e.message)); }, []);
  if (!s) return <Err e={err} />;
  const max = Math.max(1, ...s.verifiedByDepartment.map((x) => x.count));
  return (
    <>
      <h2>Verified participation report</h2>
      <p className="muted">Counts include verified records only. {s.pendingReview} waiting for review are not included.</p>
      <section className="glass card"><h3>By department</h3>
        {s.verifiedByDepartment.length === 0 && <p className="muted">No verified records yet.</p>}
        {s.verifiedByDepartment.map((x) => <div key={x.department} className="bar"><span>{x.department}</span><i style={{ width: (x.count / max) * 100 + '%' }} /><b>{x.count}</b></div>)}
      </section>
      <section className="glass card"><h3>By type</h3>{s.verifiedByType.map((x) => <p key={x.type}>{x.type}: <b>{x.count}</b></p>)}</section>
      <section className="glass card"><h3>Top students (verified)</h3>{st.map((x, i) => <p key={i}>{x.name} · {x.department} Y{x.year}: <b>{x.verifiedCount}</b></p>)}</section>
      <button className="btn" onClick={() => openBlob('/reports/export.csv', 'verified-participation.csv')}>Download CSV (opens in Excel)</button>
      {user.role === 'admin' && <AdminUsers />}
    </>
  );
}

function AdminUsers() {
  const [f, setF] = useState({ role: 'faculty', department: 'IT' }); const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function go(e) { e.preventDefault(); setErr(''); setMsg(''); try { const r = await api('/admin/users', { method: 'POST', body: f }); setMsg('Created ' + r.user.role + ': ' + r.user.email); } catch (x) { setErr(x.message); } }
  return (
    <form className="glass form" onSubmit={go}>
      <h3>Create faculty account</h3>
      <label>Name<input required onChange={set('name')} /></label>
      <label>Email<input type="email" required onChange={set('email')} /></label>
      <label>Temporary password (8+)<input type="password" minLength={8} required onChange={set('password')} /></label>
      <div className="row"><label>Role<select value={f.role} onChange={set('role')}><option>faculty</option><option>admin</option></select></label>
        <label>Department<select value={f.department} onChange={set('department')}>{DEPTS.map((d) => <option key={d}>{d}</option>)}</select></label></div>
      <Err e={err} />{msg && <p className="ok" role="status">{msg}</p>}
      <button className="btn">Create</button>
    </form>
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

export default function App() {
  const [user, setUser] = useState(null); const [ready, setReady] = useState(!hasToken()); const [view, setView] = useState('main'); const [seen, setSeen] = useState(!!sessionStorage.getItem('pp_seen')); const [auth, setAuth] = useState(''); const [askOut, setAskOut] = useState(false);
  useEffect(() => { if (hasToken()) api('/auth/me').then((r) => setUser(r.user)).catch(() => setToken('')).finally(() => setReady(true)); }, []);
  if (!ready) return <main className="center"><p className="muted">Loading…</p></main>;
  if (!user) {
    if (!seen) return <Splash onDone={() => { sessionStorage.setItem('pp_seen', '1'); setSeen(true); }} />;
    if (!auth) return <Landing onLogin={() => setAuth('login')} onRegister={() => setAuth('register')} />;
    return <Auth onAuth={setUser} start={auth} onBack={() => setAuth('')} />;
  }
  const staff = user.role !== 'student';
  return (
    <div className="shell">
      <header className="top glass"><div className="brand"><img src="/img/logo.png" alt="CampusTrace" /></div>
        <div className="navlinks">{!staff && <><button className="link" aria-current="page" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Home</button></>}
          {staff && <>{user.role === 'faculty' && <button className="link" aria-current={view === 'main' ? 'page' : undefined} onClick={() => setView('main')}>Review</button>}<button className="link" aria-current={view === 'reports' || user.role === 'admin' ? 'page' : undefined} onClick={() => setView('reports')}>Reports</button></>}
          <span className="pill" title={user.email}>{user.name} · {user.role}</span>
          <button className="link" onClick={() => setAskOut(true)}>Log out</button></div></header>
      <main className="wrap" key={view}>
        {user.role === 'student' && <Student user={user} />}
        {user.role === 'faculty' && (view === 'reports' ? <Reports user={user} /> : <Review user={user} />)}
        {user.role === 'admin' && <Reports user={user} />}
      </main>
      {askOut && <ConfirmLogout onCancel={() => setAskOut(false)} onConfirm={() => { setAskOut(false); setToken(''); setUser(null); setView('main'); }} />}
    </div>
  );
}
