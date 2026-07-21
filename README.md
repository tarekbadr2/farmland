# Herd OS — Buffalo Farm Management System

An ERP for livestock farms. Built around a 617-head Egyptian buffalo dairy, architected for 50,000+ animals and multi-farm SaaS tenancy.

```bash
npm install
npm run dev      # http://localhost:3000
```

No configuration needed. The app boots on a deterministic demo herd.

---

## What's in it

| Module | What it does |
| --- | --- |
| **Dashboard** | 20+ live KPIs, 6 charts, weather & heat-stress, today's tasks, AI alerts |
| **Animals** | Full digital profile per head, life timeline, lactation curve vs. Wood's model, growth curve, health/breeding history |
| **Breeding** | Heat → AI → pregnancy check → calving funnel, sire performance, semen inventory, conception analytics |
| **Milk** | Session-level records, SCC quality bands, 14-day forecast (Holt smoothing, heat-adjusted), producer leagues |
| **Health** | Treatments, vaccination scheduling, withdrawal-period control, disease trend & cluster detection |
| **Feed** | Inventory, rations with per-component breakdown, consumption by pen, feed conversion ratio |
| **Calves** | Growth vs. target ADG, weaning tracking, behind/on-track/ahead banding |
| **Employees** | Roster, attendance, payroll, performance, safety |
| **Tasks** | Four-lane board, recurrence, overdue tracking, one-tap completion |
| **Inventory** | Medicine/parts/fuel, expiry control, automatic reorder suggestions |
| **Finance** | P&L, cash flow, expense breakdown, cost per litre, invoices & receivables |
| **Partners** | Milk buyers, animal buyers, suppliers, vets, balances |
| **Farm map** | Interactive SVG plan; tap a pen to see every animal inside it |
| **AI advisor** | Explainable insights + natural-language herd queries |
| **Analytics** | Seven analytical dashboards incl. year-on-year and sustainability |
| **Reports** | CSV/PDF export, scheduled email reports |
| **Settings** | Farm, theme, language, roles matrix, backup, integrations |

---

## Architecture

Clean architecture — the UI never knows where data comes from.

```
src/
  core/
    domain/types.ts          Storage-agnostic domain model
    repositories/            FarmRepository contract + demo adapter
    services/                Pure derivation: metrics.ts, advisor.ts
    data/seed.ts             Deterministic herd generator
  infrastructure/
    firebase/client.ts       Firestore adapter + schema documentation
  components/
    ui/                      shadcn-style primitives on Radix
    common/                  StatCard, ChartCard, DataTable, status pills
    shell/                   Sidebar, topbar, command palette, tab bar
  lib/                       i18n, dates, export, utils
  hooks/                     React Query bindings
  app/(app)/                 One route per module
```

**The seam that matters** is `FarmRepository`. The demo adapter and the Firestore adapter implement the same async, paginated contract, so switching backends changes one line in `src/core/repositories/index.ts` — no component touches either one directly.

### Why the demo data behaves like a real herd

Not random numbers. The generator models:

- **Wood's lactation curve** — `y = a·t^b·e^(−c·t)` drives every animal's daily yield from days-in-milk
- **310-day gestation** — pregnancy status, due dates and dry-off dates are mutually consistent
- **Seasonal decay** — Egyptian buffalo lose 9–11% in the July/August heat, and the charts show it
- **THI heat stress** — `0.8·T + (RH/100)·(T−14.4) + 46.4`, the standard livestock metric
- **Realistic herd composition** — 44% lactating, 12% dry, 23% calves, modelled on a real 600-head dairy
- **Books that balance** — milk sales at 21.5 EGP/L, feed at 218 EGP/head/day, monthly payroll

Everything derives from one seed, so server and client render identically and the numbers hold up under scrutiny.

---

## Scaling to 50,000 animals

The design choices that matter at that size are already in place:

- **Pagination in the contract.** `listAnimals` takes a query and returns a `Page<Animal>` — the herd list never loads the herd.
- **Denormalised sort keys.** `avgDailyMilkL`, `healthScore`, `milkStatus` live on the animal document; Firestore can't sort across collections.
- **Derived series, not stored series.** Per-animal milk history is reconstructed from the animal's own seed on demand rather than shipped up front.
- **Aggregate-on-write.** `milkDaily` is a rolled-up collection maintained by a Cloud Function trigger, not a client-side reduce over 100k rows.
- **Path-scoped tenancy.** Everything lives under `farms/{farmId}/…`, so a security rule is one membership check.

See the schema comment in `src/infrastructure/firebase/client.ts`.

---

## Internationalisation

English and Arabic, with real RTL — not a mirrored stylesheet. Logical properties (`ps-*`, `me-*`, `start-*`) throughout, direction-aware icon flipping, and a dedicated Arabic typeface (IBM Plex Sans Arabic).

One deliberate exception: **numerals stay Latin in Arabic** (`ar-EG-u-nu-latn`). Egyptian farm staff read ear-tag numbers, litres and prices in Latin digits; Eastern Arabic numerals here would be a translation, not a localisation.

