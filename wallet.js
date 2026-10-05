// Apple Wallet (.pkpass) and Google Wallet ("Save to Google Wallet" link) generation.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const jwt = require('jsonwebtoken');
const { PKPass } = require('passkit-generator');
const { DATA_DIR } = require('./db');

const ORG = process.env.ORG_NAME || 'Central Pacific Ski Club';
const SHORT = process.env.ORG_SHORT || 'CPSC';
const BRAND_BG = process.env.PASS_BG || '#0b1d33';
const BRAND_FG = process.env.PASS_FG || '#ffffff';
const BRAND_LABEL = process.env.PASS_LABEL || '#7fd0ff';
const LOGO_FILE = path.join(__dirname, 'public', 'img', 'logo.png');

const hexToRgb = (h) => {
  const n = parseInt(h.replace('#', ''), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

function readMaybe(p) {
  return p && fs.existsSync(p) ? fs.readFileSync(p) : null;
}

// ---------- Apple ----------
function appleConfigured() {
  return !!(process.env.APPLE_PASS_TYPE_ID && process.env.APPLE_TEAM_ID &&
    readMaybe(process.env.APPLE_WWDR_PATH) && readMaybe(process.env.APPLE_SIGNER_CERT_PATH) &&
    readMaybe(process.env.APPLE_SIGNER_KEY_PATH));
}

async function logoPng(size) {
  if (fs.existsSync(LOGO_FILE)) {
    return sharp(LOGO_FILE).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  }
  // Fallback wordmark if no logo has been dropped into public/img/logo.png
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="100%" height="100%" rx="${size / 5}" fill="${BRAND_BG}"/>
    <text x="50%" y="58%" font-family="Arial Black,Arial" font-weight="900" font-size="${size / 3.2}"
      fill="${BRAND_LABEL}" text-anchor="middle">${SHORT}</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function buildApplePass(user, qrValue) {
  const photoPath = path.join(DATA_DIR, 'photos', `${user.id}.jpg`);
  const files = {
    'pass.json': Buffer.from(JSON.stringify({
      formatVersion: 1,
      passTypeIdentifier: process.env.APPLE_PASS_TYPE_ID,
      teamIdentifier: process.env.APPLE_TEAM_ID,
      organizationName: ORG,
      description: `${ORG} Membership Card`,
      serialNumber: user.serial,
      backgroundColor: hexToRgb(BRAND_BG),
      foregroundColor: hexToRgb(BRAND_FG),
      labelColor: hexToRgb(BRAND_LABEL),
      logoText: SHORT,
      generic: {
        primaryFields: [{ key: 'name', label: 'MEMBER', value: user.name }],
        secondaryFields: [
          { key: 'status', label: 'STATUS', value: 'Active Member' },
          { key: 'since', label: 'MEMBER SINCE', value: new Date(user.created_at + 'Z').getFullYear().toString() },
        ],
        backFields: [
          { key: 'email', label: 'Email', value: user.email },
          { key: 'info', label: 'About', value: `Show this card at ${SHORT} events and trips. Live to ski, love to party.` },
        ],
      },
      barcodes: [{ format: 'PKBarcodeFormatQR', message: qrValue, messageEncoding: 'iso-8859-1', altText: user.name }],
    })),
    'icon.png': await logoPng(29),
    'icon@2x.png': await logoPng(58),
    'icon@3x.png': await logoPng(87),
    'logo.png': await logoPng(50),
    'logo@2x.png': await logoPng(100),
  };
  if (fs.existsSync(photoPath)) {
    files['thumbnail.png'] = await sharp(photoPath).resize(90, 90).png().toBuffer();
    files['thumbnail@2x.png'] = await sharp(photoPath).resize(180, 180).png().toBuffer();
  }
  const pass = new PKPass(files, {
    wwdr: fs.readFileSync(process.env.APPLE_WWDR_PATH),
    signerCert: fs.readFileSync(process.env.APPLE_SIGNER_CERT_PATH),
    signerKey: fs.readFileSync(process.env.APPLE_SIGNER_KEY_PATH),
    signerKeyPassphrase: process.env.APPLE_SIGNER_KEY_PASSPHRASE || undefined,
  });
  return pass.getAsBuffer();
}

// ---------- Google ----------
function googleCreds() {
  const p = process.env.GOOGLE_SERVICE_ACCOUNT_PATH;
  if (!process.env.GOOGLE_ISSUER_ID || !readMaybe(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function googleSaveUrl(user, qrValue, { photoUrl, logoUrl, baseUrl }) {
  const creds = googleCreds();
  if (!creds) return null;
  const issuer = process.env.GOOGLE_ISSUER_ID;
  const classId = `${issuer}.${(process.env.GOOGLE_CLASS_SUFFIX || 'cpsc_membership')}`;
  const objectId = `${issuer}.member_${user.serial.replace(/[^\w.-]/g, '')}`;

  const obj = {
    id: objectId,
    classId,
    state: 'ACTIVE',
    hexBackgroundColor: BRAND_BG,
    logo: { sourceUri: { uri: logoUrl }, contentDescription: { defaultValue: { language: 'en-US', value: ORG } } },
    cardTitle: { defaultValue: { language: 'en-US', value: ORG } },
    subheader: { defaultValue: { language: 'en-US', value: 'Member' } },
    header: { defaultValue: { language: 'en-US', value: user.name } },
    textModulesData: [
      { id: 'status', header: 'Status', body: 'Active Member' },
      { id: 'email', header: 'Email', body: user.email },
    ],
    barcode: { type: 'QR_CODE', value: qrValue, alternateText: user.name },
    linksModuleData: { uris: [{ uri: baseUrl, description: 'Member portal', id: 'portal' }] },
  };
  if (photoUrl) {
    obj.imageModulesData = [{ id: 'photo', mainImage: { sourceUri: { uri: photoUrl }, contentDescription: { defaultValue: { language: 'en-US', value: user.name } } } }];
  }

  const claims = {
    iss: creds.client_email,
    aud: 'google',
    typ: 'savetowallet',
    origins: [baseUrl],
    payload: {
      genericClasses: [{ id: classId }],
      genericObjects: [obj],
    },
  };
  const token = jwt.sign(claims, creds.private_key, { algorithm: 'RS256' });
  return `https://pay.google.com/gp/v/save/${token}`;
}

module.exports = { appleConfigured, buildApplePass, googleSaveUrl, googleCreds, logoPng };
