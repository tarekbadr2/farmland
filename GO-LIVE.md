# Herd OS — Go-Live Runbook

Step-by-step for the actions only you can do. Work top to bottom. Tick each box.
Legend: 🔴 blocking/security · 🟠 before charging/public · 🟢 desktop · 🔵 optional (unblocks the last Criticals)

---

## 0. Prerequisites (one-time)

- [ ] Install the Firebase CLI and sign in:
  ```bash
  npm install -g firebase-tools
  firebase login
  ```
- [ ] Confirm you can see the project and select it (id is `studio-5814781224-899ee`):
  ```bash
  firebase projects:list
  firebase use studio-5814781224-899ee
  ```
- [ ] Make sure Node 20+ is installed (`node -v`). The web app deploys via Vercel automatically on push to `main`; the backend deploys with the Firebase CLI below.

---

## 1. 🔴 Rotate the exposed admin service-account key

The old key (private_key_id starting `1ed04a5e98…`) is a full-access backdoor until replaced.

1. [ ] Firebase Console → ⚙️ **Project Settings** → **Service accounts** tab.
2. [ ] Click **Generate new private key** → confirm → a JSON file downloads. Keep it private.
3. [ ] Update `FIREBASE_SERVICE_ACCOUNT` in Vercel (see §4) with the **new** key's JSON, in the *same format* the current value uses (open the current Vercel value to match — raw JSON vs. base64).
4. [ ] Back in **Service accounts → Manage service account permissions** (opens Google Cloud → IAM & Admin → Service Accounts) → open the service account → **Keys** tab → find the key with id `1ed04a5e98…` → **Delete**.
5. [ ] Redeploy the web app so it picks up the new value: Vercel → Deployments → **Redeploy** latest (or push any commit).

✅ Done when: the old key id no longer appears under Keys, and the site still loads/authenticates.

---

## 2. 🔴 Deploy the backend (rules + indexes + functions)

None of this session's security rules, the billing sweep, or the invite/RBAC functions are live until you deploy.

1. [ ] Install function deps once:
   ```bash
   cd functions && npm install && cd ..
   ```
