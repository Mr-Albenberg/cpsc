// CPSC wallet function (Supabase Edge Function, single file).
// Builds Apple Wallet passes and Google Wallet "save" links. The signing keys live
// in this function's secrets, never in the public website.
//
// Deploy: Supabase → Edge Functions → Deploy a new function → name it "wallet" →
// paste this file → turn OFF "Verify JWT" (this function checks logins itself).

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
const BG = env('PASS_BG') || '#0b1d33';
const FG = env('PASS_FG') || '#ffffff';
const LABEL = env('PASS_LABEL') || '#7fd0ff';

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const secret = (k: string) => {
  const v = env(k + '_B64').replace(/\s+/g, '');
  return v ? Buffer.from(v, 'base64') : null;
};
export const appleReady = () =>
  !!(env('APPLE_PASS_TYPE_ID') && env('APPLE_TEAM_ID') && secret('APPLE_WWDR') && secret('APPLE_SIGNER_CERT') && secret('APPLE_SIGNER_KEY') && SITE_URL);
export const googleReady = () => !!(env('GOOGLE_ISSUER_ID') && secret('GOOGLE_SERVICE_ACCOUNT') && SITE_URL);

// ---------- WalletWallet (free hosted signing, no Apple/Google accounts needed) ----------
// Used for whichever wallet doesn't have its own keys configured above.
// Each member gets ONE pass. When the weekly check-in code changes, the pass is updated
// in place and WalletWallet pushes the change to every phone that added it.
const WW = 'https://api.walletwallet.dev';
const WW_KEY = env('WALLETWALLET_API_KEY');
export const wwReady = () => !!WW_KEY;
const wwHeaders = () => ({ Authorization: `Bearer ${WW_KEY}`, 'Content-Type': 'application/json' });
type WWCache = { v: 3; serial: string; googleSaveUrl: string; token: string; passType: string; sig: string };

export async function currentCode(): Promise<{ word: string; emoji: string; text: string }> {
  const { data } = await db.from('club_settings').select('week_word,week_emoji').eq('id', 1).maybeSingle();
  const word = data?.week_word || 'POWDER', emoji = data?.week_emoji || '🏔️';
  return { word, emoji, text: `${emoji} ${word}`.trim() };
}

function season() {
  const now = new Date();
  const y = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1; // season starts in summer
  return `${y}–${String(y + 1).slice(2)}`;
}

export function wwBody(p: Profile, code: string, thumbUri?: string) {
  const portal = (SITE_URL || 'https://mr-albenberg.github.io/cpsc') + '/card.html';
  return {
    logoText: `${SHORT} ❄`,
    organizationName: ORG,
    description: `${ORG} Membership Card`,
    colorPreset: env('WALLETWALLET_COLOR') || 'blue',
    colorPro: BG,                 // paid plan only (ignored on free)
    thumbnailURLPro: thumbUri,    // paid plan only (ignored on free)
    headerFields: [{ label: 'THIS WEEK', value: code }],
    primaryFields: [{ label: 'MEMBER', value: p.name }],
    secondaryFields: [
      { label: 'STATUS', value: 'Active ✓' },
      { label: 'SEASON', value: season() },
      { label: 'SINCE', value: String(new Date(p.created_at).getFullYear()) },
    ],
    backFields: [
      { label: 'Check-in code', value: `This week's code is ${code}. It changes regularly and updates on its own — a card without the current code isn't valid.` },
      { label: 'Live to ski, love to party', value: `Show this card at ${SHORT} events, trips and sponsor discounts.` },
      { label: 'Member', value: `${p.name} · ${p.email}` },
      { label: 'Member portal', value: portal },
      { label: 'Club site', value: 'https://cpsconline.com' },
    ],
    barcodeValue: QR(p.serial),
    barcodeFormat: 'QR',
    barcodeAltText: p.name.slice(0, 128),
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

// Make sure this member has an up-to-date pass. Creates it on first use, updates it if stale.
export async function wwPassFor(p: Profile): Promise<WWCache> {
  const code = (await currentCode()).text;
  const sig = `${p.name}|${code}`;
  const cache = await readCache(p.id);
  const serial = p.wallet_serial || cache?.serial;

  if (serial && cache?.v === 3 && cache.serial === serial && cache.sig === sig) return cache as WWCache;

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
        return c;
      }
    }
  }

  // No usable pass yet → create one.
  const r = await fetch(`${WW}/api/passes`, { method: 'POST', headers: wwHeaders(), body: JSON.stringify(wwBody(p, code, await thumbFor(p.id))) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.serialNumber) wwError(r.status, d);
  if (serial && serial !== d.serialNumber) {
    await fetch(`${WW}/api/passes/${serial}`, { method: 'DELETE', headers: wwHeaders() }).catch(() => {});
  }
  const buf = new Uint8Array(Buffer.from(d.applePass, 'base64'));
  const meta = passMeta(buf);
  await savePkpass(p.id, buf);
  const c: WWCache = { v: 3, serial: d.serialNumber, googleSaveUrl: d.googleSaveUrl, token: meta.token, passType: meta.passType, sig };
  await writeCache(p.id, c);
  await db.from('profiles').update({ wallet_serial: d.serialNumber }).eq('id', p.id);
  return c;
}

