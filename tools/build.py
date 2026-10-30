HEAD = '''<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#ecffb0"><meta name="robots" content="noindex, nofollow">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Questrial&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/style.css"><link rel="icon" href="img/icon.png"><link rel="apple-touch-icon" href="img/apple-touch-icon.png">'''
SCRIPTS = '''<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="config.js"></script>
<script src="assets/app.js"></script>
<script src="assets/fx.js" defer></script>'''
FOOT = '''<footer class="site-footer">
  <img src="img/logo-white.png" alt="CPSC">
  <div class="tag">Live to ski, love to party</div>
  <nav class="links" aria-label="Central Pacific Ski Club">
    <a href="about.html">About</a>
    <a href="events.html">Events</a>
    <a href="big-trip.html">Big Trip 2027</a>
    <a href="ikon.html">Ikon Pass</a>
    <a href="sponsors.html">Sponsors</a>
    <a href="exec-board.html">Exec Board</a>
    <a href="join.html">Join</a>
    <a href="card.html">My Card</a>
  </nav>
  <div>Central Pacific Ski Club · San Luis Obispo · <a href="https://cpsconline.com" style="color:#fff">cpsconline.com</a></div>
</footer>'''

def page(fname, title, hero, main, script, extra_scripts='', main_class='', suffix='CPSC Membership'):
    html = f'''<!doctype html>
<html lang="en"><head>{HEAD}<title>{title} · {suffix}</title></head>
<body>
{hero}
<main{(' class="'+main_class+'"') if main_class else ''}>
{main}
</main>
{FOOT}
{extra_scripts}{SCRIPTS}
<script>
{script.strip()}
</script>
</body></html>
'''
    open(fname, 'w').write(html)

def hero(eyebrow, h1, p, h1_id='', photo=False):
    banner = '<div class="hero-photo" role="img" aria-label="Welcome to Central Pacific Ski Club"></div>' if photo else ''
    return banner + f'<section class="hero"><div class="eyebrow">{eyebrow}</div><h1{(" id="+chr(34)+h1_id+chr(34)) if h1_id else ""}>{h1}</h1><p>{p}</p></section>'

# ---------- Login ----------
page('login.html', 'Log in',
 hero('Live to ski, love to party', 'Member Login', "Your CPSC membership card, right in your phone's wallet.", photo=True),
 '''<form class="panel" id="f">
  <label for="email">Email or username</label><input type="text" id="email" autocomplete="username" autocapitalize="none" spellcheck="false" required>
  <label for="password">Password</label><input type="password" id="password" autocomplete="current-password" required>
  <button class="btn block" type="submit" id="go">Log in</button>
  <div class="msg" id="msg"></div>
  <p class="muted center" style="margin-top:18px"><button type="button" class="link-btn" id="forgot">Forgot password?</button></p>
  <p class="muted center">New member? <a href="signup.html">Create your account</a></p>
</form>''',
 r'''
boot('guest').then(() => {
  if (new URLSearchParams(location.search).get('next') === 'exec-board.html') showMsg($('#msg'), 'The Exec Board page is for members — log in to see it.', 'ok');
  if (new URLSearchParams(location.search).has('gone')) showMsg($('#msg'), 'That account has been removed. Ask an exec board member if this is a mistake.');
  $('#f').onsubmit = async (e) => {
    e.preventDefault(); $('#go').disabled = true;
    const id = $('#email').value.trim();
    const email = id.includes('@') ? id : id.toLowerCase() + '@example.com';   // demo usernames (admin, member1…)
    const { error } = await sb.auth.signInWithPassword({ email, password: $('#password').value });
    if (error) {
      $('#go').disabled = false;
      return showMsg($('#msg'), /confirm/i.test(error.message) ? 'Confirm your email first — check your inbox for the link.' : 'Wrong email/username or password.');
    }
    location.href = nextPage();
  };
  $('#forgot').onclick = async () => {
    const email = $('#email').value.trim();
    if (!email) return showMsg($('#msg'), 'Type your email above first, then tap "Forgot password?" again.');
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: new URL('reset.html', location.href).href });
    error ? showMsg($('#msg'), error.message) : showMsg($('#msg'), 'If that email has an account, a reset link is on its way.', true);
  };
}).catch(() => {});
''', main_class='narrow')

# ---------- Sign up ----------
page('signup.html', 'Create account',
 hero('Members only', 'Create Your Account', "Whether you're sending cliffs or just learning to ski, welcome. Use the email you joined CPSC with — only emails approved by the exec board can sign up.", photo=True),
 '''<form class="panel" id="f">
  <label>Your photo</label>
  <div class="photo-pick"><label for="photo" class="preview" id="preview" style="margin:0;cursor:pointer"></label>
    <div><label for="photo" class="btn ghost small" style="margin:0">Choose photo</label><div class="muted" style="margin-top:6px">A clear face photo — admins see it when they scan you in.</div></div>
    <input type="file" id="photo" accept="image/*"></div>
  <label for="name">Full name</label><input type="text" id="name" autocomplete="name" required maxlength="80">
  <label for="email">Email</label><input type="email" id="email" autocomplete="email" required>
  <label for="password">Password</label><input type="password" id="password" autocomplete="new-password" minlength="8" required>
  <button class="btn block" type="submit" id="go">Create account</button>
  <div class="msg" id="msg"></div>
  <p class="muted center" style="margin-top:18px">Already have one? <a href="login.html">Log in</a></p>
</form>''',
 r'''
boot('guest').then(() => {
  $('#photo').onchange = (e) => {
    const f = e.target.files[0];
    if (f) { $('#preview').style.backgroundImage = 'url(' + URL.createObjectURL(f) + ')'; $('#preview').style.borderStyle = 'solid'; }
  };
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    const name = $('#name').value.trim(), email = $('#email').value.trim().toLowerCase(), password = $('#password').value;
    const file = $('#photo').files[0];
    if (!file) return showMsg($('#msg'), 'Please add a photo of yourself for your card.');
    if (password.length < 8) return showMsg($('#msg'), 'Password must be at least 8 characters.');
    $('#go').disabled = true;
    try {
      const { data: ok } = await sb.rpc('is_email_approved', { p_email: email });
      if (!ok) throw new Error("That email isn't on the approved member list yet. Ask an exec board member to approve it, then try again.");
      const files = await makePhotoFiles(file);
      const { data, error } = await sb.auth.signUp({
        email, password, options: { data: { name }, emailRedirectTo: new URL('card.html', location.href).href },
      });
      if (error) {
        if (/database error/i.test(error.message)) throw new Error("That email isn't on the approved member list yet.");
        if (/registered|exists/i.test(error.message)) throw new Error('An account with that email already exists. Try logging in.');
        throw error;
      }
      if (data.session) {
        await uploadPhotoFiles(data.user.id, files);
        location.href = 'card.html';
      } else {
        showMsg($('#msg'), 'Almost done! Check your email and tap the confirmation link, then log in. You\'ll add your photo again on your card page.', true);
        $('#f').querySelectorAll('input').forEach((i) => (i.disabled = true));
      }
    } catch (err) { showMsg($('#msg'), err.message || 'Something went wrong.'); $('#go').disabled = false; }
  };
}).catch(() => {});
''', main_class='narrow')