2. [ ] Deploy (the predeploy step compiles the functions with tsc):
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes,functions --project studio-5814781224-899ee
   ```
3. [ ] Watch the output for `✔ Deploy complete!`. If it fails on **secrets/env** for a function, do §4 (Functions env) first, then re-run.
4. [ ] (Optional) Storage rules are unchanged, but if you ever edit them: add `,storage` to the `--only` list.

✅ Done when: `firebase deploy` reports success and the Functions list in the console shows `billingSweep`, `createInvite`, `acceptInvite`, `reconcileCounters`, etc.

---

## 3. 🔴 Authorize your domain in Firebase Auth

Google sign-in fails on any domain not on the allow-list.

1. [ ] Firebase Console → **Authentication** → **Settings** → **Authorized domains**.
2. [ ] Ensure your production domain is listed (e.g. `farmland-tarekbadr2s-projects.vercel.app` and any custom domain). Add it with **Add domain** if missing.

✅ Done when: signing in with Google on the live site succeeds.

---

## 4. 🔴 Environment variables

### 4a. Vercel (web app) — Project → Settings → Environment Variables
Add/confirm these for **Production** (and Preview if you use it). Secrets must **not** have the `NEXT_PUBLIC_` prefix.

- [ ] `FIREBASE_SERVICE_ACCOUNT` — the **new** admin key JSON from §1.
- [ ] `ANTHROPIC_API_KEY` — for the AI advisor.
- [ ] `RESEND_API_KEY` — for invite/receipt emails.
- [ ] `EMAIL_FROM` — e.g. `Herd OS <noreply@yourdomain.com>` (domain must be verified in Resend).
- [ ] `NEXT_PUBLIC_SITE_URL` — your real URL, e.g. `https://app.yourdomain.com` (used for SEO/OG + sitemap).
- [ ] `NEXT_PUBLIC_FARM_ID` = `unassigned` (safe fallback so a pre-login stray query can't touch a real tenant).
- [ ] The 8 Firebase web-config values (already set, since the app works): `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`.
- [ ] Leave `NEXT_PUBLIC_BILLING_ENFORCED` **unset** for now — set it to `1` only when Paymob is wired (§6).
- [ ] After editing: Vercel → Deployments → **Redeploy** so the new values take effect.

### 4b. Firebase Functions — a `.env` file
The functions read `process.env.*`. Create `functions/.env` (it's already gitignored):

```
RESEND_API_KEY=your_resend_key
EMAIL_FROM=Herd OS <noreply@yourdomain.com>
APP_BASE_URL=https://app.yourdomain.com
```

- [ ] Create the file with your real values.
- [ ] (Leave `BILLING_ENFORCED` out until §6.)
- [ ] Re-run the deploy from §2 so the functions pick it up.

> Hardening later: move `RESEND_API_KEY` into Google Secret Manager (`firebase functions:secrets:set RESEND_API_KEY`) — that needs a one-line code change to declare the secret on the functions, ping me when you want it.

✅ Done when: sending a team invite delivers an email, and the AI advisor answers.

---

## 5. 🟠 Legal pages

1. [ ] Open `src/lib/legal.ts`. Replace the placeholders:
   - Registered **entity name** (the actual company/registration, not "Herd OS").
   - A **monitored support address** on a domain you own (verify it in Resend too).
2. [ ] Have a lawyer review `/legal/terms` and `/legal/privacy` (they reference Egyptian law and payment processing).
3. [ ] Commit + push (Vercel redeploys).

✅ Done when: the entity + support email on the live legal pages are real.

---

## 6. 🟠 Paymob (subscription billing) + turning enforcement on

Do this only when you're ready to charge other farms.

1. [ ] Create a Paymob merchant account; get the **test keys**: `PAYMOB_API_KEY`, `PAYMOB_INTEGRATION_ID`, `PAYMOB_IFRAME_ID`, `PAYMOB_HMAC_SECRET`.
2. [ ] **Send me the test keys** — before enforcement is safe, I still need to: implement **recurring billing + dunning** (today it's a one-shot 30-day grant) and **verify the webhook via Paymob's retrieve-transaction API** (the tier field isn't HMAC-signed). Don't enable billing until that's done.
3. [ ] Add the 4 `PAYMOB_*` vars to **Vercel** (server-only).
4. [ ] Point Paymob's transaction webhook at `https://<your-domain>/api/billing/webhook`.
5. [ ] Once the above is wired: set `NEXT_PUBLIC_BILLING_ENFORCED=1` in Vercel **and** `BILLING_ENFORCED=1` in `functions/.env`, redeploy both.

✅ Done when: a test farm can check out, pay, and a failed/lapsed subscription goes read-only.

---

## 7. 🟢 Ship the desktop app (with the new native features)

1. [ ] Cut a release — CI builds and publishes the installer; existing installs auto-update:
   ```bash
   git tag v0.3.0
   git push origin v0.3.0
   ```
2. [ ] Wait for the GitHub Actions "desktop" workflow to finish; the installer lands at
   `https://github.com/tarekbadr2/farmland/releases/latest/download/Herd-OS-Setup.exe`.
3. [ ] Install on a real Windows machine (to a drive with free space) and **smoke-test**:
   - [ ] Sign in (Google opens in your browser, hands back to the app).
   - [ ] Resize + maximize, quit, relaunch → window restores to the same size/position.
   - [ ] Turn on background mode → close the window → it stays in the tray; tray menu has Open / Show Dashboard / Check for Updates / Settings / Quit.
   - [ ] Open a deep link (paste `herdos://dashboard` into Run or a browser) → the app focuses and navigates.
   - [ ] Export a report → native Save dialog → the file opens after saving.
   - [ ] Drag a CSV onto the herd import dialog → it parses.
   - [ ] Log out → lands on a clean login (cached data cleared).
   - [ ] Settings → **Desktop** tab shows Startup / Background / Updates / shortcuts.

✅ Done when: all of the above behave as described on a real install.

---

## 8. 🔵 Optional — install JDK 21 (unlocks the last Criticals)

This is the single biggest lever left. With JDK 21 on the build machine I can run the Firestore rules + offline tests locally (the emulator needs Java 21; no cloud project required) and take the **ledger-at-scale** Critical end-to-end *with proof*.

1. [ ] Install a JDK 21 (e.g. Temurin/Adoptium) and ensure `java -version` reports 21+.
2. [ ] Tell me it's done — I'll run `npm run test:rules` (in the repo) and start the scale rework.

---

## Priority summary

- **Use it for your own farm today:** §1–§4.
- **Sell to other farms:** add §5–§6.
- **Distribute the desktop app:** §7.
- **Lift the quality ceiling past ~60/100:** §8.
