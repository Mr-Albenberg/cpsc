// Shared code for every page: Supabase client, header, login checks, helpers.
(function () {
  const CFG = window.CPSC_CONFIG || {};
  const configured = !!(CFG.supabaseUrl && CFG.supabaseAnonKey &&
    !CFG.supabaseUrl.includes('YOUR-') && !CFG.supabaseAnonKey.includes('YOUR-'));

  window.sb = configured ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey) : null;
  window.FN_URL = configured ? CFG.supabaseUrl.replace(/\/$/, '') + '/functions/v1/wallet' : null;

  const file = location.pathname.split('/').pop() || 'index.html';
  const here = file === 'index.html' ? 'home.html' : file; // the site root is the Home page

  // Club pages (content from cpsconline.com) + account links for who's logged in
  const CLUB = [['home.html', 'Home'], ['about.html', 'About'], ['events.html', 'Events'], ['big-trip.html', 'Big Trip'],
    ['ikon.html', 'Ikon Pass'], ['sponsors.html', 'Sponsors'], ['exec-board.html', 'Exec Board'], ['join.html', 'Join']];
  function renderHeader(nav) {
    const acct = {
      guest: [['login.html', 'Log in']],
      member: [['card.html', 'My card']],
      admin: [['card.html', 'My card'], ['admin.html', 'Members'], ['scan.html', 'Scan']],
    }[nav] || [];
    const a = ([h, t], cls = '') => `<a href="${h}" class="${cls}${here === h ? ' active' : ''}"${here === h ? ' aria-current="page"' : ''}>${t}</a>`;
    let header = document.querySelector('.site-header');
    if (!header) { header = document.createElement('header'); header.className = 'site-header'; document.body.prepend(header); }
    header.innerHTML = `<div class="inner">
      <a class="brand" href="home.html"><img src="img/logo.png" alt="CPSC" onerror="this.parentNode.classList.add('no-logo')"><span class="mark">CPSC</span><span>Central Pacific Ski Club</span></a>
      <button class="menu-btn" type="button" aria-expanded="false" aria-controls="siteNav"><span></span><span></span><span></span><b>Menu</b></button>
      <nav class="nav" id="siteNav" aria-label="Main">
        <div class="nav-club">${CLUB.map((l) => a(l)).join('')}</div>
        <div class="nav-acct">${acct.map((l) => a(l, 'acct')).join('')}${nav !== 'guest' ? '<button id="logout" type="button">Log out</button>' : ''}</div>
      </nav></div>`;
    const btn = header.querySelector('.menu-btn');
    btn.onclick = () => { const open = header.classList.toggle('open'); btn.setAttribute('aria-expanded', open); };
    const lo = document.getElementById('logout');
    if (lo) lo.onclick = async () => { await sb.auth.signOut(); setRole(null); location.href = 'home.html'; };
  }

  function showSetup() {
    const main = document.querySelector('main');
    main.innerHTML = `<div class="setup"><h2>Almost there</h2>
      <p>This site isn't connected to its database yet. Open <code>config.js</code> in the GitHub repo and paste in your
      Supabase project URL and anon key (Supabase → Project Settings → API). See the README for the full setup.</p></div>`;
  }

  // Where to go after logging in (?next=exec-board.html), only pages on this site. Admins land on the scanner.
  window.nextPage = function (admin) {
    const n = new URLSearchParams(location.search).get('next') || '';
    return /^[a-z0-9-]+\.html$/.test(n) && !['index.html', 'login.html'].includes(n) ? n : (admin ? 'scan.html' : 'card.html');
  };
  // Remembered so the site root can send you straight to your page before anything loads
  function setRole(role) { try { role ? localStorage.setItem('cpsc-role', role) : localStorage.removeItem('cpsc-role'); } catch (e) {} }
  window.setRole = setRole;
  const homeFor = (admin) => (admin ? 'scan.html' : 'card.html');
  let editorLoaded = false;
  function maybeEditor(isAdmin) {
    if (!isAdmin || editorLoaded || !SC.editable) return;
    editorLoaded = true;
    const s = document.createElement('script'); s.src = 'assets/editor.js?v=2'; document.body.appendChild(s);
  }

  // need: 'guest' | 'member' | 'admin' | 'any' | 'public'
  window.boot = async function (need) {
    renderHeader('guest');
    if (!sb) { showSetup(); throw new Error('not configured'); }
    const { data: { session } } = await sb.auth.getSession();
    if (need === 'any') return { session };
    if (need === 'public') { // club pages: open to everyone, header shows the right account links
      if (session && file === 'index.html') { // site root → your card (admins: the scanner)
        const { data } = await sb.from('profiles').select('is_admin').eq('id', session.user.id).maybeSingle();
        if (data) { setRole(data.is_admin ? 'admin' : 'member'); location.replace(homeFor(data.is_admin)); throw new Error('redirect'); }
      }
      if (session) sb.from('profiles').select('is_admin').eq('id', session.user.id).maybeSingle()
        .then(({ data }) => { if (!data) return; setRole(data.is_admin ? 'admin' : 'member'); renderHeader(data.is_admin ? 'admin' : 'member'); maybeEditor(data.is_admin); });
      return { session };
    }
    if (need === 'guest') {
      if (session) {
        const { data } = await sb.from('profiles').select('is_admin').eq('id', session.user.id).maybeSingle();
        location.replace(window.nextPage(data?.is_admin)); throw new Error('redirect');
      }
      return {};
    }
    if (!session) { location.replace('login.html?next=' + encodeURIComponent(file)); throw new Error('redirect'); }
    const { data: profile, error } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
    if (error || !profile) {
      await sb.auth.signOut();
      location.replace('login.html?gone=1');
      throw new Error('no profile');
    }
    if (need === 'admin' && !profile.is_admin) { location.replace('card.html'); throw new Error('redirect'); }
    renderHeader(profile.is_admin ? 'admin' : 'member');
    setRole(profile.is_admin ? 'admin' : 'member');
    maybeEditor(profile.is_admin);
    return { session, profile };
  };

  // Crop/resize a chosen image into the two files we store: a 600px JPEG photo and a 180px PNG thumbnail
  // (Apple Wallet requires PNG images inside a pass).
  window.makePhotoFiles = async function (file) {
    const bmp = await createImageBitmap(file);
    const draw = (size, type, quality) => new Promise((res, rej) => {
      const c = document.createElement('canvas'); c.width = c.height = size;
      const s = Math.min(bmp.width, bmp.height);
      c.getContext('2d').drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
      c.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't read that photo."))), type, quality);
    });
    return { photo: await draw(600, 'image/jpeg', 0.85), thumb: await draw(180, 'image/png') };
  };
  window.uploadPhotoFiles = async function (userId, files) {
    const bucket = sb.storage.from('photos');
    for (const [name, blob, type] of [['photo.jpg', files.photo, 'image/jpeg'], ['thumb.png', files.thumb, 'image/png']]) {
      const { error } = await bucket.upload(`${userId}/${name}`, blob, { upsert: true, contentType: type, cacheControl: '60' });
      if (error) throw new Error('Photo upload failed: ' + error.message);
    }
  };
  window.signedPhoto = async function (userId, file = 'photo.jpg') {
    const { data, error } = await sb.storage.from('photos').createSignedUrl(`${userId}/${file}`, 3600);
    return error ? null : data.signedUrl;
  };

  // Call the wallet function as the logged-in user
  window.fnCall = async function (body) {
    const { data: { session } } = await sb.auth.getSession();
    const r = await fetch(FN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Something went wrong.');
    return d;
  };
  window.getWeekCode = async function () {
    const { data } = await sb.from('club_settings').select('week_word,week_emoji,updated_at').eq('id', 1).maybeSingle();
    const title = (w) => w.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
    return data ? { word: data.week_word, text: title(data.week_word), updatedAt: data.updated_at } : null;
  };

  // ===== Site content admins edit from the site (text, photos, colors) =====
  // Saved edits live in the site_content table. Each one remembers where the element sits and what it originally said,
  // so it still finds its spot if the page is rebuilt. Animations and layout are never editable.
  const EDITABLE = ['home.html', 'about.html', 'events.html', 'big-trip.html', 'ikon.html', 'sponsors.html', 'join.html', 'exec-board.html'];
  const THEME = {
    '--lime': ['Accent: header & highlights', '#ecffb0'],
    '--glow-c': ['Neon glow', '#d6ff6e'],
    '--dark': ['Dark sections & footer', '#121212'],
    '--snow': ['Page background', '#fafaf7'],
    '--ink': ['Text', '#111111'],
    '--lime-deep': ['Accent, deeper', '#d7f27a'],
  };
  // Fonts admins can pick (Google Fonts). First one is the original.
  const FONTS = {
    head: ['Bebas Neue', 'Anton', 'Oswald', 'Archivo Black', 'Bungee', 'Teko', 'Russo One'],
    body: ['Questrial', 'Inter', 'DM Sans', 'Nunito', 'Work Sans', 'Space Grotesk', 'Lora'],
  };
  const INLINE = new Set(['B', 'STRONG', 'EM', 'I', 'U', 'SPAN', 'A', 'BR', 'SMALL', 'MARK', 'SUP', 'SUB']);
  const SITE_IMG = CFG.supabaseUrl ? CFG.supabaseUrl.replace(/\/$/, '') + '/storage/v1/object/public/site/' : '//none/';
  const norm = (s) => String(s ?? '').replace(/\u00a0|&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

  // Only harmless inline formatting survives: bold/italic/links/line breaks, no scripts or styles
  function sanitize(html) {
    const doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
    const clean = (node) => {
      for (const c of [...node.childNodes]) {
        if (c.nodeType === 3) continue;
        if (c.nodeType !== 1) { c.remove(); continue; }
        if (!INLINE.has(c.tagName)) { c.replaceWith(doc.createTextNode(c.textContent)); continue; }
        for (const { name: n, value: v } of [...c.attributes]) {
          const ok = (n === 'class' && /^[\w\s-]*$/.test(v))
            || (c.tagName === 'A' && n === 'href' && /^(https?:|mailto:|tel:|#|[\w-]+\.html(#[\w-]*)?$)/i.test(v))
            || (c.tagName === 'A' && ((n === 'target' && v === '_blank') || n === 'rel'))
            || (n === 'style' && /^color:\s*var\(--[\w-]+\);?$/.test(v));
          if (!ok) c.removeAttribute(n);
        }
        clean(c);
      }
    };
    clean(doc.body);
    return doc.body.innerHTML;
  }
  const safeImg = (v) => (typeof v === 'string' && !/["'()\\\s]/.test(v) && (v.startsWith(SITE_IMG) || /^img\/[\w\/.-]+$/.test(v)) ? v : null);

  const SC = window.siteContent = { page: here, EDITABLE, THEME, FONTS, sanitize, safeImg, norm, SITE_IMG, items: [], rows: [], applied: new Map(),
    editable: EDITABLE.includes(here) };

  function pathOf(root, el) { const p = []; while (el && el !== root) { p.unshift([...el.parentNode.children].indexOf(el)); el = el.parentNode; } return p.join('.'); }
  const bgUrl = (el) => (el.style.backgroundImage.match(/url\(["']?([^"')]+)["']?\)/) || [])[1];
  const isTextBlock = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    && [...el.querySelectorAll('*')].every((d) => INLINE.has(d.tagName));
  // The band ticker repeats its words twice; only the first copy is edited and the second mirrors it
  const twin = (el) => {
    const row = el.parentElement;
    if (!row?.parentElement?.classList.contains('band')) return null;
    const kids = [...row.children], half = kids.length / 2, i = kids.indexOf(el);
    return i < half ? kids[i + half] : null;
  };

  function collect() {
    const items = [];
    const scopes = [['main', SC.editable && document.querySelector('main')], ['foot', document.querySelector('.site-footer')]];
    for (const [scope, root] of scopes) {
      if (!root) continue;
      const page = scope === 'foot' ? '*' : here;
      const walk = (el) => {
        if (el.hasAttribute('data-noedit') || el.matches('.lightbox, script, style, svg, input, textarea, select, form, .links')) return;
        const base = { scope, page, el, path: pathOf(root, el) };
        if (scope === 'main' && el.parentElement === root) { // whole sections, so admins can hide them
          items.push({ ...base, kind: 'block', orig: norm(el.textContent).slice(0, 80) || (el.querySelector('img')?.getAttribute('src') || '') });
        }
        if (el.tagName === 'IMG') { const o = el.getAttribute('src'); if (o) items.push({ ...base, kind: 'img', orig: o }); return; }
        if (el !== root && el.style.backgroundImage) { const o = bgUrl(el); if (o) items.push({ ...base, kind: 'img', bg: true, orig: o }); }
        if (el !== root && isTextBlock(el)) {
          const row = el.parentElement;
          if (row?.parentElement?.classList.contains('band') && [...row.children].indexOf(el) >= row.children.length / 2) return;
          items.push({ ...base, kind: 'text', origHTML: el.innerHTML, orig: norm(el.innerHTML), origClean: norm(sanitize(el.innerHTML)) });
          return;
        }
        for (const c of [...el.children]) walk(c);
      };
      walk(root);
    }
    return items;
  }

  SC.linkOf = (it) => { const a = it.el.closest('a'); return a && (it.scope === 'main' ? a.closest('main') : a.closest('.site-footer')) ? a : null; };
  SC.keyOf = (it) => `${it.kind}:${it.page}:${it.scope}:${it.path}`;
  SC.setText = (it, html) => { it.el.innerHTML = html; const t = twin(it.el); if (t) t.innerHTML = html; };
  SC.setImg = (it, url) => {
    const u = safeImg(url); if (!u) return;
    if (it.bg) it.el.style.backgroundImage = `url("${u}")`; else { it.el.removeAttribute('srcset'); it.el.src = u; }
  };
  SC.restore = (it) => (it.kind === 'text' ? SC.setText(it, it.origHTML) : SC.setImg(it, it.orig));
  const fontLink = (name, body) => {
    const id = 'gf-' + name.replace(/\W/g, '');
    if (document.getElementById(id)) return;
    const l = document.createElement('link'); l.id = id; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=' + name.replace(/ /g, '+') + (body ? ':wght@400;700' : '') + '&display=swap';
    document.head.appendChild(l);
  };
  SC.applyTheme = (json) => {
    const st = document.documentElement.style;
    for (const k in THEME) st.removeProperty(k);
    st.removeProperty('--font-head'); st.removeProperty('--font-body');
    let t = {}; try { t = JSON.parse(json || '{}'); } catch (e) {}
    for (const [k, v] of Object.entries(t)) if (THEME[k] && /^#[0-9a-f]{6}$/i.test(v)) st.setProperty(k, v);
    if (FONTS.head.includes(t['font-head']) && t['font-head'] !== FONTS.head[0]) { fontLink(t['font-head']); st.setProperty('--font-head', `"${t['font-head']}", "Arial Narrow", sans-serif`); }
    if (FONTS.body.includes(t['font-body']) && t['font-body'] !== FONTS.body[0]) { fontLink(t['font-body'], true); st.setProperty('--font-body', `"${t['font-body']}", system-ui, sans-serif`); }
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = t['--lime'] || THEME['--lime'][1];
  };
  // Per-page look settings (text size, alignment, button links, photo descriptions, hidden sections).
  // Stored as one row per page: { list: [{ k: kind, s: scope, p: path, o: orig, size, align, href, alt, hide }] }
  const okHref = (v) => typeof v === 'string' && /^(https?:\/\/[^\s"'<>]+|mailto:[^\s"'<>]+|tel:[+\d\s()-]+|#[\w-]*|[\w-]+\.html(#[\w-]*)?)$/i.test(v);
  SC.okHref = okHref;
  const touched = new Set();
  SC.findItem = (kind, scope, path, orig, taken) => {
    const same = (it) => it.kind === kind && it.scope === scope && it.orig === orig && !(taken && taken.has(it));
    return SC.items.find((i) => same(i) && i.path === path) || SC.items.find(same);
  };
  SC.applySettings = (json) => {
    for (const it of touched) {
      it.el.classList.remove('ed-hidden'); it.el.style.zoom = ''; it.el.style.textAlign = '';
      const a = SC.linkOf(it); if (a && it.origHref !== undefined) a.setAttribute('href', it.origHref);
      if (it.origAlt !== undefined) it.el.setAttribute('alt', it.origAlt);
    }
    touched.clear();
    let cfg = {}; try { cfg = JSON.parse(json || '{}'); } catch (e) {}
    const map = new Map();
    for (const e of cfg.list || []) {
      const it = SC.findItem(e.k, e.s, e.p, e.o); if (!it) continue;
      map.set(it, e); touched.add(it);
      if (e.hide) it.el.classList.add('ed-hidden');
      if (e.size && e.size >= 0.6 && e.size <= 2) it.el.style.zoom = e.size;
      if (['left', 'center', 'right'].includes(e.align)) it.el.style.textAlign = e.align;
      const a = SC.linkOf(it);
      if (a && okHref(e.href)) { if (it.origHref === undefined) it.origHref = a.getAttribute('href'); a.setAttribute('href', e.href); }
      if (it.el.tagName === 'IMG' && typeof e.alt === 'string') { if (it.origAlt === undefined) it.origAlt = it.el.getAttribute('alt') || ''; it.el.setAttribute('alt', e.alt.slice(0, 300)); }
    }
    SC.settingsMap = map;
  };
  SC.apply = (rows) => {
    for (const it of SC.applied.keys()) SC.restore(it);
    SC.applied.clear();
    let theme = null, settings = null;
    for (const r of rows || []) {
      if (r.kind === 'theme' && r.scope === 'page') { if (r.page === here) settings = r.value; continue; }
      if (r.kind === 'theme') { theme = r.value; continue; }
      if (r.page !== here && r.page !== '*') continue;
      const same = (it) => it.kind === r.kind && it.scope === r.scope && it.orig === r.orig && !SC.applied.has(it);
      const it = SC.items.find((i) => same(i) && i.path === r.path) || SC.items.find(same);
      if (!it) continue;
      if (r.kind === 'text') SC.setText(it, sanitize(r.value)); else SC.setImg(it, r.value);
      SC.applied.set(it, r);
    }
    SC.applyTheme(theme);
    SC.applySettings(settings);
  };
  const CK = 'cpsc-site:' + (SC.editable ? here : '_');
  SC.load = async () => {
    if (!sb) return;
    const pages = [here, '*'];
    const { data, error } = await sb.from('site_content').select('key,kind,page,scope,path,orig,value').in('page', pages);
    if (error || !data) return;
    SC.rows = data;
    try { localStorage.setItem(CK, JSON.stringify(data)); } catch (e) {}
    SC.apply(data);
  };
  SC.items = collect();
  try { SC.apply(JSON.parse(localStorage.getItem(CK) || '[]')); } catch (e) {}   // last known edits right away, no flash
  SC.ready = SC.load().catch(() => {});

  // Memberships run through June 30 of the school year (dates are club time, Pacific)
  window.clubToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  window.memberActive = (until) => until == null || until >= clubToday(); // no date yet (before the membership update) = still active
  window.fmtDay = (d, long) => (d ? new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: long ? 'long' : 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '—');
  window.seasonEnd = () => { const [y, m] = clubToday().split('-').map(Number); return `${y + (m >= 6 ? 1 : 0)}-06-30`; }; // June 1 starts next year
  window.planName = (t) => (t === 'spring' ? 'Spring' : 'Full year');
  window.membershipText = (type, until) => (!until ? 'No membership on file'
    : memberActive(until) ? `${planName(type)} · valid through ${fmtDay(until)}` : `Expired · ended ${fmtDay(until)}`);
  window.partyName = (w) => String(w || 'Party').toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
  window.money = (cents) => '$' + (cents / 100).toFixed(2);
  window.$ = (s) => document.querySelector(s);
  window.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  window.showMsg = (el, text, ok) => { el.textContent = text; el.className = 'msg show ' + (ok ? 'ok' : 'err'); };
  window.fmtTime = (iso) => {
    if (!iso) return 'Never';
    const d = new Date(iso);
    const mins = Math.round((Date.now() - d) / 60000);
    const rel = mins < 1 ? 'just now' : mins < 60 ? `${mins} min ago` : mins < 1440 ? `${Math.round(mins / 60)} hr ago` : `${Math.round(mins / 1440)} days ago`;
    return `${d.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })} · ${rel}`;
  };
})();