# ---------- Reset password ----------
page('reset.html', 'Reset password',
 hero('Account', 'New Password', 'Choose a new password for your CPSC account.'),
 '''<form class="panel" id="f">
  <label for="password">New password</label><input type="password" id="password" autocomplete="new-password" minlength="8" required>
  <button class="btn block" type="submit" id="go">Save password</button>
  <div class="msg" id="msg"></div>
</form>''',
 r'''
boot('any').then(async () => {
  await new Promise((r) => setTimeout(r, 300)); // let Supabase finish reading the email link
  const { data: { session } } = await sb.auth.getSession();
  if (!session) showMsg($('#msg'), 'This reset link has expired. Go back to the login page and request a new one.');
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    const { error } = await sb.auth.updateUser({ password: $('#password').value });
    if (error) return showMsg($('#msg'), error.message);
    showMsg($('#msg'), 'Password updated. Taking you to your card…', true);
    setTimeout(() => (location.href = 'card.html'), 1200);
  };
}).catch(() => {});
''', main_class='narrow')

# ---------- Card ----------
page('card.html', 'My card',
 hero('Your membership', 'Hey there', 'Add your card to your wallet and show the QR code at events and trips.', 'hi'),
 '''<div class="grid">
  <div class="panel">
    <div class="notice" id="needPhoto" style="display:none"><strong>Add your photo to finish your card</strong>Admins see it when they scan you in. Use "Choose photo" on this page.</div>
    <div class="member-card">
      <div class="top"><img class="card-logo" src="img/logo-white.png" alt="CPSC"><small>MEMBERSHIP CARD</small></div>
      <div class="who"><img id="photo" alt=""><div><div class="label" id="role">MEMBER</div><div class="name" id="name"></div><div class="memno" id="memno"></div></div></div>
      <div class="qr"><div id="qr"></div></div>
      <div class="live-strip" id="live">
        <div class="live-row"><span class="live-dot"></span><span>LIVE</span><span class="live-clock" id="liveClock">--:--:--</span></div>
        <div class="live-code" id="liveCode">…</div>
        <div class="live-date" id="liveDate"></div>
      </div>
      <div class="foot">Live to ski · Love to party</div>
    </div>
    <div class="wallet-buttons">
      <a class="wallet-btn disabled" id="apple" href="#"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.37 12.6c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.82-.81-3-.79-1.54.02-2.96.9-3.76 2.27-1.6 2.78-.41 6.9 1.15 9.16.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.23-.02 2.01-1.12 2.76-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.4-.92-2.42-3.66zM14.1 5.86c.63-.77 1.06-1.83.94-2.89-.91.04-2.02.61-2.67 1.37-.58.67-1.1 1.76-.96 2.8 1.02.08 2.06-.52 2.7-1.28z"/></svg>Add to Apple Wallet</a>
      <a class="wallet-btn disabled" id="google" href="#"><svg viewBox="0 0 24 24"><path fill="#4285F4" d="M3 6.5A2.5 2.5 0 0 1 5.5 4h13A2.5 2.5 0 0 1 21 6.5V9H3z"/><path fill="#34A853" d="M3 9h18v3H3z"/><path fill="#FBBC04" d="M3 12h18v3H3z"/><path fill="#EA4335" d="M3 15h18v2.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/></svg>Add to Google Wallet</a>
    </div>
    <p class="muted center" style="margin-top:12px">You can also just show the QR code on this page.</p>
    <div class="msg" id="wmsg"></div>
  </div>
  <div class="sheet-backdrop" id="guide" hidden>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="guideTitle">
      <button class="sheet-close" type="button" id="guideClose" aria-label="Close">✕</button>
      <h2 id="guideTitle">Add to Wallet</h2>
      <p class="muted" id="guideIntro"></p>
      <button class="btn block" type="button" id="saveImg" style="margin-top:6px">Save card image</button>
      <p class="muted center" id="saveNote" style="margin:8px 0 0"></p>
      <ol class="steps" id="guideSteps"></ol>
    </div>
  </div>
  <div class="panel">
    <h2>Profile</h2>
    <p class="muted" id="email"></p>
    <label>Photo</label>
    <div class="photo-pick"><label for="newphoto" class="btn ghost small" style="margin:0">Choose photo</label><input type="file" id="newphoto" accept="image/*"></div>
    <div class="msg" id="msg"></div>
    <p class="muted" style="margin-top:18px">Your wallet pass updates on its own — no need to re-add it.</p>
  </div>
</div>''',
 r'''
let me;
async function loadPhoto() {
  const url = await signedPhoto(me.session.user.id);
  $('#photo').src = url || 'img/logo.png';
  $('#needPhoto').style.display = url ? 'none' : 'block';
}

const GUIDES = {
  apple: {
    intro: 'Apple Wallet can make a pass from a picture of your QR code (iPhone with iOS 27 or later).',
    steps: [
      'Tap <b>Save card image</b> above, then <b>Save Image</b> so it goes to Photos.',
      'Open the <b>Wallet</b> app and tap <b>+</b>.',
      'Tap <b>Create a Pass</b>, then choose to add it from a photo and pick the image you just saved.',
      'Pick the <b>Membership</b> template, name it <b>CPSC</b>, and tap the ✓.',
    ],
  },
  google: {
    intro: 'Google Wallet can make a pass from a picture of your QR code (Android).',
    steps: [
      'Tap <b>Save card image</b> above so it saves to your photos.',
      'Open <b>Google Wallet</b> and tap <b>Add to Wallet</b>.',
      'Choose <b>Everything else</b>, accept the prompt, and pick the image you just saved.',
      'Check the details (name it <b>CPSC Membership</b>) and tap <b>Add</b>.',
    ],
  },
};
function openGuide(kind) {
  const g = GUIDES[kind];
  $('#guideTitle').textContent = kind === 'apple' ? 'Add to Apple Wallet' : 'Add to Google Wallet';
  $('#guideIntro').textContent = g.intro;
  $('#guideSteps').innerHTML = g.steps.map((t, i) => `<li><span>${i + 1}</span><div>${t}</div></li>`).join('');
  $('#saveNote').textContent = '';
  $('#guide').hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeGuide() { $('#guide').hidden = true; document.body.style.overflow = ''; }

// A clean image of the card: big QR on white so the phone's scanner reads it reliably.
async function cardImageBlob() {
  const qr = $('#qr canvas');
  const W = 900, H = 1240, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  await document.fonts.load('80px "Bebas Neue"').catch(() => {});
  const logo = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = 'img/logo-white.png'; });
  x.fillStyle = '#121212'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#ecffb0'; x.fillRect(0, 0, W, 14);
  if (logo) { const lw = 300, lh = lw * logo.height / logo.width; x.drawImage(logo, (W - lw) / 2, 50, lw, lh); }
  x.textAlign = 'center';
  x.fillStyle = '#ffffff'; x.font = '84px "Bebas Neue", Impact, sans-serif';
  x.fillText(me.profile.name.toUpperCase().slice(0, 24), W / 2, 285);
  x.fillStyle = '#ffffff'; x.beginPath(); x.roundRect(130, 330, 640, 640, 30); x.fill();
  x.imageSmoothingEnabled = false;
  x.drawImage(qr, 165, 365, 570, 570);
  x.fillStyle = '#ecffb0'; x.font = '58px "Bebas Neue", Impact, sans-serif';
  x.fillText('LIVE TO SKI, LOVE TO PARTY', W / 2, 1075);
  x.fillStyle = '#9a9a9a'; x.font = '34px "Bebas Neue", Impact, sans-serif';
  x.fillText('CENTRAL PACIFIC SKI CLUB · MEMBERSHIP CARD', W / 2, 1140);
  return new Promise((r) => c.toBlob(r, 'image/png'));
}
async function saveCardImage() {
  const blob = await cardImageBlob();
  const file = new File([blob], 'cpsc-membership-card.png', { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'CPSC membership card' }); $('#saveNote').textContent = 'Saved? Now follow the steps below.'; return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
  $('#saveNote').textContent = 'Image downloaded. Now follow the steps below.';
}
async function walletLink(kind) {
  try {
    const { data: { session } } = await sb.auth.getSession();
    const r = await fetch(FN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token }, body: JSON.stringify({ kind }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.url) throw new Error(d.error || 'Could not create the wallet pass.');
    location.href = d.url;
  } catch (err) { showMsg($('#wmsg'), err.message); }
}
boot('member').then(async (ctx) => {
  me = ctx;
  const p = ctx.profile;
  $('#hi').textContent = 'Hey, ' + p.name.split(' ')[0];
  $('#name').textContent = p.name;
  $('#email').textContent = p.email;
  $('#role').textContent = p.is_admin ? 'EXEC BOARD' : 'SKI CLUB MEMBER';
  const yr = new Date(p.created_at).getFullYear();
  if (p.member_no) $('#memno').textContent = 'MEMBER #' + String(p.member_no).padStart(4, '0') + (yr ? ' · SINCE ' + yr : '');
  new QRCode($('#qr'), { text: 'CPSC1:' + p.serial, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M });
  loadPhoto();

  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) $('#google').style.display = 'none';
  if (/Android/.test(ua)) $('#apple').style.display = 'none';
  let status = {};
  try { status = await (await fetch(FN_URL + '?status=1')).json(); } catch {}
  // Official signed passes when the wallet keys are set up; otherwise the free "add from a picture" route.
  for (const kind of ['apple', 'google']) {
    const btn = $('#' + kind);
    btn.classList.remove('disabled');
    btn.onclick = (e) => { e.preventDefault(); status[kind] ? walletLink(kind) : openGuide(kind); };
  }
  $('#guideClose').onclick = closeGuide;
  $('#guide').onclick = (e) => { if (e.target.id === 'guide') closeGuide(); };
  $('#saveImg').onclick = saveCardImage;

  $('#newphoto').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      await uploadPhotoFiles(p.id, await makePhotoFiles(f)); await loadPhoto(); showMsg($('#msg'), 'Photo saved.', true);
      fnCall({ kind: 'sync' }).catch(() => {}); // refresh their wallet pass in place
    } catch (err) { showMsg($('#msg'), err.message); }
  };

  // Live security strip: ticking clock + current check-in code. A screenshot can't keep up.
  const tick = () => {
    const d = new Date();
    $('#liveClock').textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
    $('#liveDate').textContent = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  };
  tick(); setInterval(tick, 1000);
  const loadCode = async () => { const c = await getWeekCode(); if (c) $('#liveCode').textContent = c.text; };
  loadCode(); setInterval(loadCode, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadCode(); });
}).catch(() => {});
''', extra_scripts='<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>\n')

