require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const sharp = require('sharp');
const QRCode = require('qrcode');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { db, DATA_DIR } = require('./db');
const wallet = require('./wallet');

const PORT = process.env.PORT || 3000;
const BASE_URL = (process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const SECRET = process.env.APP_SECRET;
if (!SECRET || SECRET.length < 32) {
  console.error('Set APP_SECRET in .env to a random string of at least 32 characters.');
  process.exit(1);
}
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
const PHOTO_DIR = path.join(DATA_DIR, 'photos');

// ---------- helpers ----------
const hmac = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('base64url').slice(0, 22);
const qrValueFor = (u) => `CPSC1:${u.serial}.${hmac('qr:' + u.serial)}`;
const photoSig = (u) => hmac('photo:' + u.serial);
const normEmail = (e) => String(e || '').trim().toLowerCase();
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const getUser = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);
const isApproved = (email) =>
  ADMIN_EMAILS.includes(email) || !!db.prepare('SELECT 1 FROM approved_emails WHERE email = ?').get(email);
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, isAdmin: !!u.is_admin, hasPhoto: !!u.has_photo, createdAt: u.created_at });

async function savePhoto(userId, buf) {
  await sharp(buf).rotate().resize(600, 600, { fit: 'cover' }).jpeg({ quality: 85 }).toFile(path.join(PHOTO_DIR, `${userId}.jpg`));
  db.prepare('UPDATE users SET has_photo = 1 WHERE id = ?').run(userId);
}

// ---------- session store (SQLite) ----------
class SqliteStore extends session.Store {
  get(sid, cb) {
    const row = db.prepare('SELECT sess, expires FROM sessions WHERE sid = ?').get(sid);
    if (!row || row.expires < Date.now()) return cb(null, null);
    cb(null, JSON.parse(row.sess));
  }
  set(sid, sess, cb) {
    const exp = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 864e5;
    db.prepare('INSERT OR REPLACE INTO sessions (sid, sess, expires) VALUES (?, ?, ?)').run(sid, JSON.stringify(sess), exp);
    cb && cb(null);
  }
  destroy(sid, cb) { db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid); cb && cb(null); }
  touch(sid, sess, cb) { this.set(sid, sess, cb); }
}
setInterval(() => db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now()), 36e5).unref();

// ---------- app ----------
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));
app.use(session({
  store: new SqliteStore(),
  secret: SECRET,
  name: 'cpsc.sid',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: BASE_URL.startsWith('https'), maxAge: 30 * 864e5 },
}));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, f, cb) => cb(null, /^image\//.test(f.mimetype)),
});

// Simple in-memory login throttle
const attempts = new Map();
function throttle(key) {
  const now = Date.now();
  const a = (attempts.get(key) || []).filter((t) => now - t < 15 * 60e3);
  a.push(now); attempts.set(key, a);
  return a.length > 10;
}

const requireUser = (req, res, next) => {
  const u = req.session.userId && getUser(req.session.userId);
  if (!u) return req.accepts('html') && !req.path.startsWith('/api') ? res.redirect('/login') : res.status(401).json({ error: 'Please log in.' });
  req.user = u; next();
};
const requireAdmin = (req, res, next) => requireUser(req, res, () => {
  if (!req.user.is_admin) return req.path.startsWith('/api') ? res.status(403).json({ error: 'Admins only.' }) : res.redirect('/card');
  next();
});

// ---------- pages ----------
const page = (f) => (_req, res) => res.sendFile(path.join(__dirname, 'views', f));
app.get('/', (req, res) => res.redirect(req.session.userId ? '/card' : '/login'));
app.get('/login', page('login.html'));
app.get('/signup', page('signup.html'));
app.get('/card', requireUser, page('card.html'));
app.get('/admin', requireAdmin, page('admin.html'));
app.get('/admin/scan', requireAdmin, page('scan.html'));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

