# CPSC Membership Cards

Digital membership cards for Central Pacific Ski Club: members sign up (approved emails only), get a card with their photo and a QR code, and add it to Apple Wallet or Google Wallet. Exec board admins scan the QR to see the member's photo, name and when they were last scanned.

## Pages

| URL | Who | What |
|---|---|---|
| `/login` | everyone | Log in |
| `/signup` | approved emails | Create account with name, email, password, photo |
| `/card` | members | Card with QR + "Add to Apple / Google Wallet" |
| `/admin` | admins | Approve emails (bulk paste), see members, last scan, make/remove admins, remove accounts |
| `/admin/scan` | admins | Phone camera scanner — shows photo, name, last scanned time (and by whom), total check-ins |

## Quick start

```bash
npm install
cp .env.example .env      # fill in APP_SECRET, PUBLIC_BASE_URL, ADMIN_EMAILS
npm start
```

Then sign up with an email in `ADMIN_EMAILS` — that account becomes an admin. Approve everyone else from `/admin`.

**Branding:** drop the club logo at `public/img/logo.png` (square-ish PNG with transparency works best). It's used in the site header and on both wallet passes. Colors live in the four variables at the top of `public/style.css`, and the pass colors in `.env` (`PASS_BG`, `PASS_FG`, `PASS_LABEL`).

## Hosting

Needs a Node 18+ server with a persistent disk (SQLite database and photos live in `./data`). Railway, Render (with a disk), Fly.io, or a small VPS all work. It **must be served over HTTPS** — phone cameras won't open for the scanner otherwise, and the wallets require it. A subdomain like `cards.cpsconline.com` pointed at the host is the cleanest setup. Back up the `data/` folder.

## Apple Wallet setup (Apple Developer account required)

1. In developer.apple.com → Certificates, IDs & Profiles → Identifiers, create a **Pass Type ID** (e.g. `pass.com.cpsconline.membership`).
2. Create a **Pass Type ID Certificate** for it (you'll upload a CSR made in Keychain Access), download the `.cer`, and export it from Keychain as `.p12`.
3. Convert to PEM:
   ```bash
   openssl pkcs12 -in Certificates.p12 -clcerts -nokeys -out certs/signerCert.pem -legacy
   openssl pkcs12 -in Certificates.p12 -nocerts -out certs/signerKey.pem -legacy
   ```
4. Download Apple's **WWDR G4** certificate from apple.com/certificateauthority and convert: `openssl x509 -inform der -in AppleWWDRCAG4.cer -out certs/wwdr.pem`
5. Fill in the `APPLE_*` values in `.env` (Team ID is on your developer account's Membership page).

## Google Wallet setup (free)

1. Go to pay.google.com/business/console → Google Wallet API → sign up as an issuer. Note your **Issuer ID**.
2. In Google Cloud Console, enable the **Google Wallet API**, create a **service account**, and download its JSON key to `certs/google-service-account.json`.
3. Back in the Wallet console → Users, invite the service account's email with **Developer** access.
4. Fill in `GOOGLE_ISSUER_ID`. Passes work right away for your own test accounts; request **publishing access** in the console before members use it.

Until either wallet is configured, its button is greyed out and members can still show the QR from `/card`.

## How it works / security notes

- QR codes contain `CPSC1:<random card id>.<signature>`, signed with `APP_SECRET`. They can't be guessed or forged, and a removed member's card scans as invalid. **Never change `APP_SECRET` after launch** or every existing card stops working.
- Passwords are bcrypt-hashed; logins are throttled after 10 tries per 15 min.
- Removing an email from the approved list blocks *new* sign-ups only. Use "Remove" on the member to revoke an existing card.
- Google downloads the member photo from a signed, unguessable URL (`/p/...`) so it can show it on the pass.
- If a member changes their photo, they should re-add the pass. (Google Wallet keeps the original object; to refresh it automatically you'd add a call to the Wallet REST API.)
