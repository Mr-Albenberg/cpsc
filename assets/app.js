// Shared code for every page: Supabase client, header, login checks, helpers.
(function () {
  const CFG = window.CPSC_CONFIG || {};
  const configured = !!(CFG.supabaseUrl && CFG.supabaseAnonKey &&
    !CFG.supabaseUrl.includes('YOUR-') && !CFG.supabaseAnonKey.includes('YOUR-'));

  window.sb = configured ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey) : null;
  window.FN_URL = configured ? CFG.supabaseUrl.replace(/\/$/, '') + '/functions/v1/wallet' : null;

  const here = location.pathname.split('/').pop() || 'index.html';

  function renderHeader(nav) {
    const links = {
      guest: [['index.html', 'Log in'], ['signup.html', 'Create account']],
      member: [['card.html', 'My card']],
      admin: [['card.html', 'My card'], ['admin.html', 'Members'], ['scan.html', 'Scan']],
    }[nav] || [];
    let header = document.querySelector('.site-header');
    if (!header) { header = document.createElement('header'); header.className = 'site-header'; document.body.prepend(header); }
    header.innerHTML = `<div class="inner">
      <a class="brand" href="${nav === 'guest' ? 'index.html' : 'card.html'}"><img src="img/logo.png" alt="" onerror="this.parentNode.classList.add('no-logo')"><span class="mark">CPSC</span><span>Central Pacific Ski Club</span></a>
      <nav class="nav">${links.map(([h, t]) => `<a href="${h}" class="${here === h ? 'active' : ''}">${t}</a>`).join('')}
      ${nav !== 'guest' ? '<button id="logout" type="button">Log out</button>' : ''}</nav></div>`;
    const lo = document.getElementById('logout');
    if (lo) lo.onclick = async () => { await sb.auth.signOut(); location.href = 'index.html'; };
  }

  function showSetup() {
    const main = document.querySelector('main');
    main.innerHTML = `<div class="setup"><h2>Almost there</h2>
      <p>This site isn't connected to its database yet. Open <code>config.js</code> in the GitHub repo and paste in your
      Supabase project URL and anon key (Supabase → Project Settings → API). See the README for the full setup.</p></div>`;
  }

  // need: 'guest' | 'member' | 'admin' | 'any'
  window.boot = async function (need) {
    renderHeader('guest');
    if (!sb) { showSetup(); throw new Error('not configured'); }
    const { data: { session } } = await sb.auth.getSession();
    if (need === 'any') return { session };
    if (need === 'guest') {
      if (session) { location.replace('card.html'); throw new Error('redirect'); }
      return {};
    }
    if (!session) { location.replace('index.html'); throw new Error('redirect'); }
    const { data: profile, error } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
    if (error || !profile) {
      await sb.auth.signOut();
      location.replace('index.html?gone=1');
      throw new Error('no profile');
    }
    if (need === 'admin' && !profile.is_admin) { location.replace('card.html'); throw new Error('redirect'); }
    renderHeader(profile.is_admin ? 'admin' : 'member');
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