// ---------- auth API ----------
app.post('/api/signup', upload.single('photo'), async (req, res) => {
  const email = normEmail(req.body.email);
  const name = String(req.body.name || '').trim().slice(0, 80);
  const password = String(req.body.password || '');
  if (!name || !validEmail(email)) return res.status(400).json({ error: 'Enter your full name and a valid email.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (!req.file) return res.status(400).json({ error: 'Please add a photo of yourself for your card.' });
  if (!isApproved(email)) {
    return res.status(403).json({ error: "That email isn't on the approved member list yet. Ask an exec board member to approve it, then try again." });
  }
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({ error: 'An account with that email already exists. Try logging in.' });
  }
  const hash = await bcrypt.hash(password, 12);
  const info = db.prepare('INSERT INTO users (email, name, password_hash, is_admin, serial) VALUES (?, ?, ?, ?, ?)')
    .run(email, name, hash, ADMIN_EMAILS.includes(email) ? 1 : 0, crypto.randomUUID());
  try { await savePhoto(info.lastInsertRowid, req.file.buffer); } catch {
    db.prepare('DELETE FROM users WHERE id = ?').run(info.lastInsertRowid);
    return res.status(400).json({ error: "We couldn't read that photo. Try a JPG or PNG." });
  }
  req.session.regenerate(() => { req.session.userId = info.lastInsertRowid; res.json({ ok: true }); });
});

app.post('/api/login', async (req, res) => {
  const email = normEmail(req.body.email);
  if (throttle(email + '|' + req.ip)) return res.status(429).json({ error: 'Too many attempts. Wait a few minutes and try again.' });
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!u || !(await bcrypt.compare(String(req.body.password || ''), u.password_hash))) {
    return res.status(401).json({ error: 'Wrong email or password.' });
  }
  if (ADMIN_EMAILS.includes(email) && !u.is_admin) db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(u.id);
  req.session.regenerate(() => { req.session.userId = u.id; res.json({ ok: true, isAdmin: !!u.is_admin || ADMIN_EMAILS.includes(email) }); });
});

app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));

// ---------- member API ----------
app.get('/api/me', requireUser, (req, res) => {
  res.json({ ...publicUser(req.user), appleReady: wallet.appleConfigured(), googleReady: !!wallet.googleCreds() });
});
app.get('/api/me/qr.svg', requireUser, async (req, res) => {
  res.type('image/svg+xml').send(await QRCode.toString(qrValueFor(req.user), { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }));
});
app.get('/api/me/photo', requireUser, (req, res) => {
  const p = path.join(PHOTO_DIR, `${req.user.id}.jpg`);
  fs.existsSync(p) ? res.set('Cache-Control', 'no-store').sendFile(p) : res.status(404).end();
});
app.post('/api/me/photo', requireUser, upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose an image.' });
  try { await savePhoto(req.user.id, req.file.buffer); res.json({ ok: true }); }
  catch { res.status(400).json({ error: "We couldn't read that photo." }); }
});

// ---------- wallet ----------
app.get('/wallet/apple', requireUser, async (req, res) => {
  if (!wallet.appleConfigured()) return res.status(503).send('Apple Wallet is not set up yet. An admin needs to add the Apple pass certificates (see README).');
  try {
    const buf = await wallet.buildApplePass(req.user, qrValueFor(req.user));
    res.set({ 'Content-Type': 'application/vnd.apple.pkpass', 'Content-Disposition': 'attachment; filename="cpsc-membership.pkpass"' }).send(buf);
  } catch (e) { console.error(e); res.status(500).send('Could not build the Apple Wallet pass.'); }
});
app.get('/wallet/google', requireUser, (req, res) => {
  const u = req.user;
  const url = wallet.googleSaveUrl(u, qrValueFor(u), {
    baseUrl: BASE_URL,
    logoUrl: `${BASE_URL}/pass-logo.png`,
    photoUrl: u.has_photo ? `${BASE_URL}/p/${u.serial}/${photoSig(u)}.jpg` : null,
  });
  if (!url) return res.status(503).send('Google Wallet is not set up yet. An admin needs to add the Google service account (see README).');
  res.redirect(url);
});
// Public, unguessable, signed photo URL — Google's servers fetch the card image from here.
app.get('/p/:serial/:sig.jpg', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE serial = ?').get(req.params.serial);
  if (!u || req.params.sig !== photoSig(u)) return res.status(404).end();
  res.sendFile(path.join(PHOTO_DIR, `${u.id}.jpg`));
});
app.get('/pass-logo.png', async (_req, res) => res.type('png').send(await wallet.logoPng(660)));

