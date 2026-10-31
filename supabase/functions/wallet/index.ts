// CPSC wallet function (Supabase Edge Function, single file).
// Builds Apple Wallet passes and Google Wallet "save" links. The signing keys live
// in this function's secrets, never in the public website.
//
// Deploy: Supabase → Edge Functions → Deploy a new function → name it "wallet" →
// paste this file → turn OFF "Verify JWT" (this function checks logins itself, and Apple
// Wallet calls it directly to fetch updated passes).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { PKPass } from 'npm:passkit-generator@3.6.1';
import { importPKCS8, SignJWT } from 'npm:jose@5';
import { Buffer } from 'node:buffer';
import { unzipSync } from 'npm:fflate@0.8';

const env = (k: string) => Deno.env.get(k) ?? '';
const SUPABASE_URL = env('SUPABASE_URL').replace(/\/$/, '');
// Newer projects expose secret keys as a JSON map; older ones as SUPABASE_SERVICE_ROLE_KEY.
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY') || (() => {
  try { return Object.values(JSON.parse(env('SUPABASE_SECRET_KEYS') || '{}'))[0] as string || ''; } catch { return ''; }
})();
const SITE_URL = env('SITE_URL').replace(/\/$/, ''); // e.g. https://mr-albenberg.github.io/cpsc
const ORG = env('ORG_NAME') || 'Central Pacific Ski Club';
const SHORT = env('ORG_SHORT') || 'CPSC';
const BG = env('PASS_BG') || '#121212';
const FG = env('PASS_FG') || '#FFFFFF';   // the poster draws text in this color, over dark artwork
const LABEL = env('PASS_LABEL') || '#ECFFB0'; // club lime

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const secret = (k: string) => {
  const v = env(k + '_B64').replace(/\s+/g, '');
  return v ? Buffer.from(v, 'base64') : null;
};
export const appleReady = () =>
  !!(env('APPLE_PASS_TYPE_ID') && env('APPLE_TEAM_ID') && secret('APPLE_WWDR') && secret('APPLE_SIGNER_CERT') && secret('APPLE_SIGNER_KEY') && SITE_URL);
export const googleReady = () => !!(env('GOOGLE_ISSUER_ID') && (env('GOOGLE_SERVICE_ACCOUNT') || secret('GOOGLE_SERVICE_ACCOUNT')) && SITE_URL);

// ---------- WalletWallet (free hosted signing, no Apple/Google accounts needed) ----------
// Used for whichever wallet doesn't have its own keys configured above.
// Each member gets ONE pass. When the weekly check-in code changes, the pass is updated
// in place and WalletWallet pushes the change to every phone that added it.
const WW = 'https://api.walletwallet.dev';
const WW_KEY = env('WALLETWALLET_API_KEY');
// Retired: the club now issues only its own signed Apple passes (and Google, once set up).
// The key is kept only so purgeWalletWallet() can delete the old hosted passes.
export const wwReady = () => false;
const wwHeaders = () => ({ Authorization: `Bearer ${WW_KEY}`, 'Content-Type': 'application/json' });
type WWCache = { v: 3; serial: string; googleSaveUrl: string; token: string; passType: string; sig: string };

const titleCase = (w: string) => w.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());

export async function currentCode(): Promise<{ word: string; emoji: string; text: string }> {
  const { data } = await db.from('club_settings').select('week_word,week_emoji').eq('id', 1).maybeSingle();
  const word = data?.week_word || 'POWDER';
  return { word, emoji: '', text: titleCase(word) };
}

