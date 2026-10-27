# PropShop

Egypt's broker-free, verified real-estate marketplace. Owners list directly, buyers and
tenants deal directly, and the platform charges a **flat admin fee instead of a
commission**.

Built to `AqarSale_Build_Brief.pdf` v1.0. This repository covers the **Phase 0** checklist
(Section 10) plus the MVP surfaces it unlocks.

```
aqarsale/
  propshop-web/     Next.js 16 — public site + member portal + back office + shared /api
  propshop-app/     Flutter — buyer app + in-app camera capture with GPS
```

---

## Quick start

```bash
# Web
cd propshop-web
npm install
npx prisma migrate dev        # creates prisma/dev.db
npm run seed                  # 54 compounds, ~280 listings, demo accounts
npm run dev                   # http://localhost:4100

# Tests (business rules)
npm test                      # 84 tests, no DB or network needed

# Import a developer price sheet (every row needs a source and an effective date)
npx tsx scripts/import-developer-prices.ts scripts/samples/developer-prices-example.csv --dry-run

# Check the web and mobile design tokens have not drifted
node ../packages/shared/check-tokens.mjs

# Mobile — point it at the dev server
cd ../propshop-app
flutter pub get
flutter run --dart-define=AQAR_API=http://10.0.2.2:4100   # Android emulator
```

### Demo accounts

All use the password `password123` (staff sign in with email; members use a phone OTP,
and in development the code is returned in the API response).

| Email | Role | What to look at |
|---|---|---|
| `admin@aqarsale.com` | admin | `/admin` — SLA health, north-star metric |
| `reviewer@aqarsale.com` | reviewer | `/admin/verification` — document vs typed comparison |
| `advisor1@aqarsale.com` | advisor | `/admin/requests` — 24h SLA queue, two deliberate breaches |
| `owner1@aqarsale.com` | owner | `/dashboard/listings` |
| `buyer1@aqarsale.com` | buyer | `/dashboard/requests` — live countdown |
| `investor@aqarsale.com` | investor | opportunities desk (Phase 3) |

---

## The three rules that are the product

Section 4 of the brief says the business rules *are* the product. Three of them are
enforced in code rather than by policy, and each has tests.

### 1. No listing is public without passing the gate

`src/lib/listingValidation.ts` is a pure function. It refuses to publish unless:

- the owner's identity is verified,
- at least **6 photos** captured in-app or by our photographer cover the six required
  rooms (living, bedroom, kitchen, bathroom, facade, view),
- a valid ownership document exists — signed, not a photocopy of a photocopy,
- the name on that document matches the verified ID (Arabic-aware token matching),
- the extracted compound, building, unit number, size and type match what the owner typed,
- the size falls inside the compound's known range and the pin inside its polygon,
- no photo collides with another listing by perceptual hash.

Every failure names the exact field to fix, in Arabic and English. The gate runs again at
reviewer approval — a stale pass never publishes.

### 2. One listing per unit

`unit_fingerprint` is a `UNIQUE` column built from the normalised compound, building,
floor, unit number, type and rounded size. "Villa 12, B-3" and "villa 12 b3" collapse to
the same fingerprint, so a duplicate is refused by the database, not by a check someone
can forget to call. One identity may hold at most **3** in-flight listings.

### 3. No cold calls

Phone numbers are masked everywhere, including from our own staff until an advisor logs
their first response. In-app messages are scanned for contact-sharing and broker language
before delivery.

> Note: JavaScript's `\b` is ASCII-only, so `/\bسمسار\b/` matches nothing. The classifier
> uses Unicode-aware lookarounds instead — see `src/lib/antiBroker.ts`.

---

## Architecture

The web app owns everything: the public site, the portal, the back office, and the `/api`
that the Flutter client consumes. One codebase means the two clients cannot drift apart on
a business rule.

```
src/lib/
  listingValidation.ts   the publish gate (pure, 36 tests)
  listingFlow.ts         draft → pending_review → live, with the state machine
  fairPrice.ts           rules-based estimator v1 (pure)
  fairPriceService.ts    comparable selection + persistence
  antiBroker.ts          contact masking, broker-language classifier
  requests.ts / sla.ts   the 24-hour promise, assignment, escalation
  claude.ts              document extraction, ID reading, description generation
  enums.ts               state machine, trust levels, every enum-like column
  geo.ts                 point-in-polygon, haversine (PostGIS equivalents)
  fingerprint.ts         unit_fingerprint, national-ID hashing
```

### Trust levels