// ---------- admin API ----------
app.get('/api/admin/approved', requireAdmin, (_req, res) => {
  res.json(db.prepare(`SELECT a.email, a.note, a.added_by, a.added_at,
      EXISTS(SELECT 1 FROM users u WHERE u.email = a.email) AS registered
    FROM approved_emails a ORDER BY a.added_at DESC`).all());
});
app.post('/api/admin/approved', requireAdmin, (req, res) => {
  const emails = String(req.body.emails || '').split(/[\s,;]+/).map(normEmail).filter(validEmail);
  if (!emails.length) return res.status(400).json({ error: 'No valid emails found.' });
  const ins = db.prepare('INSERT OR IGNORE INTO approved_emails (email, note, added_by) VALUES (?, ?, ?)');
  const added = db.transaction(() => emails.reduce((n, e) => n + ins.run(e, req.body.note || null, req.user.email).changes, 0))();
  res.json({ ok: true, added, skipped: emails.length - added });
});
app.delete('/api/admin/approved/:email', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM approved_emails WHERE email = ?').run(normEmail(req.params.email));
  res.json({ ok: true });
});

app.get('/api/admin/members', requireAdmin, (_req, res) => {
  res.json(db.prepare(`SELECT u.id, u.name, u.email, u.is_admin, u.created_at,
      (SELECT MAX(scanned_at) FROM scans s WHERE s.user_id = u.id) AS last_scan,
      (SELECT COUNT(*) FROM scans s WHERE s.user_id = u.id) AS scan_count
    FROM users u ORDER BY u.name COLLATE NOCASE`).all());
});
app.post('/api/admin/members/:id/admin', requireAdmin, (req, res) => {
  db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(req.body.isAdmin ? 1 : 0, req.params.id);
  res.json({ ok: true });
});
app.delete('/api/admin/members/:id', requireAdmin, (req, res) => {
  const u = getUser(req.params.id);
  if (!u) return res.status(404).json({ error: 'Not found' });
  if (u.id === req.user.id) return res.status(400).json({ error: "You can't remove yourself." });
  db.transaction(() => {
    db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
    db.prepare('DELETE FROM approved_emails WHERE email = ?').run(u.email);
  })();
  fs.rmSync(path.join(PHOTO_DIR, `${u.id}.jpg`), { force: true });
  res.json({ ok: true });
});
app.get('/api/admin/photo/:id', requireAdmin, (req, res) => {
  const p = path.join(PHOTO_DIR, `${Number(req.params.id)}.jpg`);
  fs.existsSync(p) ? res.sendFile(p) : res.status(404).end();
});

app.post('/api/admin/scan', requireAdmin, (req, res) => {
  const m = /^CPSC1:([0-9a-f-]{36})\.([\w-]{22})$/.exec(String(req.body.code || '').trim());
  if (!m || m[2] !== hmac('qr:' + m[1])) return res.status(404).json({ valid: false, error: 'Not a valid CPSC membership card.' });
  const u = db.prepare('SELECT * FROM users WHERE serial = ?').get(m[1]);
  if (!u) return res.status(404).json({ valid: false, error: 'This card belongs to a removed account.' });
  const prev = db.prepare('SELECT scanned_at, scanned_by FROM scans WHERE user_id = ? ORDER BY scanned_at DESC LIMIT 1').get(u.id);
  const count = db.prepare('SELECT COUNT(*) AS n FROM scans WHERE user_id = ?').get(u.id).n;
  db.prepare('INSERT INTO scans (user_id, scanned_by) VALUES (?, ?)').run(u.id, req.user.email);
  res.json({
    valid: true,
    member: { id: u.id, name: u.name, email: u.email, photoUrl: u.has_photo ? `/api/admin/photo/${u.id}?v=${Date.now()}` : null },
    lastScan: prev ? prev.scanned_at : null,
    lastScannedBy: prev ? prev.scanned_by : null,
    totalScans: count + 1,
  });
});

app.listen(PORT, () => console.log(`CPSC membership cards running at ${BASE_URL}`));
