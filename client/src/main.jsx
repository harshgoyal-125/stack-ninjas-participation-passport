import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './style.css';
try { document.documentElement.dataset.theme = localStorage.getItem('pp_theme') === 'dark' ? 'dark' : 'light'; } catch (e) { document.documentElement.dataset.theme = 'light'; }
createRoot(document.getElementById('root')).render(<App />);
