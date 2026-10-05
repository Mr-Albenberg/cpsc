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

const env = (k: string) => Deno.env.get(k) ?? '';
const SUPABASE_URL = env('SUPABASE_URL').replace(/\/$/, '');
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');
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

type Profile = { id: string; email: string; name: string; serial: string; created_at: string };

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
  const { data } = await db.from('profiles').select('id,email,name,serial,created_at').eq('id', id).maybeSingle();
  return data as Profile | null;
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = new URL(req.url);
  try {
    // Which wallets are switched on (used to enable the buttons on the card page)
    if (req.method === 'GET' && url.searchParams.has('status')) return json({ apple: appleReady(), google: googleReady() });

    // Apple pass download via short-lived link
    if (req.method === 'GET' && url.searchParams.has('t')) {
      const id = await readToken(url.searchParams.get('t')!);
      const p = id && (await profileFor(id));
      if (!p) return new Response('This link has expired. Go back to your card and tap Add to Apple Wallet again.', { status: 410, headers: cors });
      const { data: thumbBlob } = await db.storage.from('photos').download(`${p.id}/thumb.png`);
      const thumb = thumbBlob ? Buffer.from(await thumbBlob.arrayBuffer()) : null;
      const buf = await buildApplePass(p, thumb, await logo());
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
      const { kind } = await req.json().catch(() => ({}));

      if (kind === 'apple') {
        if (!appleReady()) return json({ error: 'Apple Wallet is not set up yet.' }, 503);
        return json({ url: `${SUPABASE_URL}/functions/v1/wallet?t=${encodeURIComponent(await makeToken(p.id))}` });
      }
      if (kind === 'google') {
        if (!googleReady()) return json({ error: 'Google Wallet is not set up yet.' }, 503);
        // Google's servers fetch the photo from this long-lived private link to show it on the pass
        const { data: signed } = await db.storage.from('photos').createSignedUrl(`${p.id}/photo.jpg`, 60 * 60 * 24 * 365 * 5);
        return json({ url: await googleSaveUrl(p, signed?.signedUrl ?? null) });
      }
      return json({ error: 'Unknown wallet type.' }, 400);
    }
    return json({ error: 'Not found' }, 404);
  } catch (e) {
    console.error(e);
    return json({ error: 'Could not build the wallet pass. Check the function logs.' }, 500);
  }
}

Deno.serve(handler);