# ---------- Admin ----------
page('admin.html', 'Members',
 hero('Exec board', 'Members', "Approve emails so people can sign up, and see who's been scanned in."),
 '''<div class="panel code-panel">
    <div class="code-now">
      <div class="code-eyebrow">This week's check-in code</div>
      <div class="code-big" id="codeNow">…</div>
      <div class="muted" id="codeMeta"></div>
      <p class="muted" style="margin-top:12px">Real cards show this word in the top-right corner of the wallet pass, and on the live website card. A card with an old word, or none, is a copy.</p>
      <div class="test-box">
        <div class="code-eyebrow">Test on your phone</div>
        <p class="muted">Changes the word on <b>your own</b> wallet pass only, so you can watch it update without re-adding. Then put the real code back.</p>
        <div class="test-actions">
          <button type="button" class="btn dark small" id="tsend">Send test word to my pass</button>
          <button type="button" class="btn ghost small" id="trestore">Put the real code back</button>
        </div>
        <div class="msg" id="tmsg"></div>
      </div>
    </div>
    <form class="code-form" id="cf">
      <label for="cword">New code word</label>
      <div class="code-input"><input type="text" id="cword" maxlength="14" autocomplete="off" placeholder="e.g. BLUEBIRD"><button type="button" class="btn ghost small" id="crand">Random</button></div>
      <button class="btn block" type="submit" id="csave">Save &amp; update all passes</button>
      <p class="muted center" id="cnote" style="margin:10px 0 0"></p>
      <div class="msg" id="cmsg"></div>
    </form>
  </div>
  <div class="grid">
    <form class="panel" id="af">
      <h2>Approve emails</h2>
      <p class="muted">Paste one or many — separated by commas, spaces or new lines.</p>
      <textarea id="emails" rows="5" placeholder="jane@calpoly.edu, sam@gmail.com"></textarea>
      <label for="note">Note (optional)</label><input type="text" id="note" placeholder="e.g. Paid dues Fall 2026">
      <button class="btn block" type="submit">Approve</button>
      <div class="msg" id="amsg"></div>
    </form>
    <div class="panel">
      <div class="toolbar"><h2 style="margin:0">Approved list</h2><input type="search" id="aq" placeholder="Search…"></div>
      <div class="table-wrap" style="max-height:340px;overflow-y:auto"><table><thead><tr><th>Email</th><th>Status</th><th></th></tr></thead><tbody id="approved"></tbody></table></div>
    </div>
  </div>
  <div class="panel">
    <div class="toolbar"><h2 style="margin:0">Members <span class="pill" id="count"></span></h2><input type="search" id="mq" placeholder="Search members…"></div>
    <ul class="member-list" id="members"></ul>
  </div>''',
 r'''
let approved = [], members = [], avatars = {}, myId;
const registered = () => new Set(members.map((m) => m.email));
function drawApproved() {
  const q = $('#aq').value.toLowerCase(), reg = registered();
  $('#approved').innerHTML = approved.filter((a) => a.email.includes(q)).map((a) => `<tr>
    <td>${esc(a.email)}${a.note ? `<div class="muted">${esc(a.note)}</div>` : ''}</td>
    <td>${reg.has(a.email) ? '<span class="pill ok">Signed up</span>' : '<span class="pill">Waiting</span>'}</td>
    <td style="text-align:right"><button class="btn danger small" data-unapprove="${esc(a.email)}">Remove</button></td></tr>`).join('')
    || '<tr><td colspan="3" class="muted">No approved emails yet.</td></tr>';
}
function drawMembers() {
  const q = $('#mq').value.toLowerCase();
  $('#count').textContent = members.length;
  const ini = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  $('#members').innerHTML = members.filter((m) => (m.name + ' ' + m.email).toLowerCase().includes(q)).map((m) => {
    const today = m.last_scan && Date.now() - Date.parse(m.last_scan) < 864e5;
    const last = m.last_scan ? (today ? 'In today' : fmtTime(m.last_scan).split(' · ').pop()) : 'Never in';
    return `<li>
      <span class="av">${avatars[m.id] ? `<img src="${avatars[m.id]}" alt="">` : esc(ini(m.name))}</span>
      <span class="who"><strong>${esc(m.name)}</strong><small>${esc(m.email)}</small></span>
      <span class="meta">
        <span class="nr">${m.is_admin ? '<i class="role-exec">Admin</i>' : ''}${m.member_no ? `<b>#${String(m.member_no).padStart(4, '0')}</b>` : ''}</span>
        <i class="st ${today ? 'today' : m.last_scan ? '' : 'new'}" title="${m.last_scan ? esc(fmtTime(m.last_scan)) : ''}">${last} · ${m.scan_count} check-in${m.scan_count == 1 ? '' : 's'}</i>
      </span>
      ${m.id === myId ? '<span class="acts"><span class="muted">You</span></span>' : `<span class="acts">
        <button class="btn ghost small" data-admin="${m.id}" data-to="${m.is_admin ? 0 : 1}">${m.is_admin ? 'Remove admin' : 'Make admin'}</button>
        <button class="btn danger small" data-del="${m.id}" data-name="${esc(m.name)}">Remove</button></span>`}
    </li>`;
  }).join('') || '<li class="none">No members match.</li>';
}
async function load() {
  const [a, m] = await Promise.all([
    sb.from('approved_emails').select('*').order('added_at', { ascending: false }),
    sb.rpc('admin_members'),
  ]);
  approved = a.data || []; members = m.data || [];
  const { data: nos } = await sb.from('profiles').select('id,member_no');
  const noOf = Object.fromEntries((nos || []).map((r) => [r.id, r.member_no]));
  members.forEach((x) => { x.member_no = noOf[x.id] ?? x.member_no; });
  drawApproved(); drawMembers();
  if (members.length) {
    const { data } = await sb.storage.from('photos').createSignedUrls(members.map((x) => `${x.id}/thumb.png`), 3600);
    (data || []).forEach((d) => { if (d.signedUrl) avatars[d.path.split('/')[0]] = d.signedUrl; });
    drawMembers();
  }
}
const CODE_WORDS = ['POWDER', 'BLUEBIRD', 'GNARLY', 'CORDUROY', 'FIRST CHAIR', 'FRESH TRACKS', 'SEND IT', 'APRES', 'FACE SHOT', 'YARD SALE', 'HOT LAPS', 'GONDOLA', 'MOGUL', 'SKI BUM', 'PARK RAT', 'TREE RUN', 'COLD SMOKE', 'SNOWBALL', 'GROOMER', 'FROSTBITE'];
let passCount = 0;
async function loadCode() {
  const c = await getWeekCode();
  if (!c) return;
  $('#codeNow').textContent = c.text;
  $('#codeMeta').textContent = 'Set ' + fmtTime(c.updatedAt);
  let applePhones = 0;
  try { const n = await fnCall({ kind: 'count' }); passCount = n.passes || 0; applePhones = n.applePhones || 0; } catch { passCount = 0; }
  window.__applePhones = applePhones;
  const parts = [];
  if (applePhones) parts.push(`${applePhones} iPhone${applePhones === 1 ? '' : 's'} with the card update right away (free, no limit)`);
  if (passCount) parts.push(`${passCount} other pass${passCount === 1 ? '' : 'es'} use ${passCount} of your 1,000 free monthly WalletWallet updates`);
  $('#cnote').textContent = parts.length ? parts.join(' · ') + '.' : 'No one has added a wallet pass yet. The website card updates right away.';
}
boot('admin').then(({ profile }) => {
  myId = profile.id;
  $('#aq').oninput = drawApproved; $('#mq').oninput = drawMembers;
  loadCode();
  $('#crand').onclick = () => {
    const cur = $('#codeNow').textContent;
    let w; do { w = CODE_WORDS[Math.floor(Math.random() * CODE_WORDS.length)]; } while (cur.toUpperCase() === w && CODE_WORDS.length > 1);
    $('#cword').value = w;
  };
  const busyBtn = (id, on, label) => { const el = $(id); el.disabled = on; if (label) el.textContent = label; };
  $('#tsend').onclick = async () => {
    busyBtn('#tsend', true, 'Sending…');
    try {
      const r = await fnCall({ kind: 'test', action: 'send' });
      showMsg($('#tmsg'), r.phones
        ? `Sent "${r.code}" to your pass and notified ${r.phones} phone${r.phones === 1 ? '' : 's'}. Open Wallet — it should change within a minute, no re-adding. Google Wallet updates on its own too.`
        : `Sent "${r.code}", but no iPhone is signed up for updates on your pass yet. In Wallet, open the pass → ⋯ → Pass Details and make sure Automatic Updates is on. If it still doesn't change, tap Add to Apple Wallet on your card page once — after that, updates arrive on their own.`, !!r.phones);
    } catch (err) { showMsg($('#tmsg'), err.message); }
    busyBtn('#tsend', false, 'Send test word to my pass');
  };
  $('#trestore').onclick = async () => {
    busyBtn('#trestore', true, 'Putting back…');
    try { const r = await fnCall({ kind: 'test', action: 'restore' }); showMsg($('#tmsg'), `Put "${r.code}" back on your pass.`, true); }
    catch (err) { showMsg($('#tmsg'), err.message); }
    busyBtn('#trestore', false, 'Put the real code back');
  };
  $('#cf').onsubmit = async (e) => {
    e.preventDefault();
    const word = $('#cword').value.trim();
    if (word.length < 2) return showMsg($('#cmsg'), 'Type a code word (2–14 characters) or tap Random.');
    $('#csave').disabled = true; $('#csave').textContent = 'Saving…';
    try {
      const { error } = await sb.rpc('set_week_code', { p_word: word, p_emoji: '' });
      if (error) throw new Error(error.message);
      let msg = 'Code saved. The live website card shows it now.';
      if (passCount || window.__applePhones) {
        $('#csave').textContent = 'Updating passes…';
        const r = await fnCall({ kind: 'refresh' });
        msg = `Code saved and ${r.updated} wallet pass${r.updated === 1 ? '' : 'es'} updated` + (r.phones ? ` (${r.phones} phone${r.phones === 1 ? '' : 's'} notified)` : '') + '.';
        if (r.quotaHit) msg += ' Some passes weren\'t updated because the free monthly limit was reached.';
        else if (r.failed) msg += ` ${r.failed} couldn't be updated — try saving again in a minute.`;
      }
      showMsg($('#cmsg'), msg, true);
      $('#cword').value = '';
      loadCode();
    } catch (err) { showMsg($('#cmsg'), err.message); }
    $('#csave').disabled = false; $('#csave').textContent = 'Save & update all passes';
  };
  $('#af').onsubmit = async (e) => {
    e.preventDefault();
    const emails = [...new Set($('#emails').value.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)))];
    if (!emails.length) return showMsg($('#amsg'), 'No valid emails found.');
    const before = new Set(approved.map((a) => a.email));
    const rows = emails.filter((x) => !before.has(x)).map((email) => ({ email, note: $('#note').value.trim() || null, added_by: profile.email }));
    if (rows.length) {
      const { error } = await sb.from('approved_emails').insert(rows);
      if (error) return showMsg($('#amsg'), error.message);
    }
    const skipped = emails.length - rows.length;
    showMsg($('#amsg'), `Approved ${rows.length} email${rows.length === 1 ? '' : 's'}${skipped ? ` (${skipped} already on the list)` : ''}.`, true);
    $('#emails').value = ''; load();
  };
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    let res;
    if (b.dataset.unapprove) {
      if (!confirm(`Remove ${b.dataset.unapprove} from the approved list? (Existing accounts are not deleted.)`)) return;
      res = await sb.from('approved_emails').delete().eq('email', b.dataset.unapprove);
    } else if (b.dataset.del) {
      if (!confirm(`Remove ${b.dataset.name}'s account? Their card will stop scanning as valid.`)) return;
      await fnCall({ kind: 'revoke', userId: b.dataset.del }).catch(() => {}); // void their wallet pass
      await sb.storage.from('photos').remove([`${b.dataset.del}/photo.jpg`, `${b.dataset.del}/thumb.png`, `${b.dataset.del}/wallet.json`, `${b.dataset.del}/pass.pkpass`]);
      res = await sb.rpc('delete_member', { p_id: b.dataset.del });
    } else if (b.dataset.admin) {
      res = await sb.rpc('set_admin', { p_id: b.dataset.admin, p_value: b.dataset.to === '1' });
    } else return;
    if (res.error) alert(res.error.message); else load();
  });
  load();
}).catch(() => {});
''')