// The school year a membership belongs to, e.g. 2026–27 (ends June 30, 2027)
function season(p?: Profile) {
  if (p?.member_until) { const y = +p.member_until.slice(0, 4); return `${y - 1}–${String(y).slice(2)}`; }
  const now = new Date();
  const y = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1; // June 1 starts the next school year
  return `${y}–${String(y + 1).slice(2)}`;
}
// "Jun 30, 2027" — the last day the card scans as valid
const validThru = (p: Profile) => (p.member_until
  ? new Date(p.member_until + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  : '');
const expiresAt = (p: Profile) => (p.member_until ? `${p.member_until}T23:59:59-07:00` : null);
const planLabel = (p: Profile) => (p.membership === 'spring' ? 'Spring' : 'Full year');

const memberNo = (p: Profile) => (p.member_no ? '#' + String(p.member_no).padStart(4, '0') : '');
const CLUB = 'https://cpsconline.com';

// Bump LAYOUT when the pass design changes so existing passes get the new look on their next update.
const LAYOUT = 'L6';
export const sigOf = (p: Profile, code: string) => [LAYOUT, p.name, memberNo(p), p.is_admin ? 'exec' : 'member', code, p.membership, p.member_until].join('|');

export function wwBody(p: Profile, code: string, thumbUri?: string) {
  const no = memberNo(p);
  const site = SITE_URL || 'https://mr-albenberg.github.io/cpsc';
  return {
    logoText: SHORT,
    organizationName: ORG,
    description: `${ORG} — ${p.name}'s membership card`,
    // Free plan: closest preset (dark). Paid plan: the site's lime + the real CPSC logo.
    colorPreset: env('WALLETWALLET_COLOR') || 'dark',
    colorPro: BG,
    logoURLPro: `${site}/img/logo.png`,          // the black CPSC mountain logo, on lime
    iconURLPro: `${site}/img/icon.png`,
    thumbnailURLPro: thumbUri,
    headerFields: [{ value: code }],                       // the check-in word, top right, no label
    primaryFields: [{ label: 'LIVE TO SKI, LOVE TO PARTY', value: p.name }],
    secondaryFields: [
      ...(no ? [{ label: p.is_admin ? 'EXEC BOARD' : 'MEMBER', value: no }] : []),
      { label: p.membership === 'spring' ? 'SPRING' : 'SEASON', value: season(p) },
      ...(p.member_until ? [{ label: 'VALID THRU', value: validThru(p) }] : []),
    ],
    barcodeValue: QR(p.serial),
    barcodeFormat: 'QR',
    barcodeAltText: ORG,
  };
}

async function thumbFor(id: string) {
  const { data } = await db.storage.from('photos').download(`${id}/thumb.png`);
  return data ? 'data:image/png;base64,' + Buffer.from(await data.arrayBuffer()).toString('base64') : undefined;
}

// Read authenticationToken + passTypeIdentifier from a .pkpass (a zip) so we can fetch updates later.
function passMeta(buf: Uint8Array) {
  const files = unzipSync(buf, { filter: (f) => f.name === 'pass.json' });
  const pj = JSON.parse(new TextDecoder().decode(files['pass.json']));
  return { token: pj.authenticationToken as string, passType: pj.passTypeIdentifier as string };
}

async function readCache(id: string): Promise<Partial<WWCache> | null> {
  const { data } = await db.storage.from('photos').download(`${id}/wallet.json`);
  if (!data) return null;
  try { return JSON.parse(await data.text()); } catch { return null; }
}
async function writeCache(id: string, c: WWCache) {
  await db.storage.from('photos').upload(`${id}/wallet.json`, JSON.stringify(c), { upsert: true, contentType: 'application/json' });
}
async function savePkpass(id: string, buf: Uint8Array) {
  await db.storage.from('photos').upload(`${id}/pass.pkpass`, buf, { upsert: true, contentType: 'application/vnd.apple.pkpass' });
}

function wwError(status: number, d: unknown): never {
  console.error('WalletWallet error', status, d);
  throw new Error(status === 429 ? 'The free wallet-pass limit for this month is used up. Try again next month.' : 'The wallet service is unavailable right now.');
}

// Update an existing pass in place. Returns how many phones were notified, or null if the pass no longer exists.
export async function wwUpdate(serial: string, body: unknown): Promise<number | null> {
  const r = await fetch(`${WW}/api/passes/${serial}`, { method: 'PUT', headers: wwHeaders(), body: JSON.stringify(body) });
  if (r.status === 404) return null;
  const d = await r.json().catch(() => ({}));
  if (!r.ok) wwError(r.status, d);
  return Number(d.notifiedDevices) || 0;
}

// ---- pass history: one working pass per member ----
async function track(userId: string, serial: string) {
  await db.from('wallet_passes').upsert({ serial, user_id: userId }, { onConflict: 'serial', ignoreDuplicates: true });
}
// Void every pass this member was ever issued except `keep` (null = void them all).
// WalletWallet pushes the voided version to each phone (iPhone greys it out and moves it to
// Expired Passes) and revokes the Google Wallet copy.
export async function retireOthers(userId: string, keep: string | null) {
  let q = db.from('wallet_passes').select('serial').eq('user_id', userId).is('revoked_at', null);
  if (keep) q = q.neq('serial', keep);
  const { data } = await q;
  let n = 0;
  for (const { serial } of data || []) {
    const r = await fetch(`${WW}/api/passes/${serial}`, { method: 'DELETE', headers: wwHeaders() }).catch(() => null);
    if (r && (r.ok || r.status === 404)) {
      await db.from('wallet_passes').update({ revoked_at: new Date().toISOString() }).eq('serial', serial);
      n++;
    }
  }
  return n;
}
// Re-download the member's latest .pkpass so anyone who (re)adds it gets the current version.
async function refreshPkpass(id: string, c: Partial<WWCache>) {
  if (!c.serial || !c.token || !c.passType) return;
  const r = await fetch(`${WW}/v1/passes/${c.passType}/${c.serial}`, { headers: { Authorization: `ApplePass ${c.token}` } });
  if (r.ok) await savePkpass(id, new Uint8Array(await r.arrayBuffer()));
}

// Make sure this member has an up-to-date pass. Creates it on first use, updates it if stale.
export async function wwPassFor(p: Profile): Promise<WWCache> {
  const code = (await currentCode()).text;
  const sig = sigOf(p, code);
  const cache = await readCache(p.id);
  const serial = p.wallet_serial || cache?.serial;

  if (serial && cache?.v === 3 && cache.serial === serial && cache.sig === sig) {
    await track(p.id, serial);
    return cache as WWCache;
  }

  // Existing pass → update in place so it stays the same pass on the member's phone.
  if (serial && cache?.googleSaveUrl) {
    const notified = await wwUpdate(serial, wwBody(p, code, await thumbFor(p.id)));
    if (notified !== null) {
      let meta = cache.token && cache.passType ? { token: cache.token, passType: cache.passType } : null;
      if (!meta) {
        const { data: old } = await db.storage.from('photos').download(`${p.id}/pass.pkpass`);
        if (old) meta = passMeta(new Uint8Array(await old.arrayBuffer()));
      }
      if (meta) {
        // Pull the freshly updated .pkpass through Apple's standard pass web service
        const r = await fetch(`${WW}/v1/passes/${meta.passType}/${serial}`, { headers: { Authorization: `ApplePass ${meta.token}` } });
        if (r.ok) await savePkpass(p.id, new Uint8Array(await r.arrayBuffer()));
        const c: WWCache = { v: 3, serial, googleSaveUrl: cache.googleSaveUrl, token: meta.token, passType: meta.passType, sig };
        await writeCache(p.id, c);
        if (!p.wallet_serial) await db.from('profiles').update({ wallet_serial: serial }).eq('id', p.id);
        await track(p.id, serial);
        return c;
      }
    }
  }

  // No usable pass yet → create one.
  const r = await fetch(`${WW}/api/passes`, { method: 'POST', headers: wwHeaders(), body: JSON.stringify(wwBody(p, code, await thumbFor(p.id))) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.serialNumber) wwError(r.status, d);
  if (serial) await track(p.id, serial);
  await track(p.id, d.serialNumber);
  const buf = new Uint8Array(Buffer.from(d.applePass, 'base64'));
  const meta = passMeta(buf);
  await savePkpass(p.id, buf);
  const c: WWCache = { v: 3, serial: d.serialNumber, googleSaveUrl: d.googleSaveUrl, token: meta.token, passType: meta.passType, sig };
  await writeCache(p.id, c);
  await db.from('profiles').update({ wallet_serial: d.serialNumber }).eq('id', p.id);
  await retireOthers(p.id, d.serialNumber);
  return c;
}

// Push the current code to every member's pass (admin "Update all passes" button).
export async function wwRefreshAll() {
  const code = (await currentCode()).text;
  const { data: members } = await db.from('profiles').select(PROFILE_COLS).not('wallet_serial', 'is', null);
  const list = (members || []) as Profile[];
  let updated = 0, phones = 0, failed = 0, gone = 0;
  let quotaHit = false;
  const queue = [...list];
  async function worker() {
    for (let p = queue.shift(); p; p = queue.shift()) {
      if (quotaHit) { failed++; continue; }
      try {
        const n = await wwUpdate(p.wallet_serial!, wwBody(p, code, await thumbFor(p.id)));
        if (n === null) { gone++; await db.from('profiles').update({ wallet_serial: null }).eq('id', p.id); continue; }
        updated++; phones += n;
        const cache = await readCache(p.id);
        if (cache && cache.serial === p.wallet_serial && cache.googleSaveUrl) {
          await writeCache(p.id, { ...(cache as WWCache), v: 3, sig: sigOf(p, code) });
          await refreshPkpass(p.id, cache);
        }
      } catch (e) {
        failed++;
        if (e instanceof Error && /limit/.test(e.message)) quotaHit = true;
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  return { code, total: list.length, updated, phones, failed, gone, quotaHit };
}

// Delete every hosted WalletWallet pass ever issued (voids it on the phone) and forget them.
export async function purgeWalletWallet() {
  const { data: hist } = await db.from('wallet_passes').select('serial,user_id').is('revoked_at', null);
  const { data: profs } = await db.from('profiles').select('id,wallet_serial').not('wallet_serial', 'is', null);
  const todo = new Map<string, string>();
  for (const h of hist || []) todo.set(h.serial, h.user_id);
  for (const p of profs || []) todo.set(p.wallet_serial, p.id);
  if (!todo.size) return { deleted: 0, failed: 0 };
  let deleted = 0, failed = 0;
  for (const [serial] of todo) {
    const r = WW_KEY ? await fetch(`${WW}/api/passes/${serial}`, { method: 'DELETE', headers: wwHeaders() }).catch(() => null) : null;
    if (!WW_KEY || (r && (r.ok || r.status === 404))) {
      await db.from('wallet_passes').update({ revoked_at: new Date().toISOString() }).eq('serial', serial);
      deleted++;
    } else failed++;
  }
  if (!failed) {
    const users = [...new Set(todo.values())];
    await db.from('profiles').update({ wallet_serial: null }).in('id', users);
    await db.storage.from('photos').remove(users.flatMap((u) => [`${u}/wallet.json`, `${u}/pass.pkpass`]));
  }
  return { deleted, failed };
}

export async function wwRevoke(serial: string) {
  await fetch(`${WW}/api/passes/${serial}`, { method: 'DELETE', headers: wwHeaders() }).catch(() => {});
}

const QR = (serial: string) => `CPSC1:${serial}`;
const rgb = (h: string) => {
  const n = parseInt(h.replace('#', ''), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

// ---------- short-lived download links for Apple passes ----------
// (Safari downloads the .pkpass by visiting a URL, which can't carry a login header.)
const enc = new TextEncoder();
async function hmac(data: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(SERVICE_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode('wallet:' + data)));
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function makeToken(userId: string) {
  const payload = `${userId}.${Date.now() + 5 * 60_000}`;
  return `${payload}.${await hmac(payload)}`;
}
async function readToken(token: string) {
  const [id, exp, sig] = token.split('.');
  if (!id || !exp || !sig || Number(exp) < Date.now()) return null;
  return sig === (await hmac(`${id}.${exp}`)) ? id : null;
}

// ---------- Apple (passes signed with the club's own Pass Type ID certificate) ----------
// Pass Type ID: APPLE_PASS_TYPE_ID (pass.com.cpsc.membership). Phones that add the pass register
// with this function (Apple's PassKit web service), and get an empty push whenever the pass changes.
const imgCache: Record<string, Buffer> = {};
async function siteImage(name: string) {
  if (!imgCache[name]) {
    const r = await fetch(`${SITE_URL}/img/${name}`);
    if (!r.ok) throw new Error(`Could not load img/${name} from SITE_URL`);
    imgCache[name] = Buffer.from(await r.arrayBuffer());
  }
  return imgCache[name];
}

type Profile = {
  id: string; email: string; name: string; serial: string; created_at: string; wallet_serial?: string | null;
  member_no?: number | null; is_admin?: boolean; pass_updated_at?: string; pass_test_code?: string | null;
  membership?: string | null; member_until?: string | null;
};
const PROFILE_COLS = 'id,email,name,serial,created_at,wallet_serial,member_no,is_admin,pass_updated_at,pass_test_code,membership,member_until';

const PASS_TYPE = () => env('APPLE_PASS_TYPE_ID');
const WEB_SERVICE_URL = () => `${SUPABASE_URL}/functions/v1/wallet`;
const pem = (k: string) => secret(k)?.toString('utf8') ?? '';
const b64url = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

// Per-pass secret the phone sends back ("ApplePass <token>"). Derived from a long-lived secret in the
// database (not the signing key), so renewing the certificate never breaks existing passes.
let passSecret: Uint8Array<ArrayBuffer> | null = null;
async function passSecretBytes() {
  if (!passSecret) {
    const { data } = await db.from('pass_secrets').select('secret').eq('id', 1).maybeSingle();
    if (!data?.secret) throw new Error('pass_secrets is missing — run supabase/migrations/006_pass_auth_secret.sql');
    passSecret = new TextEncoder().encode(data.secret);
  }
  return passSecret;
}
export async function passAuthToken(serial: string) {
  const key = await crypto.subtle.importKey('raw', await passSecretBytes(), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('pass-auth:' + serial)))).slice(0, 40);
}

export async function buildApplePass(p: Profile, thumb: Buffer | null, code: string, voided = false) {
  const no = memberNo(p);
  const passJson: Record<string, unknown> = {
    formatVersion: 1,
    passTypeIdentifier: PASS_TYPE(),
    teamIdentifier: env('APPLE_TEAM_ID'),
    organizationName: ORG,
    description: `${ORG} membership card`,
    serialNumber: p.serial,
    authenticationToken: await passAuthToken(p.serial),
    webServiceURL: WEB_SERVICE_URL(),
    backgroundColor: rgb(BG),   // cpsconline.com lime
    foregroundColor: rgb(FG),   // black text
    labelColor: rgb(LABEL),
    sharingProhibited: true,
    generic: {
      headerFields: [{ key: 'code', value: voided ? 'Ended' : code }],   // check-in word, top right, no label
      primaryFields: [{ key: 'name', label: 'LIVE TO SKI, LOVE TO PARTY', value: p.name }],
      secondaryFields: voided
        ? [{ key: 'status', label: 'STATUS', value: 'Membership ended' }]
        : [
            ...(no ? [{ key: 'no', label: p.is_admin ? 'EXEC BOARD' : 'MEMBER', value: no }] : []),
            { key: 'season', label: p.membership === 'spring' ? 'SPRING' : 'SEASON', value: season(p) },
            ...(p.member_until ? [{ key: 'thru', label: 'VALID THRU', value: validThru(p) }] : []),
          ],
      backFields: p.member_until ? [{ key: 'plan', label: 'MEMBERSHIP', value: `${planLabel(p)} · valid through ${validThru(p)}. Renew at ${SITE_URL || CLUB}/join.html` }] : [],
    },
    // iOS 27+ poster layout: full-bleed club artwork (skier + CPSC logo in lime), word top right,
    // name and member info on the strip by the QR code. Older iPhones use `generic` above.
    posterGeneric: {
      headerFields: [{ key: 'code', value: voided ? 'Ended' : code }],
      // name on the left, season on the right of the same row
      primaryFields: [
        { key: 'name', label: 'LIVE TO SKI, LOVE TO PARTY', value: p.name },
        ...(voided ? [] : [{ key: 'season', label: p.membership === 'spring' ? 'SPRING' : 'SEASON', value: season(p), textAlignment: 'PKTextAlignmentRight' }]),
      ],
      footerFields: voided
        ? [{ key: 'status', value: 'Membership ended' }]
        : [{ key: 'info', value: [no, p.is_admin ? 'Exec Board' : 'Member', p.member_until ? 'Thru ' + validThru(p) : ''].filter(Boolean).join(' · ') }],
    },
    barcodes: [{ format: 'PKBarcodeFormatQR', message: QR(voided ? 'void' : p.serial), messageEncoding: 'iso-8859-1' }],
  };
  if (voided) passJson.voided = true;
  else if (expiresAt(p)) passJson.expirationDate = expiresAt(p); // Wallet shows "Expired" after the school year
  const icon = await siteImage('apple-touch-icon.png');
  const files: Record<string, Buffer> = {
    'pass.json': Buffer.from(JSON.stringify(passJson)),
    'icon.png': icon, 'icon@2x.png': icon, 'icon@3x.png': icon,
    'logo.png': await siteImage('pass/primaryLogo.png'),   // the CPSC mountain logo from cpsconline.com, in lime
    'logo@2x.png': await siteImage('pass/primaryLogo@2x.png'),
    'logo@3x.png': await siteImage('pass/primaryLogo@3x.png'),
  };
  // Poster artwork + lime logo (Apple's docs name the poster image both ways, so include both)
  for (const base of ['background', 'artwork', 'primaryLogo']) {
    for (const scale of ['', '@2x', '@3x']) files[`${base}${scale}.png`] = await siteImage(`pass/${base}${scale}.png`);
  }
  if (thumb && !voided) { files['thumbnail.png'] = thumb; files['thumbnail@2x.png'] = thumb; }   // member photo
  const pass = new PKPass(files, {
    wwdr: secret('APPLE_WWDR')!,
    signerCert: secret('APPLE_SIGNER_CERT')!,
    signerKey: secret('APPLE_SIGNER_KEY')!,
    signerKeyPassphrase: env('APPLE_SIGNER_KEY_PASSPHRASE') || undefined,
  });
  return pass.getAsBuffer();
}

async function thumbBuffer(id: string) {
  const { data } = await db.storage.from('photos').download(`${id}/thumb.png`);
  return data ? Buffer.from(await data.arrayBuffer()) : null;
}
async function settingsInfo() {
  const { data } = await db.from('club_settings').select('week_word,updated_at').eq('id', 1).maybeSingle();
  return { code: titleCase(data?.week_word || 'POWDER'), updatedMs: data ? Date.parse(data.updated_at) : 0 };
}
const ms = (t?: string | null) => (t ? Date.parse(t) : 0);
// Bump this (to the current time) whenever the pass design changes; phones then fetch the new look.
const DESIGN_AT = Date.parse('2026-10-31T00:30:00Z');

// The pass for a serial, as of now (null if it never existed)
async function applePassBySerial(serial: string): Promise<{ buf: Buffer; modified: number } | null> {
  if (!isUuid(serial)) return null;
  const { data: p } = await db.from('profiles').select(PROFILE_COLS).eq('serial', serial).maybeSingle();
  if (p) {
    const s = await settingsInfo();
    return { buf: await buildApplePass(p as Profile, await thumbBuffer(p.id), p.pass_test_code || s.code), modified: Math.max(ms(p.pass_updated_at), s.updatedMs, DESIGN_AT) };
  }
  const { data: v } = await db.from('voided_passes').select('*').eq('serial', serial).maybeSingle();
  if (v) {
    const ghost = { id: '', email: '', name: v.name || 'Former member', serial, created_at: v.voided_at } as Profile;
    return { buf: await buildApplePass(ghost, null, '', true), modified: ms(v.voided_at) };
  }
  return null;
}

// ---- Apple PassKit web service (webServiceURL + /v1/...) ----
async function appleWebService(req: Request, url: URL): Promise<Response | null> {
  // Apple calls <webServiceURL>/v1/...; the function sees …/wallet/v1/… (path prefix varies by host)
  const m = url.pathname.match(/(?:^|\/)wallet\/v1\/(.+)$/) || url.pathname.match(/^\/v1\/(.+)$/);
  if (!m || !appleReady()) return null;
  const parts = m[1].split('/').filter(Boolean).map(decodeURIComponent);
  const empty = (status: number) => new Response(null, { status });
  const authed = async (serial: string) =>
    (req.headers.get('Authorization') || '').replace(/^ApplePass\s+/i, '') === (await passAuthToken(serial));

  if (parts[0] === 'log' && req.method === 'POST') {
    console.log('Wallet log:', (await req.text()).slice(0, 2000));
    return empty(200);
  }
  // Register / unregister a phone for a pass
  if (parts[0] === 'devices' && parts[2] === 'registrations' && parts.length === 5) {
    const [, device, , passType, serial] = parts;
    if (passType !== PASS_TYPE() || !(await authed(serial))) return empty(401);
    if (req.method === 'POST') {
      const { pushToken } = await req.json().catch(() => ({}));
      if (!pushToken) return empty(400);
      const { data: existing } = await db.from('pass_registrations').select('device_id').eq('device_id', device).eq('serial', serial).maybeSingle();
      await db.from('pass_registrations').upsert({ device_id: device, serial, push_token: pushToken }, { onConflict: 'device_id,serial' });
      return empty(existing ? 200 : 201);
    }
    if (req.method === 'DELETE') {
      await db.from('pass_registrations').delete().eq('device_id', device).eq('serial', serial);
      return empty(200);
    }
  }
  // Which of this phone's passes changed since its last check
  if (parts[0] === 'devices' && parts[2] === 'registrations' && parts.length === 4 && req.method === 'GET') {
    const [, device, , passType] = parts;
    if (passType !== PASS_TYPE()) return empty(404);
    const { data: regs } = await db.from('pass_registrations').select('serial').eq('device_id', device);
    const serials = [...new Set((regs || []).map((r) => r.serial))];
    if (!serials.length) return empty(204);
    const since = Number(url.searchParams.get('passesUpdatedSince') || 0) || 0;
    const s = await settingsInfo();
    const valid = serials.filter(isUuid);
    const { data: profs } = valid.length ? await db.from('profiles').select('serial,pass_updated_at').in('serial', valid) : { data: [] };
    const { data: voids } = await db.from('voided_passes').select('serial,voided_at').in('serial', serials);
    const mod: Record<string, number> = {};
    for (const p of profs || []) mod[p.serial] = Math.max(ms(p.pass_updated_at), s.updatedMs, DESIGN_AT);
    for (const v of voids || []) mod[v.serial] = ms(v.voided_at);
    const changed = Object.keys(mod).filter((k) => mod[k] > since);
    if (!changed.length) return empty(204);
    return new Response(JSON.stringify({ serialNumbers: changed, lastUpdated: String(Math.max(...Object.values(mod))) }), { headers: { 'Content-Type': 'application/json' } });
  }
  // The latest version of a pass
  if (parts[0] === 'passes' && parts.length === 3 && req.method === 'GET') {
    const [, passType, serial] = parts;
    if (passType !== PASS_TYPE() || !(await authed(serial))) return empty(401);
    const built = await applePassBySerial(serial);
    if (!built) return empty(401);
    const ims = Date.parse(req.headers.get('If-Modified-Since') || '');
    if (!Number.isNaN(ims) && Math.floor(built.modified / 1000) <= Math.floor(ims / 1000)) return empty(304);
    return new Response(new Uint8Array(built.buf), { headers: { 'Content-Type': 'application/vnd.apple.pkpass', 'Last-Modified': new Date(built.modified).toUTCString() } });
  }
  return empty(404);
}

// ---- Tell phones a pass changed (empty push, topic = pass type id, signed with the pass certificate) ----
// Two transports: Deno's fetch with a client certificate, or Node's http2 module. Whichever Apple
// accepts first is remembered for the life of the function instance.
type ApnsResult = { status: number; body: string };
let apnsMode: 'fetch' | 'node' | null = (env('APNS_MODE') as 'fetch' | 'node') || null;
const apnsHost = () => env('APNS_HOST') || 'https://api.push.apple.com';
const apnsHeaders = () => ({
  'apns-topic': PASS_TYPE(), 'apns-push-type': env('APNS_PUSH_TYPE') || 'background', 'apns-priority': '5', 'content-type': 'application/json',
});

async function sendViaFetch(tokens: string[]): Promise<ApnsResult[]> {
  // deno-lint-ignore no-explicit-any
  const client = (Deno as any).createHttpClient({ cert: pem('APPLE_SIGNER_CERT'), key: pem('APPLE_SIGNER_KEY'), http2: true });
  try {
    return await Promise.all(tokens.map(async (t) => {
      // deno-lint-ignore no-explicit-any
      const r = await fetch(`${apnsHost()}/3/device/${t}`, { method: 'POST', headers: apnsHeaders(), body: '{}', client } as any);
      return { status: r.status, body: await r.text() };
    }));
  } finally { try { client.close(); } catch { /* */ } }
}

async function sendViaNode(tokens: string[]): Promise<ApnsResult[]> {
  const http2 = await import('node:http2');
  return await new Promise((resolve) => {
    const out: ApnsResult[] = tokens.map(() => ({ status: 0, body: 'not sent' }));
    let left = tokens.length, finished = false;
    const client = http2.connect(apnsHost(), {
      cert: pem('APPLE_SIGNER_CERT'), key: pem('APPLE_SIGNER_KEY'), passphrase: env('APPLE_SIGNER_KEY_PASSPHRASE') || undefined,
    });
    const finish = () => { if (finished) return; finished = true; clearTimeout(timer); try { client.close(); } catch { /* */ } resolve(out); };
    const timer = setTimeout(finish, 25_000);
    client.on('error', (e: Error) => { console.error('APNs connection error', e.message); finish(); });
    tokens.forEach((token, i) => {
      const r = client.request({ ':method': 'POST', ':path': `/3/device/${token}`, ...apnsHeaders() });
      r.on('response', (h: Record<string, unknown>) => { out[i].status = Number(h[':status']); out[i].body = ''; });
      r.on('data', (d: unknown) => { out[i].body += String(d); });
      r.on('end', () => { if (--left === 0) finish(); });
      r.on('error', (e: Error) => { out[i].body = e.message; if (--left === 0) finish(); });
      r.end('{}');
    });
  });
}

// Apple rejects a missing/ignored client certificate with 403 MissingProviderToken
const certIgnored = (r: ApnsResult[]) => r.some((x) => x.status === 403 && /MissingProviderToken/.test(x.body)) || r.every((x) => x.status === 0);

async function apnsSend(tokens: string[]): Promise<ApnsResult[]> {
  if (apnsMode === 'fetch') return sendViaFetch(tokens);
  if (apnsMode === 'node') return sendViaNode(tokens);
  let first: ApnsResult[] | null = null;
  try { first = await sendViaFetch(tokens); } catch (e) { console.error('APNs via fetch unavailable:', (e as Error).message); }
  if (first && !certIgnored(first)) { apnsMode = 'fetch'; return first; }
  const second = await sendViaNode(tokens);
  if (!certIgnored(second)) apnsMode = 'node';
  return second;
}

export async function apnsPush(tokens: string[]): Promise<{ sent: number; failed: number; gone: number }> {
  const list = [...new Set(tokens.filter(Boolean))];
  if (!list.length || !appleReady()) return { sent: 0, failed: 0, gone: 0 };
  const res = await apnsSend(list);
  let sent = 0, failed = 0, gone = 0;
  for (let i = 0; i < list.length; i++) {
    const { status, body } = res[i];
    if (status === 200) { sent++; continue; }
    failed++;
    console.error('APNs', status, body);
    if (status === 410 || /BadDeviceToken|Unregistered/.test(body)) { gone++; await db.from('pass_registrations').delete().eq('push_token', list[i]); }
  }
  return { sent, failed, gone };
}

// Admin diagnostic: does Apple accept our certificate from inside Supabase? (expects 400 BadDeviceToken)
export async function apnsCheck() {
  const fake = '0'.repeat(64);
  const out: Record<string, unknown> = {};
  try { out.fetch = (await sendViaFetch([fake]))[0]; } catch (e) { out.fetch = { error: (e as Error).message }; }
  try { out.node = (await sendViaNode([fake]))[0]; } catch (e) { out.node = { error: (e as Error).message }; }
  // deno-lint-ignore no-explicit-any
  const ok = (r: any) => r && r.status === 400 && /BadDeviceToken/.test(r.body);
  return { ...out, works: ok(out.fetch) ? 'fetch' : ok(out.node) ? 'node' : null };
}
async function tokensFor(serials?: string[]) {
  let q = db.from('pass_registrations').select('push_token');
  if (serials) q = q.in('serial', serials);
  const { data } = await q;
  return (data || []).map((r) => r.push_token as string);
}
async function bumpAndPush(p: Profile, patch: Record<string, unknown> = {}) {
  await db.from('profiles').update({ ...patch, pass_updated_at: new Date().toISOString() }).eq('id', p.id);
  return apnsPush(await tokensFor([p.serial]));
}

// ---------- Google Wallet (club's own issuer account: free, unlimited live updates) ----------
// Same look as the iPhone poster pass: dark card, lime CPSC logo, skier artwork, member name,
// member # / check-in word / season row, QR code. Objects are created up front so the
// check-in word, tests and removals update the pass on the phone without re-adding it.
const G_API = 'https://walletobjects.googleapis.com/walletobjects/v1';
const gText = (v: string) => ({ defaultValue: { language: 'en-US', value: v } });
const gIssuer = () => env('GOOGLE_ISSUER_ID');
const gClassId = () => `${gIssuer()}.${env('GOOGLE_CLASS_SUFFIX') || 'cpsc_member_2026'}`;
const gObjectId = (p: Profile) => `${gIssuer()}.member_${p.serial.replace(/-/g, '')}`;
function gCreds(): { client_email: string; private_key: string } {
  const raw = env('GOOGLE_SERVICE_ACCOUNT') || secret('GOOGLE_SERVICE_ACCOUNT')?.toString('utf8') || '';
  return JSON.parse(raw);
}

let gToken: { value: string; exp: number } | null = null;
async function googleToken() {
  if (gToken && gToken.exp > Date.now() + 60_000) return gToken.value;
  const c = gCreds();
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/wallet_object.issuer' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(c.client_email).setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt().setExpirationTime('1h').sign(await importPKCS8(c.private_key, 'RS256'));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const d = await r.json();
  if (!r.ok) { console.error('Google token error', d); throw new Error('Google Wallet login failed — check the service account secret.'); }
  gToken = { value: d.access_token, exp: Date.now() + d.expires_in * 1000 };
  return gToken.value;
}
async function gFetch(path: string, method = 'GET', body?: unknown) {
  return fetch(G_API + path, {
    method, headers: { Authorization: `Bearer ${await googleToken()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const G_ROW = (path: string) => ({ firstValue: { fields: [{ fieldPath: `object.textModulesData['${path}']` }] } });
function googleClass() {
  return {
    id: gClassId(),
    issuerName: ORG,
    hexBackgroundColor: BG,
    multipleDevicesAndHoldersAllowedStatus: 'ONE_USER_ALL_DEVICES',
    classTemplateInfo: {
      cardTemplateOverride: {
        cardRowTemplateInfos: [{ threeItems: { startItem: G_ROW('no'), middleItem: G_ROW('code'), endItem: G_ROW('season') } }],
      },
    },
  };
}
function googleObject(p: Profile, code: string, voided = false) {
  return {
    id: gObjectId(p),
    classId: gClassId(),
    state: voided ? 'INACTIVE' : 'ACTIVE',
    hexBackgroundColor: BG,
    logo: { sourceUri: { uri: `${SITE_URL}/img/pass/google-logo.png` }, contentDescription: gText(SHORT) },
    cardTitle: gText(ORG),
    subheader: gText('LIVE TO SKI, LOVE TO PARTY'),
    header: gText(p.name),
    heroImage: { sourceUri: { uri: `${SITE_URL}/img/pass/google-hero.png` }, contentDescription: gText(`${SHORT} skier`) },
    textModulesData: [
      { id: 'no', header: p.is_admin ? 'EXEC BOARD' : 'MEMBER', body: voided ? 'Ended' : (memberNo(p) || 'Member') },
      { id: 'code', header: 'CHECK-IN', body: voided ? '—' : code },
      { id: 'season', header: p.membership === 'spring' ? 'SPRING' : 'SEASON', body: season(p) },
      ...(p.member_until && !voided ? [{ id: 'thru', header: 'VALID THRU', body: validThru(p) }] : []),
    ],
    ...(expiresAt(p) && !voided ? { validTimeInterval: { end: { date: expiresAt(p) } } } : {}),
    barcode: { type: 'QR_CODE', value: QR(voided ? 'void' : p.serial) },
    linksModuleData: { uris: [{ uri: SITE_URL + '/card.html', description: 'My CPSC card', id: 'card' }, { uri: CLUB, description: 'cpsconline.com', id: 'club' }] },
  };
}

let gClassOk = false;
async function ensureGoogleClass() {
  if (gClassOk) return;
  const cls = googleClass();
  let r = await gFetch(`/genericClass/${cls.id}`, 'PUT', cls);            // update the design if it exists
  if (r.status === 404) r = await gFetch('/genericClass', 'POST', cls);    // first time: create it
  if (!r.ok) { console.error('Google class error', r.status, await r.text()); throw new Error('Google Wallet rejected the pass design.'); }
  gClassOk = true;
}
// Update a member's Google pass in place (true = updated, false = they never saved one)
export async function googleUpdate(p: Profile, code: string, voided = false) {
  await ensureGoogleClass();
  const r = await gFetch(`/genericObject/${gObjectId(p)}`, 'PUT', googleObject(p, code, voided));
  if (r.status === 404) return false;
  if (!r.ok) { console.error('Google update error', r.status, await r.text()); throw new Error('Google Wallet update failed.'); }
  return true;
}
export async function googleSaveUrl(p: Profile) {
  const code = p.pass_test_code || (await currentCode()).text;
  // Create (or refresh) the object first so later updates reach the phone
  if (!(await googleUpdate(p, code))) {
    const r = await gFetch('/genericObject', 'POST', googleObject(p, code));
    if (!r.ok && r.status !== 409) { console.error('Google create error', r.status, await r.text()); throw new Error('Google Wallet rejected the pass.'); }
  }
  const c = gCreds();
  const jwt = await new SignJWT({
    iss: c.client_email,
    aud: 'google',
    typ: 'savetowallet',
    origins: [...new Set([new URL(SITE_URL).origin, 'https://cpsconline.vercel.app', ...env('EXTRA_ORIGINS').split(',').filter(Boolean)])],
    payload: { genericObjects: [{ id: gObjectId(p), classId: gClassId() }] },
  }).setProtectedHeader({ alg: 'RS256', typ: 'JWT' }).setIssuedAt().sign(await importPKCS8(c.private_key, 'RS256'));
  return `https://pay.google.com/gp/v/save/${jwt}`;
}
// Push the current word to every member's Google pass
export async function googleRefreshAll() {
  const code = (await currentCode()).text;
  const { data } = await db.from('profiles').select(PROFILE_COLS);
  const queue = [...((data || []) as Profile[])];
  let updated = 0, failed = 0;
  async function worker() {
    for (let p = queue.shift(); p; p = queue.shift()) {
      try { if (await googleUpdate(p, p.pass_test_code || code)) updated++; } catch { failed++; }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  return { updated, failed };
}

// ---------- Dues: Stripe Checkout (the club's own Stripe account) ----------
// New members pay on the Join page → their email is approved automatically. Members renewing get
// their card extended and their wallet pass updated. Card details never touch this site.
const STRIPE_KEY = env('STRIPE_SECRET_KEY');
export const stripeReady = () => !!STRIPE_KEY;
const PLANS: Record<string, { label: string; col: string; membership: 'full' | 'spring' }> = {
  new: { label: 'Full-year membership', col: 'price_new_cents', membership: 'full' },
  returning: { label: 'Full-year membership (returning member)', col: 'price_returning_cents', membership: 'full' },
  spring: { label: 'Spring membership', col: 'price_spring_cents', membership: 'spring' },
};
const pacificMonth = () => +new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'numeric' });
export const springOpen = () => pacificMonth() <= 5;               // spring memberships: January through May
const fmtDay = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
async function membershipEnd(): Promise<string> {
  const { data, error } = await db.rpc('membership_end');
  if (error || !data) throw new Error('Could not work out the membership dates.');
  return data as string;
}
async function duesPrices() {
  const { data } = await db.from('club_settings').select('price_new_cents,price_returning_cents,price_spring_cents').eq('id', 1).maybeSingle();
  return { new: data?.price_new_cents ?? 5569, returning: data?.price_returning_cents ?? 5069, spring: data?.price_spring_cents ?? 2569 };
}
async function stripe(path: string, params?: Record<string, string>) {
  const r = await fetch('https://api.stripe.com/v1/' + path, {
    method: params ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${STRIPE_KEY}`, ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: params ? new URLSearchParams(params) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { console.error('Stripe error', r.status, d?.error?.message); throw new Error('PAY:' + (d?.error?.message || 'The payment service had a problem.')); }
  return d;
}
const allowedOrigins = () => [...new Set([SITE_URL && new URL(SITE_URL).origin, 'https://cpsconline.vercel.app', 'https://cpsc-ten.vercel.app',
  'https://mr-albenberg.github.io', ...env('EXTRA_ORIGINS').split(',').filter(Boolean)].filter(Boolean))];
const payErr = (msg: string, status = 400) => json({ error: msg }, status);

async function startCheckout(body: Record<string, unknown>) {
  if (!stripeReady()) return payErr('Paying online isn’t switched on yet.', 503);
  const email = String(body.email || '').trim().toLowerCase();
  const name = String(body.name || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  const planKey = String(body.plan || '');
  const plan = PLANS[planKey];
  if (!plan) return payErr('Pick a membership.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return payErr('Type a valid email.');
  if (name.length < 2) return payErr('Type your name.');
  if (planKey === 'spring' && !springOpen()) return payErr('Spring memberships are sold January through May.');
  let ret: URL;
  try { ret = new URL(String(body.returnUrl || '')); } catch { return payErr('Bad return page.'); }
  if (!allowedOrigins().includes(ret.origin)) return payErr('Bad return page.');
  const until = await membershipEnd();
  const [{ data: approved }, { data: prof }] = await Promise.all([
    db.from('approved_emails').select('member_until').eq('email', email).maybeSingle(),
    db.from('profiles').select('id').eq('email', email).maybeSingle(),
  ]);
  if (approved?.member_until && approved.member_until >= until) return payErr(`You’re already a member through ${fmtDay(approved.member_until)} — no need to pay again.`);
  if (planKey === 'returning' && !approved && !prof) return payErr('We couldn’t find a past membership for that email. Choose New member, or use the email you joined with before.');
  const cents = (await duesPrices())[planKey as 'new' | 'returning' | 'spring'];
  const page = ret.origin + ret.pathname;
  const session = await stripe('checkout/sessions', {
    mode: 'payment',
    customer_email: email,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(cents),
    'line_items[0][price_data][product_data][name]': `${SHORT} ${plan.label}`,
    'line_items[0][price_data][product_data][description]': `Valid through ${fmtDay(until)}`,
    'metadata[email]': email, 'metadata[name]': name, 'metadata[plan]': planKey, 'metadata[until]': until,
    'payment_intent_data[description]': `${SHORT} ${plan.label} — ${name} (${email})`,
    success_url: `${page}?paid={CHECKOUT_SESSION_ID}#pay`,
    cancel_url: `${page}?canceled=1#pay`,
  });
  await db.from('payments').upsert({ session_id: session.id, email, name, plan: planKey, amount_cents: cents, status: 'pending' });
  return json({ url: session.url });
}

// Payment went through → approve / renew, then update their wallet pass. Safe to run more than once.
async function fulfill(session: Record<string, any>) {
  const m = session.metadata || {};
  const email = String(m.email || session.customer_email || '').toLowerCase();
  const plan = PLANS[m.plan];
  if (session.payment_status !== 'paid' || !email || !plan) return { paid: false };
  const until = String(m.until || (await membershipEnd()));
  const { data: pay } = await db.from('payments').select('status').eq('session_id', session.id).maybeSingle();
  const { data: prof } = await db.from('profiles').select(PROFILE_COLS).eq('email', email).maybeSingle();
  if (pay?.status !== 'paid') {
    await db.from('payments').upsert({ session_id: session.id, email, name: m.name || null, plan: m.plan, amount_cents: session.amount_total ?? 0, status: 'paid', paid_at: new Date().toISOString() });
    const { data: cur } = await db.from('approved_emails').select('member_until,note').eq('email', email).maybeSingle();
    const keep = cur?.member_until && cur.member_until > until;
    const row: Record<string, unknown> = {
      email, membership: plan.membership, member_until: keep ? cur.member_until : until,
      paid_cents: session.amount_total ?? null, paid_at: new Date().toISOString(),
      note: `Paid online · ${plan.label} · $${((session.amount_total ?? 0) / 100).toFixed(2)}`,
    };
    if (!cur) row.added_by = 'Online payment';
    const { error } = await db.from('approved_emails').upsert(row, { onConflict: 'email' });
    if (error) { console.error('approve after payment', error); throw new Error('PAY:Your payment went through, but we couldn’t update your membership. Show this page to the exec board.'); }
    if (prof) { // renewing member: refresh the card in their wallet
      const p = (await profileFor((prof as Profile).id)) as Profile;
      try {
        if (appleReady()) await bumpAndPush(p);
        if (googleReady()) await googleUpdate(p, p.pass_test_code || (await currentCode()).text).catch(() => false);
        if (wwReady() && p.wallet_serial) await wwPassFor(p);
      } catch (e) { console.error('pass refresh after payment', e); }
    }
  }
  return { paid: true, email, name: m.name || '', plan: m.plan, until: fmtDay(until), hasAccount: !!prof };
}

async function checkoutStatus(body: Record<string, unknown>) {
  if (!stripeReady()) return payErr('Paying online isn’t switched on yet.', 503);
  const id = String(body.session || '');
  if (!/^cs_[A-Za-z0-9_]{10,200}$/.test(id)) return payErr('Unknown payment.');
  return json(await fulfill(await stripe('checkout/sessions/' + id)));
}

// Stripe → us when a payment completes (covers people who close the tab before coming back)
async function stripeWebhook(req: Request) {
  const raw = await req.text();
  const secretKey = env('STRIPE_WEBHOOK_SECRET');
  const header = req.headers.get('stripe-signature') || '';
  const t = header.match(/(?:^|,)t=(\d+)/)?.[1];
  const sigs = [...header.matchAll(/(?:^|,)v1=([0-9a-f]+)/g)].map((x) => x[1]);
  if (!secretKey || !t || !sigs.length || Math.abs(Date.now() / 1000 - +t) > 300) return new Response('bad signature', { status: 400 });
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secretKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${raw}`)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const same = (a: string) => a.length === mac.length && [...a].reduce((d, c, i) => d | (c.charCodeAt(0) ^ mac.charCodeAt(i)), 0) === 0;
  if (!sigs.some(same)) return new Response('bad signature', { status: 400 });
  const evt = JSON.parse(raw);
  if (evt.type === 'checkout.session.completed' || evt.type === 'checkout.session.async_payment_succeeded') await fulfill(evt.data.object);
  return json({ received: true });
}

// ---------- HTTP ----------
async function profileFor(id: string) {
  const { data } = await db.from('profiles').select(PROFILE_COLS).eq('id', id).maybeSingle();
  return data as Profile | null;
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = new URL(req.url);
  try {
    // Apple Wallet calling back (registrations, updates) — must come before anything else
    const ws = await appleWebService(req, url);
    if (ws) return ws;

    // Stripe webhook: …/functions/v1/wallet?stripe-webhook (or …/wallet/stripe-webhook)
    if (req.method === 'POST' && (url.searchParams.has('stripe-webhook') || /stripe-webhook\/?$/.test(url.pathname))) return await stripeWebhook(req);

    // Dues prices + whether paying online is on (Join page, no login needed)
    if (req.method === 'GET' && url.searchParams.has('prices')) {
      return json({ ready: stripeReady(), prices: await duesPrices(), springOpen: springOpen(), until: fmtDay(await membershipEnd()) });
    }

    // Which wallets are switched on (used to enable the buttons on the card page)
    if (req.method === 'GET' && url.searchParams.has('status')) return json({ apple: appleReady() || wwReady(), google: googleReady() || wwReady() });

    // Apple pass download via short-lived link
    if (req.method === 'GET' && url.searchParams.has('t')) {
      const id = await readToken(url.searchParams.get('t')!);
      const p = id && (await profileFor(id));
      if (!p) return new Response('This link has expired. Go back to your card and tap Add to Apple Wallet again.', { status: 410, headers: cors });
      let buf: Buffer;
      if (appleReady()) {
        buf = await buildApplePass(p, await thumbBuffer(p.id), p.pass_test_code || (await settingsInfo()).code);
        if (wwReady()) await retireOthers(p.id, null); // one working CPSC pass: void older hosted copies
      } else {
        const cur = await wwPassFor(p);
        await retireOthers(p.id, cur.serial); // one working CPSC pass per member
        const { data: file } = await db.storage.from('photos').download(`${p.id}/pass.pkpass`);
        if (!file) throw new Error('pass file missing');
        buf = Buffer.from(await file.arrayBuffer());
      }
      return new Response(new Uint8Array(buf), {
        headers: { ...cors, 'Content-Type': 'application/vnd.apple.pkpass', 'Content-Disposition': 'attachment; filename="cpsc-membership.pkpass"' },
      });
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      // Paying dues works without an account (new members sign up after paying)
      if (body.kind === 'checkout') return await startCheckout(body);
      if (body.kind === 'checkout-status') return await checkoutStatus(body);
      const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
      const { data: { user } } = await db.auth.getUser(jwt);
      if (!user) return json({ error: 'Please log in again.' }, 401);
      const p = await profileFor(user.id);
      if (!p) return json({ error: 'Account not found.' }, 404);
      const kind = body.kind;
      const isAdmin = async () => !!(await db.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()).data?.is_admin;

      // Member changed their photo → refresh their pass (only if they already have one)
      if (kind === 'sync') {
        if (appleReady()) await bumpAndPush(p);
        if (wwReady() && (p.wallet_serial || (await readCache(p.id))?.serial)) await wwPassFor(p);
        return json({ ok: true });
      }
      // Admin renewed someone → refresh that member's pass (new valid-through date)
      if (kind === 'sync-member') {
        if (!(await isAdmin())) return json({ error: 'Admins only.' }, 403);
        const t = await profileFor(String(body.userId || ''));
        if (t) {
          if (appleReady()) await bumpAndPush(t);
          if (googleReady()) await googleUpdate(t, t.pass_test_code || (await currentCode()).text).catch(() => false);
          if (wwReady() && t.wallet_serial) await wwPassFor(t);
        }
        return json({ ok: true });
      }
      // Admin: push the current check-in code to every pass
      if (kind === 'refresh') {
        if (!(await isAdmin())) return json({ error: 'Admins only.' }, 403);
        if (!wwReady() && !appleReady()) return json({ error: 'Wallet passes are not set up.' }, 503);
        const code = (await currentCode()).text;
        const apple = appleReady() ? await apnsPush(await tokensFor()) : { sent: 0, failed: 0, gone: 0 };
        const ww = wwReady() ? await wwRefreshAll() : { updated: 0, phones: 0, failed: 0, gone: 0, total: 0, quotaHit: false };
        const google = googleReady() ? await googleRefreshAll() : { updated: 0, failed: 0 };
        return json({ code, total: ww.total + google.updated, updated: ww.updated + apple.sent + google.updated, phones: ww.phones + apple.sent + google.updated,
                      failed: ww.failed + apple.failed + google.failed, gone: ww.gone + apple.gone, quotaHit: ww.quotaHit, apple, google });
      }
      // Admin: check that Apple accepts the push certificate from here
      if (kind === 'apns-check') {
        if (!(await isAdmin())) return json({ error: 'Admins only.' }, 403);
        if (!appleReady()) return json({ error: 'Apple certificate not set up.' }, 503);
        return json(await apnsCheck());
      }
      // Admin: how many passes exist. Also clears out any old WalletWallet passes still around.
      if (kind === 'count') {
        if (!(await isAdmin())) return json({ error: 'Admins only.' }, 403);
        const purged = await purgeWalletWallet().catch((e) => { console.error('ww purge', e); return null; });
        if (purged?.deleted) console.log('Deleted WalletWallet passes', purged);
        const { count } = await db.from('profiles').select('id', { count: 'exact', head: true }).not('wallet_serial', 'is', null);
        const { count: phones } = appleReady() ? await db.from('pass_registrations').select('device_id', { count: 'exact', head: true }) : { count: 0 };
        return json({ passes: count || 0, applePhones: phones || 0, wwDeleted: purged?.deleted || 0 });
      }
      // Admin: send a test word to YOUR OWN pass (or put the real code back) to check live updates
      const hasApple = appleReady() && (await tokensFor([p.serial])).length > 0;
      const hasGoogle = kind === 'test' && googleReady() && (await googleUpdate(p, p.pass_test_code || (await currentCode()).text).catch(() => false));
      if (kind === 'test' && (hasApple || hasGoogle)) {
        if (!(await isAdmin())) return json({ error: 'Admins only.' }, 403);
        const restore = body.action === 'restore';
        const t = new Date().toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' });
        const testCode = restore ? null : `Test ${t}`;
        const r = hasApple ? await bumpAndPush(p, { pass_test_code: testCode }) : (await db.from('profiles').update({ pass_test_code: testCode }).eq('id', p.id), { sent: 0, failed: 0 });
        const shown = testCode || (await currentCode()).text;
        const g = hasGoogle ? await googleUpdate(p, shown).catch(() => false) : false;
        return json({ code: shown, phones: r.sent + (g ? 1 : 0), failed: r.failed });
      }
      if (kind === 'test') {
        if (!(await isAdmin())) return json({ error: 'Admins only.' }, 403);
        if (!wwReady()) return json({ error: 'Add your card to Apple Wallet first, then run the test.' }, 400);
        const cache = await readCache(p.id);
        const serial = p.wallet_serial || cache?.serial;
        if (!serial || !cache?.googleSaveUrl) return json({ error: 'Add your card to Apple or Google Wallet first, then run the test.' }, 400);
        if (body.action === 'restore') {
          const c = await wwPassFor(p); // cache is marked stale by the test, so this pushes the real code
          return json({ code: (await currentCode()).text, serial: c.serial });
        }
        const t = new Date().toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' });
        const testCode = `Test ${t}`;
        const phones = await wwUpdate(serial, wwBody(p, testCode, await thumbFor(p.id)));
        if (phones === null) return json({ error: 'That pass no longer exists. Tap Add to Wallet on your card page to get a fresh one.' }, 410);
        await track(p.id, serial);
        await writeCache(p.id, { ...(cache as WWCache), serial, sig: sigOf(p, testCode) }); // next add/restore re-syncs
        await refreshPkpass(p.id, { ...(cache || {}), serial });
        return json({ code: testCode, phones });
      }
      // Admin: void a member's pass before removing their account
      if (kind === 'revoke') {
        if (!(await isAdmin())) return json({ error: 'Admins only.' }, 403);
        const target = await profileFor(String(body.userId || ''));
        if (!target) return json({ ok: true, voided: 0 });
        let appleVoided = 0;
        if (googleReady() && (await googleUpdate(target, '', true).catch(() => false))) appleVoided++;
        if (appleReady()) {
          await db.from('voided_passes').upsert({ serial: target.serial, name: target.name });
          appleVoided = (await apnsPush(await tokensFor([target.serial]))).sent;
        }
        if (!wwReady()) return json({ ok: true, voided: appleVoided });
        const c = await readCache(target.id);
        for (const sr of [target.wallet_serial, c?.serial]) if (sr) await track(target.id, sr);
        return json({ ok: true, voided: appleVoided + (await retireOthers(target.id, null)) });
      }

      if (kind === 'apple') {
        if (!appleReady() && !wwReady()) return json({ error: 'Apple Wallet is not set up yet.' }, 503);
        if (!appleReady()) await wwPassFor(p); // create it now so the download link is instant
        return json({ url: `${SUPABASE_URL}/functions/v1/wallet?t=${encodeURIComponent(await makeToken(p.id))}` });
      }
      if (kind === 'google') {
        if (!googleReady() && !wwReady()) return json({ error: 'Google Wallet is not set up yet.' }, 503);
        if (!googleReady()) {
          const cur = await wwPassFor(p);
          await retireOthers(p.id, cur.serial); // one working CPSC pass per member
          return json({ url: cur.googleSaveUrl });
        }
        const url = await googleSaveUrl(p);
        if (wwReady()) await retireOthers(p.id, null); // one working CPSC pass: void older hosted copies
        return json({ url });
      }
      return json({ error: 'Unknown wallet type.' }, 400);
    }
    return json({ error: 'Not found' }, 404);
  } catch (e) {
    console.error(e);
    if (e instanceof Error && e.message.startsWith('PAY:')) return json({ error: e.message.slice(4) }, 502);
    const msg = e instanceof Error && /wallet service|limit/.test(e.message) ? e.message : 'Could not build the wallet pass. Try again in a minute.';
    return json({ error: msg }, 500);
  }
}

Deno.serve(handler);
