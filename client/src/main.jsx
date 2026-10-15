import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './style.css';
try { const sv = localStorage.getItem('pp_theme'); document.documentElement.dataset.theme = sv ? (sv === 'dark' ? 'dark' : 'light') : (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch (e) { document.documentElement.dataset.theme = 'light'; }
createRoot(document.getElementById('root')).render(<App />);

// Gentle 3D tilt on plain content cards. Desktop with a mouse only, never with reduced motion, never on forms.
if (window.matchMedia('(hover:hover) and (pointer:fine)').matches && !window.matchMedia('(prefers-reduced-motion:reduce)').matches) {
  let last = null;
  const reset = () => { if (last) { last.style.removeProperty('--rx'); last.style.removeProperty('--ry'); last = null; } };
  document.addEventListener('pointermove', (e) => {
    const el = e.target.closest && e.target.closest('.card');
    if (!el || el.matches('.form, .auth') || el.querySelector('input, select, textarea')) return reset();
    if (last && last !== el) reset();
    const r = el.getBoundingClientRect();
    el.style.setProperty('--ry', (((e.clientX - r.left) / r.width - 0.5) * 5).toFixed(2) + 'deg');
    el.style.setProperty('--rx', ((0.5 - (e.clientY - r.top) / r.height) * 4).toFixed(2) + 'deg');
    last = el;
  }, { passive: true });
  document.addEventListener('pointerleave', reset);
}