# ---------- Scan ----------
page('scan.html', 'Scan',
 hero('Check-in', 'Scan a Card', "Point the camera at a member's wallet QR code."),
 """<div class="scanner">
  <div class="code-chip" id="scanCode">Check-in code: …</div>
  <div class="lookup">
    <label for="q" class="sr">Find a member by name or email</label>
    <input id="q" type="search" placeholder="Search name or email…" autocomplete="off" enterkeyhint="search">
    <ul class="lookup-list" id="results" role="listbox" aria-label="Matching members" hidden></ul>
  </div>
  <div class="panel" style="padding:14px">
    <div id="reader"></div>
    <div class="center" id="startWrap" style="margin-top:12px" hidden><p class="hint" id="camMsg" style="margin:0 0 10px"></p><button class="btn" id="start" type="button">Start camera</button></div>
    <p class="hint center" id="ready" hidden>Ready — hold a pass in front of the camera.</p>
    <div class="sound-test"><span>Gate sounds:</span><button class="btn ghost" type="button" id="sGood">▶ Valid</button><button class="btn ghost" type="button" id="sBad">▶ Rejected</button></div>
    <details class="manual"><summary>No camera? Upload a photo of the QR code</summary>
      <input type="file" id="qrfile" accept="image/*"></details>
  </div>
</div>
<div class="scan-overlay" id="overlay" role="dialog" aria-modal="true" aria-labelledby="ovTitle" hidden>
  <div class="ov-body">
    <div class="ov-icon" id="ovIcon" aria-hidden="true"></div>
    <div class="ov-title" id="ovTitle"></div>
    <div class="ov-sub" id="ovSub"></div>
    <div class="ov-member" id="ovMember">
      <img id="ovPhoto" alt="">
      <div><div class="ov-name" id="ovName"></div><div class="ov-num" id="ovNum"></div></div>
    </div>
  </div>
  <div class="ov-actions">
    <button class="btn ov-info" id="ovInfo" type="button">Info</button>
    <div class="ov-tap">Tap anywhere to scan the next pass</div>
  </div>
</div>
<div class="info-sheet" id="sheet" role="dialog" aria-modal="true" aria-labelledby="shName" hidden>
  <div class="sheet-card">
    <div class="sheet-status" id="shStatus"></div>
    <img id="shPhoto" alt="">
    <div class="name" id="shName"></div>
    <div class="rnum" id="shNum"></div>
    <dl class="profile" id="shProfile"></dl>
    <div class="code-check" id="shCode"></div>
    <div class="sheet-actions">
      <button class="btn ghost" id="shBack" type="button">Back</button>
      <button class="btn dark" id="shNext" type="button">Scan next</button>
      <button class="btn dark" id="shCheck" type="button" hidden>Check in</button>
    </div>
  </div>
</div>""",
 r"""
boot('admin').then(() => {
  const scanner = new Html5Qrcode('reader');
  let weekCode = null, busy = false, last = null;
  const loadCode = async () => { weekCode = await getWeekCode(); if (weekCode) $('#scanCode').innerHTML = 'Real cards show <b>' + esc(weekCode.text) + '</b> in the top corner'; };
  loadCode(); setInterval(loadCode, 60000);
  // Ski-lift gate sounds (synthesized, no audio files): good = bright "bee-BEEP", bad = low double buzz
  let actx = null;
  const audio = () => {
    if (!actx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) actx = new AC(); }
    if (actx?.state === 'suspended') actx.resume();
    return actx;
  };
  // iPhone only allows sound after a tap, so unlock on the first touch/click
  ['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, function unlock() {
    const c = audio(); if (c) { const s = c.createBufferSource(); s.buffer = c.createBuffer(1, 1, 22050); s.connect(c.destination); s.start(); }
    document.removeEventListener(ev, unlock);
  }, { once: true }));
  function tone(c, t, freq, dur, type, vol, endFreq) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.linearRampToValueAtTime(endFreq, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.setValueAtTime(vol, t + dur - 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.__out); o.start(t); o.stop(t + dur + 0.02);
  }
  function out(c) {
    if (!c.__out) { // gentle lowpass + compressor so it sounds like a gate speaker, not a raw synth
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 5200;
      const k = c.createDynamicsCompressor(); f.connect(k); k.connect(c.destination); c.__out = f;
    }
  }
  const SOUNDS = {
    good(c, t) { // two quick bright chirps, rising — the "go ahead" gate beep
      tone(c, t, 2093, 0.085, 'square', 0.22); tone(c, t, 4186, 0.085, 'sine', 0.06);
      tone(c, t + 0.115, 2794, 0.20, 'square', 0.22); tone(c, t + 0.115, 5588, 0.20, 'sine', 0.05);
    },
    bad(c, t) { // low, harsh double buzz — the "stop, see the window" reject
      for (const s of [0, 0.26]) { tone(c, t + s, 240, 0.21, 'sawtooth', 0.32, 200); tone(c, t + s, 247, 0.21, 'square', 0.16, 205); }
    },
  };
  // Real gate recordings in sounds/ (valid = ski-pass gate scanner; invalid = matching reject tone)
  const buffers = {};
  const loadSounds = async () => {
    const c = audio(); if (!c) return;
    for (const k of ['valid', 'invalid']) {
      if (buffers[k]) continue;
      try { const r = await fetch('sounds/gate-' + k + '.mp3'); buffers[k] = await c.decodeAudioData(await r.arrayBuffer()); } catch {}
    }
  };
  const beep = (ok) => {
    try {
      const c = audio(); if (!c) return;
      const buf = buffers[ok ? 'valid' : 'invalid'];
      if (buf) { const s = c.createBufferSource(); s.buffer = buf; s.connect(c.destination); s.start(); }
      else { out(c); SOUNDS[ok ? 'good' : 'bad'](c, c.currentTime + 0.02); loadSounds(); }
    } catch {}
    navigator.vibrate?.(ok ? 90 : [180, 80, 180]);
  };
  document.addEventListener('pointerdown', () => loadSounds(), { once: true });
  window.testSound = beep;
  const row = (k, v) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`;
  const ICON = { ok: '✓', warn: '!', bad: '✕', look: '⌕' };

  function show(state, title, sub, m, photo) {
    last = { state, title, sub, m, photo };
    const ov = $('#overlay');
    ov.className = 'scan-overlay ' + state; ov.hidden = false;
    $('#ovIcon').textContent = ICON[state];
    $('#ovTitle').textContent = title;
    $('#ovSub').textContent = sub || '';
    $('#ovMember').style.display = m ? '' : 'none';
    $('#ovInfo').style.display = m ? '' : 'none';
    if (m) {
      $('#ovName').textContent = m.name;
      $('#ovNum').textContent = numLine(m);
      $('#ovPhoto').style.visibility = photo ? '' : 'hidden';
      if (photo) $('#ovPhoto').src = photo;
    }
    document.body.classList.add('no-scroll');
  }
  const numLine = (m) => [m.memberNo ? '#' + String(m.memberNo).padStart(4, '0') : '', m.isAdmin ? 'Exec board' : 'Member'].filter(Boolean).join(' · ');

  function openInfo() {
    const { state, title, m, photo, r } = last;
    $('#shStatus').className = 'sheet-status ' + state;
    $('#shStatus').textContent = ICON[state] + ' ' + title;
    $('#shPhoto').style.display = photo ? '' : 'none';
    if (photo) $('#shPhoto').src = photo;
    $('#shName').textContent = m.name;
    $('#shNum').textContent = numLine(m);
    $('#shProfile').innerHTML =
      row('Email', m.email) +
      row('Member since', m.since ? new Date(m.since).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '—') +
      row('Last scanned', r.lastScan ? fmtTime(r.lastScan) + (r.lastScannedBy ? ' by ' + r.lastScannedBy : '') : 'Never (this is the first)') +
      row('Check-ins', r.totalScans + ' total' + (r.scansLast24h ? ` · ${r.scansLast24h + 1} in the last 24 h` : '')) +
      row('Role', m.isAdmin ? 'Exec board / admin' : 'Member');
    $('#shCode').innerHTML = weekCode ? 'Their card should show <b>' + esc(weekCode.text) + '</b> in the top corner, a live ticking clock on the website card, and match this photo.' : 'Make sure the photo matches the person.';
    const look = state === 'look';
    $('#shBack').hidden = look; $('#shNext').textContent = look ? 'Close' : 'Scan next'; $('#shNext').className = 'btn ' + (look ? 'ghost' : 'dark');
    $('#shCheck').hidden = !look;
    $('#overlay').hidden = true;
    $('#sheet').hidden = false;
    document.body.classList.add('no-scroll');
  }

  function bad(text) { show('bad', 'Not valid', text); beep(false); }

  async function onScan(code) {
    if (busy) return; busy = true;
    try { scanner.pause(true); } catch {}
    const { data: r, error } = await sb.rpc('scan_card', { p_code: code });
    if (error) return bad(error.message);
    if (!r.valid) return bad(r.error);
    const m = r.member;
    const photo = await signedPhoto(m.id).catch(() => null);
    if (r.scannedWithin24h) show('warn', 'Already checked in', 'Valid member, but this card was scanned ' + fmtTime(r.lastScan).split(' · ')[1] + (r.lastScannedBy ? ' by ' + r.lastScannedBy : '') + '.', m, photo);
    else show('ok', 'Valid member', r.lastScan ? 'First check-in today.' : 'First check-in ever — welcome!', m, photo);
    last.r = r;
    beep(!r.scannedWithin24h);
  }

  function next() {
    $('#overlay').hidden = true; $('#sheet').hidden = true;
    document.body.classList.remove('no-scroll');
    busy = false; last = null;
    try { scanner.resume(); } catch {}
  }
  $('#overlay').onclick = next;
  $('#ovInfo').onclick = (e) => { e.stopPropagation(); openInfo(); };
  $('#shNext').onclick = next;
  $('#shBack').onclick = () => { $('#sheet').hidden = true; $('#overlay').hidden = false; };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#sheet').hidden) (last?.state === 'look' ? next() : $('#shBack').click());
    else if ((e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') && !$('#overlay').hidden) { e.preventDefault(); next(); }
  });

  $('#qrfile').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const text = await scanner.scanFile(f, false); busy = false; onScan(text); }
    catch { busy = true; bad("Couldn't find a QR code in that picture."); }
    e.target.value = '';
  };
  $('#sGood').onclick = () => beep(true);
  $('#sBad').onclick = () => beep(false);
  // Camera starts by itself; the button only shows if the browser blocked it
  async function startCamera() {
    audio(); loadSounds();
    const slow = setTimeout(() => { if ($('#ready').hidden) { $('#startWrap').hidden = false; $('#camMsg').textContent = 'Waiting for the camera… if nothing happens, allow camera access and tap Start camera.'; } }, 6000);
    try {
      await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: (w, h) => { const s = Math.floor(Math.min(w, h) * 0.7); return { width: s, height: s }; } }, onScan);
      clearTimeout(slow); $('#startWrap').hidden = true; $('#ready').hidden = false;
    } catch (e) {
      clearTimeout(slow);
      $('#startWrap').hidden = false;
      $('#camMsg').textContent = /NotAllowed|Permission/i.test(String(e)) ? 'Camera access is blocked — allow it for this site, then tap Start camera.' : 'Tap to start the camera.';
    }
  }
  $('#start').onclick = startCamera;
  startCamera();

  // Look up a member by name or email
  let members = null;
  const loadMembers = async () => {
    if (members) return members;
    const [{ data: profs }, { data: stats }] = await Promise.all([
      sb.from('profiles').select('id,name,email,is_admin,serial,member_no,created_at'),
      sb.rpc('admin_members'),
    ]);
    const st = Object.fromEntries((stats || []).map((s) => [s.id, s]));
    members = (profs || []).map((p) => ({ ...p, last_scan: st[p.id]?.last_scan || null, scan_count: st[p.id]?.scan_count || 0 }));
    return members;
  };
  const norm = (s) => (s || '').toLowerCase();
  let qTimer;
  $('#q').addEventListener('focus', loadMembers, { once: true });
  $('#q').oninput = () => { clearTimeout(qTimer); qTimer = setTimeout(search, 120); };
  // Member photos for the result list (signed links, cached)
  const thumbs = {};
  async function thumbsFor(ids) {
    const need = ids.filter((id) => !(id in thumbs));
    if (!need.length) return;
    need.forEach((id) => (thumbs[id] = null));
    const { data } = await sb.storage.from('photos').createSignedUrls(need.map((id) => id + '/thumb.png'), 3600);
    (data || []).forEach((d, i) => { if (d.signedUrl && !d.error) thumbs[need[i]] = d.signedUrl; });
  }
  const initials = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const mark = (text, q) => {
    const i = norm(text).indexOf(q);
    return i < 0 ? esc(text) : esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
  };
  const statusOf = (m) => {
    if (!m.last_scan) return ['new', 'Never in'];
    if (Date.now() - Date.parse(m.last_scan) < 864e5) return ['today', 'In today'];
    return ['', fmtTime(m.last_scan).split(' · ').pop()];
  };
  let hitIds = [], active = -1;
  async function search() {
    const raw = $('#q').value.trim(), q = norm(raw), list = $('#results');
    if (!q) { list.hidden = true; hitIds = []; return; }
    const all = await loadMembers();
    const hits = all.filter((m) => norm(m.name).includes(q) || norm(m.email).includes(q))
      .sort((a, b) => (norm(b.name).startsWith(q) - norm(a.name).startsWith(q)) || a.name.localeCompare(b.name)).slice(0, 8);
    hitIds = hits.map((m) => m.id); active = -1;
    await thumbsFor(hitIds);
    if (norm($('#q').value.trim()) !== q) return; // typed more while loading
    list.hidden = false;
    list.innerHTML = hits.length
      ? `<li class="count">${hits.length === 8 ? 'Top 8 matches' : hits.length + (hits.length === 1 ? ' member' : ' members')}</li>` + hits.map((m) => {
          const [cls, st] = statusOf(m);
          const no = m.member_no ? '#' + String(m.member_no).padStart(4, '0') : '';
          return `<li><button type="button" data-id="${m.id}" role="option">
            <span class="av">${thumbs[m.id] ? `<img src="${thumbs[m.id]}" alt="">` : esc(initials(m.name))}</span>
            <span class="who"><strong>${mark(m.name, q)}</strong><small>${mark(m.email, q)}</small></span>
            <span class="meta"><span class="nr">${m.is_admin ? '<i class="role-exec">Exec</i>' : ''}${no ? `<b>${no}</b>` : ''}</span><i class="st ${cls}">${esc(st)}</i></span>
          </button></li>`;
        }).join('')
      : `<li class="none"><b>No matches</b>Nobody’s name or email contains “${esc(raw)}”.</li>`;
    list.querySelectorAll('button').forEach((b) => b.onclick = () => lookup(all.find((m) => m.id === b.dataset.id)));
  }
  // Arrow keys + Enter in the search box
  $('#q').addEventListener('keydown', (e) => {
    const btns = [...$('#results').querySelectorAll('button')];
    if (!btns.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length;
      btns.forEach((b, i) => b.classList.toggle('on', i === active));
      btns[active].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') { e.preventDefault(); (btns[active] || btns[0]).click(); }
    else if (e.key === 'Escape') { $('#q').value = ''; $('#results').hidden = true; }
  });
  let looked = null;
  async function lookup(p) {
    looked = p;
    const m = { id: p.id, name: p.name, email: p.email, isAdmin: p.is_admin, memberNo: p.member_no, since: p.created_at };
    const photo = await signedPhoto(p.id).catch(() => null);
    const day = p.last_scan && Date.now() - Date.parse(p.last_scan) < 864e5;
    last = { state: 'look', title: day ? 'Member · already in today' : 'Member lookup', m, photo,
      r: { lastScan: p.last_scan, lastScannedBy: null, totalScans: p.scan_count, scansLast24h: 0 } };
    busy = true; try { scanner.pause(true); } catch {}
    openInfo();
  }
  // "Check in" from a lookup records it exactly like scanning their pass (same sounds and screen)
  $('#shCheck').onclick = () => {
    const p = looked; if (!p) return;
    $('#sheet').hidden = true; busy = false; members = null;
    $('#q').value = ''; $('#results').hidden = true;
    onScan('CPSC1:' + p.serial);
  };
}).catch(() => {});
""", extra_scripts='<script src="https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js"></script>\n')

exec(open(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)), 'club.py')).read())