// Push the current code to every member's pass (admin "Update all passes" button).
export async function wwRefreshAll() {
  const code = (await currentCode()).text;
  const { data: members } = await db.from('profiles').select('id,email,name,serial,created_at,wallet_serial').not('wallet_serial', 'is', null);
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
        if (cache?.serial === p.wallet_serial && cache.googleSaveUrl) {
          await writeCache(p.id, { ...(cache as WWCache), v: 3, sig: `${p.name}|${code}` });
          if (cache.token && cache.passType) {
            const r = await fetch(`${WW}/v1/passes/${cache.passType}/${p.wallet_serial}`, { headers: { Authorization: `ApplePass ${cache.token}` } });
            if (r.ok) await savePkpass(p.id, new Uint8Array(await r.arrayBuffer()));
          }
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

// ---------- Apple ----------
let logoCache: Buffer | null = null;
async function logo() {
  if (!logoCache) {
    const r = await fetch(`${SITE_URL}/img/logo.png`);
    if (!r.ok) throw new Error('Could not load img/logo.png from SITE_URL');
    logoCache = Buffer.from(await r.arrayBuffer());
  }
  return logoCache;
}

type Profile = { id: string; email: string; name: string; serial: string; created_at: string; wallet_serial?: string | null };

export async function buildApplePass(p: Profile, thumb: Buffer | null, logoPng: Buffer) {
  const files: Record<string, Buffer> = {
    'pass.json': Buffer.from(JSON.stringify({
      formatVersion: 1,
      passTypeIdentifier: env('APPLE_PASS_TYPE_ID'),
      teamIdentifier: env('APPLE_TEAM_ID'),
      organizationName: ORG,
      description: `${ORG} Membership Card`,
      serialNumber: p.serial,
      backgroundColor: rgb(BG),
      foregroundColor: rgb(FG),
      labelColor: rgb(LABEL),
      logoText: SHORT,
      generic: {
        primaryFields: [{ key: 'name', label: 'MEMBER', value: p.name }],
        secondaryFields: [
          { key: 'status', label: 'STATUS', value: 'Active Member' },
          { key: 'since', label: 'MEMBER SINCE', value: String(new Date(p.created_at).getFullYear()) },
        ],
        backFields: [
          { key: 'email', label: 'Email', value: p.email },
          { key: 'site', label: 'Member portal', value: SITE_URL },
        ],
      },
      barcodes: [{ format: 'PKBarcodeFormatQR', message: QR(p.serial), messageEncoding: 'iso-8859-1', altText: p.name }],
    })),
    'icon.png': logoPng,
    'icon@2x.png': logoPng,
    'logo.png': logoPng,
    'logo@2x.png': logoPng,
  };
  if (thumb) { files['thumbnail.png'] = thumb; files['thumbnail@2x.png'] = thumb; }
  const pass = new PKPass(files, {
    wwdr: secret('APPLE_WWDR')!,
    signerCert: secret('APPLE_SIGNER_CERT')!,
    signerKey: secret('APPLE_SIGNER_KEY')!,
    signerKeyPassphrase: env('APPLE_SIGNER_KEY_PASSPHRASE') || undefined,
  });
  return pass.getAsBuffer();
}

// ---------- Google ----------
export async function googleSaveUrl(p: Profile, photoUrl: string | null) {
  const creds = JSON.parse(secret('GOOGLE_SERVICE_ACCOUNT')!.toString('utf8'));
  const issuer = env('GOOGLE_ISSUER_ID');
  const classId = `${issuer}.${env('GOOGLE_CLASS_SUFFIX') || 'cpsc_membership'}`;
  const text = (v: string) => ({ defaultValue: { language: 'en-US', value: v } });
  const obj: Record<string, unknown> = {
    id: `${issuer}.member_${p.serial.replace(/-/g, '')}`,
    classId,
    state: 'ACTIVE',
    hexBackgroundColor: BG,
    logo: { sourceUri: { uri: `${SITE_URL}/img/logo.png` }, contentDescription: text(ORG) },
    cardTitle: text(ORG),
    subheader: text('Member'),
    header: text(p.name),
    textModulesData: [
      { id: 'status', header: 'Status', body: 'Active Member' },
      { id: 'email', header: 'Email', body: p.email },
    ],
    barcode: { type: 'QR_CODE', value: QR(p.serial), alternateText: p.name },
    linksModuleData: { uris: [{ uri: SITE_URL + '/card.html', description: 'Member portal', id: 'portal' }] },
  };
  if (photoUrl) obj.imageModulesData = [{ id: 'photo', mainImage: { sourceUri: { uri: photoUrl }, contentDescription: text(p.name) } }];

  const key = await importPKCS8(creds.private_key, 'RS256');
  const jwt = await new SignJWT({
    iss: creds.client_email,
    aud: 'google',
    typ: 'savetowallet',
    origins: [new URL(SITE_URL).origin],
    payload: { genericClasses: [{ id: classId }], genericObjects: [obj] },
  }).setProtectedHeader({ alg: 'RS256', typ: 'JWT' }).setIssuedAt().sign(key);
  return `https://pay.google.com/gp/v/save/${jwt}`;
}

// ---------- HTTP ----------
async function profileFor(id: string) {
  const { data } = await db.from('profiles').select('id,email,name,serial,created_at,wallet_serial').eq('id', id).maybeSingle();
  return data as Profile | null;
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = new URL(req.url);
  try {
    // Which wallets are switched on (used to enable the buttons on the card page)
    if (req.method === 'GET' && url.searchParams.has('status')) return json({ apple: appleReady() || wwReady(), google: googleReady() || wwReady() });

    // Apple pass download via short-lived link
    if (req.method === 'GET' && url.searchParams.has('t')) {
      const id = await readToken(url.searchParams.get('t')!);
      const p = id && (await profileFor(id));
      if (!p) return new Response('This link has expired. Go back to your card and tap Add to Apple Wallet again.', { status: 410, headers: cors });
      let buf: Buffer;
      if (appleReady()) {
        const { data: thumbBlob } = await db.storage.from('photos').download(`${p.id}/thumb.png`);
        const thumb = thumbBlob ? Buffer.from(await thumbBlob.arrayBuffer()) : null;
        buf = await buildApplePass(p, thumb, await logo());
      } else {
        await wwPassFor(p);
        const { data: file } = await db.storage.from('photos').download(`${p.id}/pass.pkpass`);
        if (!file) throw new Error('pass file missing');
        buf = Buffer.from(await file.arrayBuffer());
      }
      return new Response(buf, {
        headers: { ...cors, 'Content-Type': 'application/vnd.apple.pkpass', 'Content-Disposition': 'attachment; filename="cpsc-membership.pkpass"' },
      });
    }

    if (req.method === 'POST') {
      const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
      const { data: { user } } = await db.auth.getUser(jwt);
      if (!user) return json({ error: 'Please log in again.' }, 401);
      const p = await profileFor(user.id);
      if (!p) return json({ error: 'Account not found.' }, 404);
      const body = await req.json().catch(() => ({}));
      const kind = body.kind;
      const isAdmin = async () => !!(await db.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()).data?.is_admin;

      // Member changed their photo → refresh their pass (only if they already have one)
      if (kind === 'sync') {
        if (wwReady() && (p.wallet_serial || (await readCache(p.id))?.serial)) await wwPassFor(p);
        return json({ ok: true });
      }
      // Admin: push the current check-in code to every pass
      if (kind === 'refresh') {
        if (!(await isAdmin())) return json({ error: 'Admins only.' }, 403);
        if (!wwReady()) return json({ error: 'Wallet passes are not set up.' }, 503);
        return json(await wwRefreshAll());
      }
      // Admin: how many passes exist (to show the cost of an update)
      if (kind === 'count') {
        if (!(await isAdmin())) return json({ error: 'Admins only.' }, 403);
        const { count } = await db.from('profiles').select('id', { count: 'exact', head: true }).not('wallet_serial', 'is', null);
        return json({ passes: count || 0 });
      }
      // Admin: void a member's pass before removing their account
      if (kind === 'revoke') {
        if (!(await isAdmin())) return json({ error: 'Admins only.' }, 403);
        const target = await profileFor(String(body.userId || ''));
        const c = target ? await readCache(target.id) : null;
        const serial = target?.wallet_serial || c?.serial;
        if (serial && wwReady()) await wwRevoke(serial);
        return json({ ok: true });
      }

      if (kind === 'apple') {
        if (!appleReady() && !wwReady()) return json({ error: 'Apple Wallet is not set up yet.' }, 503);
        if (!appleReady()) await wwPassFor(p); // create it now so the download link is instant
        return json({ url: `${SUPABASE_URL}/functions/v1/wallet?t=${encodeURIComponent(await makeToken(p.id))}` });
      }
      if (kind === 'google') {
        if (!googleReady() && !wwReady()) return json({ error: 'Google Wallet is not set up yet.' }, 503);
        if (!googleReady()) return json({ url: (await wwPassFor(p)).googleSaveUrl });
        // Google's servers fetch the photo from this long-lived private link to show it on the pass
        const { data: signed } = await db.storage.from('photos').createSignedUrl(`${p.id}/photo.jpg`, 60 * 60 * 24 * 365 * 5);
        return json({ url: await googleSaveUrl(p, signed?.signedUrl ?? null) });
      }
      return json({ error: 'Unknown wallet type.' }, 400);
    }
    return json({ error: 'Not found' }, 404);
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error && /wallet service|limit/.test(e.message) ? e.message : 'Could not build the wallet pass. Try again in a minute.';
    return json({ error: msg }, 500);
  }
}

Deno.serve(handler);
