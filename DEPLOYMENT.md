# Deploying Herd OS

The app is a Next.js 15 frontend + API routes. Firebase (Auth, Firestore, Storage,
Cloud Functions) is the backend and is **already live** — deploying just puts the
web app somewhere your phones can reach it. Recommended host: **Vercel** (native
Next.js support, free tier is enough to start).

What's already done (no action needed):
- Firestore security rules — deployed (`firebase deploy --only firestore:rules`).
- Cloud Functions (counters, alerts, membership) — deployed to `us-central1`.
- The database is seeded and verified.

Vercel only hosts the web app. You do **not** redeploy Firebase on every web deploy.

---

## 1. Put the code on GitHub

The repo is already initialized locally with an initial commit on `main`.

```bash
# create an empty repo on github.com first (no README), then:
git remote add origin https://github.com/<you>/herd-os.git
git push -u origin main
```

Nothing secret is committed — `.env.local` and all service-account keys are
gitignored. Double-check with `git ls-files | grep -i env` (should show only
`.env.example`).

## 2. Import into Vercel

1. vercel.com → **Add New → Project** → import the GitHub repo.
2. Framework preset: **Next.js** (auto-detected). Build command and output are
   auto-configured; the `postbuild` step (offline precache) runs automatically.
3. Don't deploy yet — set the environment variables first (next step).

## 3. Environment variables (Vercel → Project → Settings → Environment Variables)

Copy each value from your local `.env.local`. Set them for **Production** (and
Preview if you want preview deploys to work).

**Required** — the app won't run against your data without these:

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_DATA_SOURCE` | `firebase` |
| `NEXT_PUBLIC_FARM_ID` | `farm_nile_delta` |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | copy from `.env.local` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | copy from `.env.local` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | copy from `.env.local` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | copy from `.env.local` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | copy from `.env.local` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | copy from `.env.local` |

The `NEXT_PUBLIC_*` values are public by design (they ship to the browser and
only identify the project — access control is in the security rules).

**Optional** — only for the AI advisor (skip until you want it):

| Key | Value |
|-----|-------|
| `ANTHROPIC_API_KEY` | your key from console.anthropic.com — **secret** |
| `FIREBASE_SERVICE_ACCOUNT` | the admin service-account JSON as one line — **secret** |

`FIREBASE_SERVICE_ACCOUNT` is the *contents* of a service-account key file (not a
path). Generate one in Firebase console → Project settings → Service accounts →
Generate new private key, then paste the whole JSON as the value. Without these
two the AI advisor simply falls back to the built-in rule-based advisor; the rest
of the app is unaffected.

## 4. Deploy

Click **Deploy**. You'll get a URL like `https://herd-os.vercel.app`.

## 5. ⚠️ Authorize the domain in Firebase (required, or sign-in fails)

Google/email sign-in is blocked on unknown domains. Add your Vercel URL:

- Firebase console → **Authentication → Settings → Authorized domains → Add domain**
- Add `herd-os.vercel.app` (and any custom domain you set later).

Without this, the app deploys fine but **login will fail** with an auth error.

## 6. Verify

- Open the URL, sign in with the owner Google account (tarekbadr2004@gmail.com).
- Dashboard should show the live herd (601 head).
- On your **phone**: open the URL in Chrome/Safari → browser menu → **Add to Home
  Screen** / **Install**. Launch it, turn on airplane mode — it should still open
  and show the last synced data. Record a milk session offline; it syncs when you
  reconnect.

## 7. Billing (Paymob) — turning on paid subscriptions

Payments run through **Paymob's Accept API**. You do **not** create "payment
links" (single or bulk) — the app generates a payment session automatically each
time someone subscribes. You just wire up four values.

**Step A — get the four values from the Paymob dashboard:**

| Env var | Where in Paymob |
|---------|-----------------|
| `PAYMOB_API_KEY` | Settings → Account Info → **API Key** |
| `PAYMOB_INTEGRATION_ID` | Developers → Payment Integrations → your **card** integration's ID (a number) |
| `PAYMOB_IFRAME_ID` | Developers → iFrames → create one → its **ID** (a number) |
| `PAYMOB_HMAC_SECRET` | Settings → Account Info → **HMAC** |

**Step B — put them where the Firebase keys already are:** Vercel → Project →
**Settings → Environment Variables** (the same place as step 3 above). Add each
as a **Production** variable. These are **secrets** — do NOT prefix them with
`NEXT_PUBLIC_`, and never commit them. For local testing, put them in
`.env.local` instead.

**Step C — point Paymob's webhook at the app.** In Paymob → Developers →
Payment Integrations → your integration → set the **Transaction processed
callback** to:

```
https://<your-domain>/api/billing/webhook
```

**Step D — turn the paywall on.** Until you're ready, leave it off (the trial and
paywall are visible but never block anyone). When prices are final and Paymob is
live, add one more Vercel env var and redeploy:

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_BILLING_ENFORCED` | `1` |

Until all four `PAYMOB_*` values are set, checkout shows an honest "coming soon"
message and nothing is ever charged — safe to deploy at any point.

> **Also redeploy Firebase once for this release:** the trial + the billing
> security rules are new. Run `firebase deploy --only firestore:rules,functions`
> so new farms get a 7-day trial and clients can't grant themselves a plan.

## Redeploying later

Push to `main` → Vercel auto-builds and deploys. That's it. Only re-run
`firebase deploy` if you change `firestore.rules` or the `functions/` code.

## Custom domain (optional)

Vercel → Project → Settings → Domains → add your domain and follow the DNS steps.
Then repeat **step 5** to authorize the custom domain in Firebase Auth.
