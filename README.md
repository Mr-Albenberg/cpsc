# CPSC Membership Cards

Digital membership cards for Central Pacific Ski Club. Members sign up (approved emails only), get a card with their photo and a QR code, and add it to Apple Wallet or Google Wallet. Exec board admins scan the QR to see the member's photo, name and when they were last scanned.

- **Website:** static pages hosted free on **GitHub Pages** (this repo).
- **Accounts, photos, scan history:** a free **Supabase** project.
- **Wallet passes:** a small Supabase function (`supabase/functions/wallet`) that signs passes with keys stored only in Supabase.

## Pages

| Page | Who | What |
|---|---|---|
| `index.html` | everyone | Log in, forgot password |
| `signup.html` | approved emails | Create account with name, email, password, photo |
| `card.html` | members | Card with QR + Add to Apple / Google Wallet |
| `admin.html` | admins | Approve emails (bulk paste), see members and last scan, make/remove admins, remove accounts |
| `scan.html` | admins | Phone camera scanner — photo, name, last scanned (and by whom), total check-ins |

## Setup (about 15 minutes, all in the browser)

### 1. Create the Supabase project
1. Sign up at **supabase.com** → **New project** (free plan is fine).
2. Open **SQL Editor**, paste all of [`supabase/schema.sql`](supabase/schema.sql), click **Run**.
3. Still in SQL Editor, make yourself the first admin (use your email):
   ```sql
   insert into public.approved_emails (email, make_admin) values ('you@example.com', true);
   ```

### 2. Connect the website
1. In Supabase go to **Project Settings → API** (or the **Connect** button) and copy the **Project URL** and the **anon / publishable key**.
2. In this repo, edit [`config.js`](config.js) and paste them in. (Both are meant to be public — the security rules in the database decide what anyone can do.)

### 3. Turn on GitHub Pages
1. Repo **Settings → Pages** → Source: **Deploy from a branch** → Branch **main**, folder **/ (root)** → Save.
2. After a minute the site is live at **https://mr-albenberg.github.io/cpsc/**.

### 4. Point Supabase at the site
1. Supabase → **Authentication → URL Configuration**: set **Site URL** to `https://mr-albenberg.github.io/cpsc/` and add `https://mr-albenberg.github.io/cpsc/*` under **Redirect URLs**.
2. Optional: **Authentication → Sign In / Providers → Email** → turn off **Confirm email**. Only approved emails can sign up anyway, and members can then add their photo right away instead of after confirming.

Now sign up at `signup.html` with your email — you'll see **Members** and **Scan** in the menu.

### 5. Wallet passes
**Free (default):** the Add to Apple / Google Wallet buttons open a short guide. Members tap **Save card image**, then add it with Apple Wallet's **Create a Pass** (iPhone, iOS 27+) or Google Wallet's **Everything else** photo pass (Android). The pass carries the same QR code, so scanning works the same.

**Optional, official one-tap passes:** if you later get an Apple Developer account and/or a Google Wallet issuer account, fill in the secrets below and the buttons switch to real signed passes automatically. The `wallet` function is already deployed.

**Deploy the function:** Supabase → **Edge Functions → Deploy a new function → Via editor**, name it `wallet`, paste [`supabase/functions/wallet/index.ts`](supabase/functions/wallet/index.ts), deploy. Then open the function's **Details/Settings** and turn **off "Verify JWT"** (it checks logins itself).

**Add secrets:** Edge Functions → **Secrets**:

| Name | Value |
|---|---|
| `SITE_URL` | `https://mr-albenberg.github.io/cpsc` |
| `APPLE_PASS_TYPE_ID` | e.g. `pass.com.cpsconline.membership` |
| `APPLE_TEAM_ID` | your Apple Team ID |
| `APPLE_WWDR_B64` | base64 of `wwdr.pem` |
| `APPLE_SIGNER_CERT_B64` | base64 of `signerCert.pem` |
| `APPLE_SIGNER_KEY_B64` | base64 of `signerKey.pem` |
| `APPLE_SIGNER_KEY_PASSPHRASE` | only if your key has one |
| `GOOGLE_ISSUER_ID` | from the Google Pay & Wallet Console |
| `GOOGLE_SERVICE_ACCOUNT_B64` | base64 of the service account JSON key |

Copy a file as base64 on Windows (PowerShell): `[Convert]::ToBase64String([IO.File]::ReadAllBytes("signerCert.pem")) | Set-Clipboard`

**Apple certificates** (needs an Apple Developer account):
1. developer.apple.com → Certificates, IDs & Profiles → Identifiers → new **Pass Type ID**.
2. Create a **Pass Type ID Certificate** for it, download it, export as `.p12` from Keychain (Mac) or convert with OpenSSL.
3. `openssl pkcs12 -in cert.p12 -clcerts -nokeys -out signerCert.pem -legacy` and `openssl pkcs12 -in cert.p12 -nocerts -out signerKey.pem -legacy`
4. Download Apple **WWDR G4** from apple.com/certificateauthority: `openssl x509 -inform der -in AppleWWDRCAG4.cer -out wwdr.pem`

**Google Wallet** (free):
1. pay.google.com/business/console → Google Wallet API → note your **Issuer ID**.
2. Google Cloud Console → enable **Google Wallet API** → create a **service account** → download a JSON key.
3. Wallet console → **Users** → invite the service account email as **Developer**. Request publishing access before members use it.

**Never commit certificate or key files to this repo** — it's public.

## Branding
- Replace `img/logo.png` with the club logo (square PNG, ~512px). It's used in the header and on both wallet passes.
- Colors are the four variables at the top of `assets/style.css`. Pass colors can be set with the `PASS_BG`, `PASS_FG`, `PASS_LABEL` function secrets.

## How it works / security
- The QR code holds the member's random card ID (`CPSC1:<uuid>`). Only the member and admins can read it, it can't be guessed, and removing a member makes their card scan as invalid.
- The approved-email rule is enforced inside the database, so it can't be bypassed from the browser.
- Members can only see their own profile and photo. Approved list, member list, other photos and scanning are admin-only.
- Removing an email from the approved list blocks *new* sign-ups only. Use **Remove** on the member to revoke an existing card.
- If a member changes their photo they should re-add the pass.
