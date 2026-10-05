// Shared header + helpers
(function () {
  const nav = document.body.dataset.nav || 'guest';
  const here = location.pathname;
  const links = {
    guest: [['/login', 'Log in'], ['/signup', 'Create account']],
    member: [['/card', 'My card']],
    admin: [['/card', 'My card'], ['/admin', 'Members'], ['/admin/scan', 'Scan']],
  };
  const header = document.createElement('header');
  header.className = 'site-header';
  header.innerHTML = `<div class="inner">
    <a class="brand" href="/"><img src="/img/logo.png" alt="" onerror="this.parentNode.classList.add('no-logo')"><span class="mark">CPSC</span><span>Central Pacific Ski Club</span></a>
    <nav class="nav">${(links[nav] || []).map(([h, t]) => `<a href="${h}" class="${here === h ? 'active' : ''}">${t}</a>`).join('')}
    ${nav !== 'guest' ? '<button id="logout">Log out</button>' : ''}</nav></div>`;
  document.body.prepend(header);
  const lo = document.getElementById('logout');
  if (lo) lo.onclick = async () => { await fetch('/api/logout', { method: 'POST' }); location.href = '/login'; };
})();

window.$ = (s) => document.querySelector(s);
window.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
window.showMsg = (el, text, ok) => { el.textContent = text; el.className = 'msg show ' + (ok ? 'ok' : 'err'); };
window.api = async (url, opts = {}) => {
  const o = { ...opts };
  if (o.json) { o.method = o.method || 'POST'; o.headers = { 'Content-Type': 'application/json' }; o.body = JSON.stringify(o.json); delete o.json; }
  const r = await fetch(url, o);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
};
window.fmtTime = (iso) => {
  if (!iso) return 'Never';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  const mins = Math.round((Date.now() - d) / 60000);
  const rel = mins < 1 ? 'just now' : mins < 60 ? `${mins} min ago` : mins < 1440 ? `${Math.round(mins / 60)} hr ago` : `${Math.round(mins / 1440)} days ago`;
  return `${d.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })} · ${rel}`;
};