Levels 0–4 in Section 5 describe a **listing**, not an account. An account carries level 1
(identity verified); level 2 is earned by that listing's own ownership document, level 3 by
GPS-stamped photos, level 4 by a field visit. **Level 2 is the minimum for public
visibility** and lives in exactly one place — `PUBLIC_LISTING_WHERE` in `src/lib/listings.ts`.

### Fair price

`estimateFairPrice()` takes a subject and its comparables and returns a **range plus a
confidence label** — never a single false-precise number. Comparables are normalised to a
baseline (fully finished, ready, mid-floor, open view), outliers beyond 1.5×IQR are
dropped, and closed deals count double. `selectComparables()` walks a ladder —
compound+type → compound → area+type → area — and stops at the first cell holding at least
3 comparables, recording which scope it used so the UI can say what the estimate rests on.

### Claude integration

`src/lib/claude.ts` uses `claude-opus-5` with structured outputs (`zodOutputFormat`) for
ownership-document extraction, national-ID reading, and listing copy. Every field is
nullable: a null means "not legible", which routes to a human, while a wrong value could
wrongly block or wrongly approve an owner. **Extraction is evidence for a reviewer, never
an approval.** With `ANTHROPIC_API_KEY` unset the module returns clearly-labelled stubs so
the whole flow stays testable.

---

## Database

Prisma on SQLite for development; `DATABASE_URL` swaps to Postgres for production. SQLite
has no enums, JSON or arrays, so enum-like columns are `String` (constrained in
`src/lib/enums.ts`) and JSON columns are `String` (via `src/lib/json.ts`). Geo uses
lat/lng plus GeoJSON polygons with the PostGIS-equivalent maths in `src/lib/geo.ts`.

`country_code` is on every core table from day one, per the Phase 4 multi-country plan.

---

## What is done, and what is not

**Done (Phase 0 checklist):** monorepo scaffold, full schema + migrations + seed of 54 real
New Cairo / 6th of October / Sheikh Zayed compounds, phone OTP auth (Egypt + Gulf) with JWT
and rotating refresh tokens, listing state machine with fingerprint uniqueness, the hard
validation layer, admin verification queue with Claude extraction, search API and SSR
listing pages with `RealEstateListing` JSON-LD, the requests module with 24-hour SLA and
advisor queue, buyer-side reporting and the strike system, Arabic RTL default with an
English toggle, the business-rule test suite, `developer_price_lists` + a CSV import tool,
fair price v1, masked in-app chat with the broker classifier wired in, and a
secret-protected `/api/jobs` endpoint for SLA escalation, listing expiry and nightly
fair-price recomputation.

**Not done:**

- **Media pipeline worker** — resize, watermark, pHash and EXIF extraction. Photos register
  their metadata but no image processing runs, so duplicate detection compares stored
  hashes rather than computed ones.
- **Paymob/Fawry** — `FeeConfig` and `Payment` exist and the seed records paid fees, but no
  provider is wired.
- **Reverse-image search** against external portals.
- **Object storage** — media `fileKey`s are URLs/paths, not S3 keys with signed URLs.
- **AI advisor chatbot, deal room, Index paid tier, finishing services** — Phases 2–4.
- **A real job scheduler.** `/api/jobs` exists and is idempotent, but nothing calls it yet;
  point cron at it (`sla_escalation` every 15 min, the rest nightly) or move it to BullMQ.
- The app has been run against SQLite only; the Postgres schema is generated but untested.
- **The Flutter app has not been run on a device.** `flutter analyze` is clean and the
  Dart compiles, but `flutter build apk` could not finish in the development environment:
  Gradle cannot reach `dl.google.com` to download the Android Gradle Plugin
  (`Got socket exception during request. It might be caused by SSL misconfiguration`).
  This is a network/proxy issue, not a code one — retry the build on a machine with
  unrestricted access to `dl.google.com` and `repo.maven.apache.org`.

---

## API

`openapi.yaml` documents the endpoints both clients use. Auth accepts either the httpOnly
cookie (web) or `Authorization: Bearer` (Flutter).

---

## Open questions for the founder

Carried from Section 13 and still unanswered — they affect code that is already written:

1. **Exact fee amounts.** The seed uses EGP 750 listing / 3,500 photo / 15,000 deal as
   placeholders, all editable in `FeeConfig`.
2. **Deposit hold partner.** `Deal.depositStatus` models the flow but no funds move, per
   the brief's instruction not to hold funds in-house.
3. **Launch geography.** The seed covers New Cairo, 6th of October, Sheikh Zayed, Mostakbal
   City, Shorouk and Madinaty.
4. **Index legal review** before compound-level prices are published.
5. **Listing cap.** Set to 3, configurable per account via `listingCapOverride`.
