# CPSC Membership Cards

Digital membership cards for Central Pacific Ski Club. Members sign up (approved emails only), get a card with their photo and a QR code, and add it to Apple Wallet or Google Wallet. Exec board admins scan the QR to see the member's photo, name and when they were last scanned.

- **Website:** static pages hosted free on **Vercel** at **https://cpsconline.vercel.app** (deploys on every push; settings in `vercel.json`) and on **GitHub Pages** at https://mr-albenberg.github.io/cpsc/.
- **Accounts, photos, scan history:** a free **Supabase** project.
- **Wallet passes:** a small Supabase function (`supabase/functions/wallet`) that signs passes with keys stored only in Supabase.

## Pages

| Page | Who | What |
|---|---|---|
| `index.html` | everyone | Site root: the club Home page for visitors; logged-in members go straight to their card |
| `login.html` | everyone | Log in, forgot password |
| `signup.html` | approved emails | Create account with name, email, password, photo |
| `card.html` | members | Card with QR + Add to Apple / Google Wallet |
| `admin.html` | admins | Approve emails (bulk paste), see members and last scan, make/remove admins, remove accounts |
| `scan.html` | admins | Phone camera scanner (starts automatically; search by name or email to look up or check in someone without their pass) — a full-screen green / amber / red result that stays until tapped, then scanning resumes. **Info** opens the member's profile (photo, #, email, since, last scan, check-ins) and keeps it up until closed |
| `exec-board.html` | members | 2026/27 exec board — names, roles, bios and photos. Members only: the text is in the `exec_board` table and photos in the private `club` bucket, both readable only when logged in. Edit in Supabase → Table Editor. Migration: [`008_exec_board.sql`](supabase/migrations/008_exec_board.sql) |
| `home.html`, `about.html`, `events.html`, `big-trip.html`, `ikon.html`, `sponsors.html`, `join.html` | everyone | Club pages with the content from cpsconline.com, restyled. Images live in `img/site/` |

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

