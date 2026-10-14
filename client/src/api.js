let token = sessionStorage.getItem('pp_token') || '';
export const setToken = (t) => { token = t || ''; t ? sessionStorage.setItem('pp_token', t) : sessionStorage.removeItem('pp_token'); };
export const hasToken = () => !!token;
export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = token ? { Authorization: 'Bearer ' + token } : {};
  let payload;
  if (form) payload = form; else if (body) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch('/api' + path, { method, headers, body: payload });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : await res.blob();
  if (!res.ok) { const e = new Error(data.error || 'Something went wrong'); e.status = res.status; e.help = !!data.help; throw e; }
  return data;
}
export async function openBlob(path, filename) {
  const blob = await api(path);
  const url = URL.createObjectURL(blob);
  if (filename) { const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); } else window.open(url, '_blank', 'noopener');
}