Charts stay LTR in both languages — time series read left-to-right for agronomists and accountants regardless of interface language.

---

## Offline & PWA

`public/sw.js` serves a network-first shell so the app opens at 5am in a parlor with no signal. Static assets are stale-while-revalidate. API traffic is deliberately left alone — the Firestore SDK's own IndexedDB persistence handles conflict resolution better than a service worker can.

Push notifications are wired for vaccination due, calving imminent, and tank temperature alarms.

---

## Connecting Firebase

The Firestore adapter, auth, rules, indexes and a seed script are all in place. Six steps.

### 1. Enable the services

Firebase console → your project:

- **Firestore Database** → Create database → production mode, region near the farm (`europe-west1` for Egypt)
- **Authentication** → Sign-in method → enable **Email/Password** *and* **Google**
- **Storage** → Get started (animal photos and documents)

### 2. Fill in the config

```bash
cp .env.example .env.local
```

Paste the web config from *Project settings → General → Your apps → Web app*, then set:

```
NEXT_PUBLIC_DATA_SOURCE=firebase
```

Those `NEXT_PUBLIC_FIREBASE_*` values are public by design — they ship to the browser and identify the project, they don't authorise anything. Access control lives in `firestore.rules`.

### 3. Deploy the rules and indexes

```bash
npm i -g firebase-tools
firebase login
firebase use --add                 # pick your project
firebase deploy --only firestore:rules,firestore:indexes,storage
```

Indexes take a few minutes to build. Queries against them fail with a console link until they're ready — that's expected.

### 4. Seed the demo herd

Download a service-account key (*Project settings → Service accounts → Generate new private key*) and point at it. **That file is a real secret** — it bypasses every security rule. Keep it outside the repo; `.gitignore` already covers `*.serviceaccount.json`.

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
export SEED_OWNER_EMAIL=you@example.com

npm run seed:dry     # counts documents, writes nothing
npm run seed         # 18,423 docs — just under the 20k/day free-tier quota
```

Flags: `--milk-days 30` for deeper lactation charts (adds ~8,500 writes, exceeds the free daily quota), `--farm <id>` for a second tenant, `npm run seed:reset` to wipe and reseed.

### 5. Claim the owner account

Firebase Auth only issues a `uid` after first sign-in, so membership can't exist ahead of time. Sign in to the app once — you'll be bounced back to the login screen, which is correct, you're authenticated but not yet a member. Then:

```bash
npm run grant -- you@example.com owner
npm run members            # list who has access
```

Same command adds everyone else: `npm run grant -- vet@example.com veterinarian`.

### 6. Verify

```bash
npm run dev
```

Sign in. If the herd loads, the read path works. Record a milk session from the dashboard — that's the write path, the rules, and the aggregate rollup in one action.

### Local development without touching production

```bash
npm run emulators
```

`firebase.json` configures the Auth, Firestore and Storage emulators plus the UI on `:4000`. Point `GOOGLE_APPLICATION_CREDENTIALS` at nothing and set `FIRESTORE_EMULATOR_HOST=localhost:8080` before seeding to load the demo herd locally for free.

---

## What the Firestore adapter does differently

Two rules govern [firebase-repository.ts](src/infrastructure/firebase/firebase-repository.ts):

**Never fan out.** Anything that could return 50,000 documents takes a bound. The herd list is cursor-paginated with filters and sorting pushed into Firestore against composite indexes — not fetched-then-filtered, which silently searches only the page you loaded.

**Aggregate on write.** `recordMilkSession` writes the per-animal rows *and* rolls `milkDaily` forward in the same batch. The dashboard reads one document per day. At 50,000 head the alternative is a 100,000-document query every time someone opens the app.

Two limits worth knowing:

- **Search is prefix-only.** Firestore has no substring matching. Tag, name and RFID each get a prefix range, fired in parallel and merged. Typing `1042` finds `EG-1042`; typing `042` finds nothing. Real fuzzy search across 50k head belongs in Algolia or Typesense fed by a Firestore trigger.
- **Counts come from a counter.** `total` is read from `farms/{farmId}.counts`, maintained by the seed and meant to be maintained by a Cloud Function trigger. Firestore has no cheap `COUNT` over a filtered set at this size.

## Roles

Enforced in `firestore.rules`, not in React. The UI guard only decides what to paint.

| Role | Can |
| --- | --- |
| `owner` | Everything, including membership changes |
| `manager` | Herd, milk, health, feed, tasks, inventory; reads finance |
| `veterinarian` | Health and breeding records; reads the herd |
| `accountant` | Finance, invoices, partners, payroll |
| `worker` | Reads the herd, records milk, updates *own* assigned tasks |

Three details that matter: salaries live in `employees`, which workers can't read at all; a milk record freezes two days after it's taken so yesterday's numbers can't drift after the tanker has been paid; and a worker updating a task can only change `status`, `completedAt` and `notes` — not reassign it to someone else.

---

## Stack

Next.js 15 · React 19 · TypeScript · Tailwind CSS v4 · Radix UI · React Query · Recharts · Framer Motion · React Hook Form + Zod · Firebase · cmdk · next-themes