**WalletWallet is retired.** The club issues only its own signed Apple passes (and Google Wallet passes once the club's issuer account is set up — see below). Any old hosted WalletWallet passes are deleted automatically the next time an admin opens the Members page; after that the `WALLETWALLET_API_KEY` secret can be removed.

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

## Check-in code (spotting copied cards)
Admins set a code word on `admin.html` (e.g. Bluebird). It appears:
- on every member's **wallet pass**, in the top-right corner with no label — passes update themselves on members' phones, nobody re-adds anything;
- on the **live strip** of the website card, next to a clock ticking in seconds and a moving holographic shimmer (a screenshot freezes);
- on the **scanner**, so door staff know what to look for.

A card showing an old code, no code, or a frozen clock is a copy. Code changes update every Apple pass for free, with no limit. Removing a member also voids their wallet pass.

Database: run [`supabase/migrations/002_weekly_code.sql`](supabase/migrations/002_weekly_code.sql) once in the SQL Editor (already done for the live project).

**One working pass per member.** Every pass issued is recorded. Whenever a member adds their card to Apple or Google Wallet, any older CPSC pass they were issued is voided: iPhone greys it out and moves it to Expired Passes, and Google Wallet revokes it. Removing a member voids all of theirs.

**Testing live updates.** On `admin.html`, *Test on your phone* sends a test word (e.g. Test 5:04 PM) to your own pass only — watch it change in Wallet without re-adding — then *Put the real code back*.

Database: also run [`supabase/migrations/003_wallet_pass_history.sql`](supabase/migrations/003_wallet_pass_history.sql) and [`004_member_numbers.sql`](supabase/migrations/004_member_numbers.sql) (already done for the live project).

## Apple Wallet with the club certificate
iPhone passes are signed with the club's Pass Type ID **pass.com.cpsc.membership** (team 3CND973Q82): club lime, the real CPSC logo, the member's photo, and the check-in word top right. The `wallet` function also acts as Apple's PassKit web service — phones register when they add the pass, and get a push whenever the word, the member's photo, or their status changes, so nobody re-adds anything. Updates are free and unlimited. Until the Google Wallet issuer account is set up, Android members use the "add from a picture" guide on their card page.

Function secrets: `APPLE_PASS_TYPE_ID`, `APPLE_TEAM_ID`, `APPLE_WWDR_B64`, `APPLE_SIGNER_CERT_B64`, `APPLE_SIGNER_KEY_B64` (base64 of the PEM files). The certificate expires **Nov 28, 2027** — before then, make a new Pass Type ID certificate in the Apple developer portal (a new key is fine) and replace `APPLE_SIGNER_CERT_B64` / `APPLE_SIGNER_KEY_B64`. Existing passes keep updating because their update passwords come from `pass_secrets`, not the certificate. Database: run [`005_apple_pass_updates.sql`](supabase/migrations/005_apple_pass_updates.sql) and [`006_pass_auth_secret.sql`](supabase/migrations/006_pass_auth_secret.sql).

## Poster layout (iOS 27+)
On iPhones running iOS 27 or later the pass uses Apple's poster layout: full-bleed artwork (`img/pass/background*.png` / `artwork*.png` — the CPSC skier poster recolored to club black and lime, sponsorship text removed), the lime logo top left (`img/pass/primaryLogo*.png`), the check-in word top right, and the member's name, number and season on the strip by the QR code. Older iPhones show the regular lime pass. To change the artwork, replace those PNGs (same sizes) and push; passes pick it up on their next update.

## Club branding
The look comes from cpsconline.com: lime header (`#ecffb0`), the black CPSC mountain logo, Bebas Neue headings and buttons, Questrial text, black buttons, and the homepage group photo on the login and sign-up pages. Logo files live in `img/` (`logo.png` black, `logo-white.png` for dark backgrounds, `icon.png` square).

## Branding
- Replace `img/logo.png` with the club logo (square PNG, ~512px). It's used in the header and on both wallet passes.
- Colors are the four variables at the top of `assets/style.css`. Pass colors can be set with the `PASS_BG`, `PASS_FG`, `PASS_LABEL` function secrets.

## How it works / security
- The QR code holds the member's random card ID (`CPSC1:<uuid>`). Only the member and admins can read it, it can't be guessed, and removing a member makes their card scan as invalid.
- The approved-email rule is enforced inside the database, so it can't be bypassed from the browser.
- Members can only see their own profile and photo. Approved list, member list, other photos and scanning are admin-only.
- Removing an email from the approved list blocks *new* sign-ups only. Use **Remove** on the member to revoke an existing card.
- If a member changes their photo they should re-add the pass.

## Google Wallet with the club's own account (Android passes that match the iPhone ones)
Without this, Android members add their card from a picture (the guide on their card page). With the club's own Google Wallet issuer account (free), Android passes look like the iPhone poster pass — dark card, lime CPSC logo, skier artwork (`img/pass/google-hero.png`, `google-logo.png`), member name, member # · check-in word · season, QR code — and the check-in word, tests and removals update on the phone with no re-add (free and unlimited).

1. **pay.google.com/business/console** → sign in with the club Google account → **Google Wallet API** → accept the terms. Copy the **Issuer ID** (a long number).
2. **console.cloud.google.com** → create a project (e.g. "cpsc-wallet") → **APIs & Services → Enable APIs** → enable **Google Wallet API**.
3. **IAM & Admin → Service Accounts → Create** (name it "cpsc-wallet", no roles needed) → open it → **Keys → Add key → JSON** → a .json file downloads.
4. Back in the Pay & Wallet Console → **Users → Invite a user** → paste the service account's email (…@….iam.gserviceaccount.com) → role **Developer**.
5. Supabase → Edge Functions → **Secrets**: add `GOOGLE_ISSUER_ID` = the Issuer ID, and `GOOGLE_SERVICE_ACCOUNT` = the whole contents of the .json file (paste it as-is).
6. In the Pay & Wallet Console, **Google Wallet API → Manage → Request publishing access** (Google reviews it, usually a few days). Until then only accounts listed under **Users / test users** can save passes, and they're marked "test".


## Memberships, parties and dues

**Memberships.** Every membership — full year or spring — is valid through **June 30** of the school year (a couple of
weeks past spring finals). Anything paid or approved from June 1 on counts toward the next school year. After June 30
the card scans as *Membership expired*, the member's card page shows a **Renew** button, and Apple/Google Wallet
mark the pass expired. Admins can renew anyone from the Members page (or re-approve their email).

**Parties (check-in).** There is one party per day, named after that day's check-in word. The scanner checks each
member in once per party; scans from 6am to 6am count toward the same night. Changing the weekly word renames
tonight's party. The Members page lists every party with who came.

**Paying dues online (Stripe).** The Join page takes payment with Stripe Checkout (card, Apple Pay, Google Pay).
A paid checkout approves the email automatically (new members) or extends the membership and updates the wallet pass
(renewals). Prices are set on the Members page → Dues. Until Stripe is set up, the Join page links to cpsconline.com.

1. Create the club's Stripe account at stripe.com (use test mode first).
2. Supabase → Edge Functions → **Secrets**: add `STRIPE_SECRET_KEY` (Stripe → Developers → API keys → Secret key).
3. Stripe → Developers → **Webhooks** → Add endpoint:
   `https://<project>.supabase.co/functions/v1/wallet?stripe-webhook`, event `checkout.session.completed`
   (and `checkout.session.async_payment_succeeded`). Copy its signing secret into the Supabase secret
   `STRIPE_WEBHOOK_SECRET`. (Payments also confirm when the member returns to the site; the webhook covers people
   who close the tab.)
4. Test with card `4242 4242 4242 4242`, then switch both keys to live mode.

Database: run `supabase/migrations/010_memberships_events_payments.sql` in the SQL Editor (after 009).

## Save points
`save-point-2026-10-30` (a branch on GitHub) is the site exactly as it was before the futuristic design pass. To go back to it:
`git checkout main && git reset --hard origin/save-point-2026-10-30 && git push --force-with-lease origin main`
(or in Vercel, open Deployments and "Promote" / "Instant Rollback" to the deployment from that commit).

## Editing pages
The HTML pages are generated: edit `tools/build.py` (app pages) or `tools/club.py` (club pages), then run `python3 tools/build.py` from the repo root. Effects live in `assets/fx.js` and the "FX" section at the bottom of `assets/style.css`.
