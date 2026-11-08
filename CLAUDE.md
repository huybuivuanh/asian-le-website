# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server (localhost:3000)
npm run build    # Production build
npm run lint     # Run ESLint
```

No test suite is configured.

## Environment Variables

Firebase credentials are required to run the app. Create a `.env.local` with these keys (all prefixed `NEXT_PUBLIC_`):

```
NEXT_PUBLIC_API_KEY
NEXT_PUBLIC_AUTH_DOMAIN
NEXT_PUBLIC_PROJECT_ID
NEXT_PUBLIC_STORAGE_BUCKET
NEXT_PUBLIC_MESSAGING_SENDER_ID
NEXT_PUBLIC_APP_ID
NEXT_PUBLIC_MEASUREMENT_ID
```

Placing an order additionally requires a Firebase Admin service account (server-only, **not** prefixed `NEXT_PUBLIC_` — never exposed to the client). Generate one via Firebase Console → Project Settings → Service Accounts → Generate new private key, then paste the entire downloaded JSON as one line:

```
SERVICE_ACCOUNT_KEY      # the full service-account JSON, as a single-line string
```

Required — `NEXT_PUBLIC_BUSINESS_ID`, this site's `businesses/{id}` doc id (every Firestore path is inside it).

Asian Le Rewards sign-in at checkout is in the same Firebase project (members under `businesses/{id}/members`), so it needs no extra config; set `NEXT_PUBLIC_REWARDS_ENABLED=false` to hide it. `lib/rewardsConfig.ts` reads the settings (safe anywhere), `lib/rewardsFirebase.ts` hands out the site's own auth/db and `lib/rewardsClient.ts` the sign-in calls behind `hooks/useRewardsMember.ts`. On the server, `lib/server/rewards/auth.ts` verifies the member's sign-in token and `lib/server/rewards/member.ts` reads their name and points with the Admin SDK; `/api/orders` saves `order.loyalty = { memberId, memberName }` (same field as the POS). Points are earned later by the `asian-le-orders` admin app on Complete:

```
NEXT_PUBLIC_BUSINESS_ID       # required
NEXT_PUBLIC_REWARDS_ENABLED   # optional, "false" hides rewards
NEXT_PUBLIC_REWARDS_APP_URL   # optional, defaults to https://rewards.asianle.ca
```

Using points online (`lib/rewardsRules.ts`, `lib/server/rewards/points.ts`, `lib/server/orders/saveOrder.ts`, `/api/rewards/points`): 100 pts = $5 off before tax, saved as `taxBreakDown.discount` (POS shape) + `loyalty.pointsToRedeem`. Points are **not** taken at checkout — the Orders app takes them on Complete (`redeemPoints`, then `earnPoints` on the discounted subtotal) and sets `loyalty.pointsRedeemed`. To stop the same points being promised twice, `/api/orders` reads the member's balance (Admin SDK, after verifying their ID token) and, in the same transaction as the save, subtracts `pointsToRedeem` on their other open orders.

Without `SERVICE_ACCOUNT_KEY`, `/api/orders` fails cleanly (checkout UI shows "Network error", nothing crashes) — everything else in the app works fine without them.

## Architecture

**Next.js 16 App Router** with Tailwind CSS v4, TypeScript strict mode, and Firebase (Firestore + Storage) as the backend CMS. Deployed to Vercel.

### Route structure

All pages live under `app/(main)/` using a route group (no URL segment added). `app/layout.tsx` is the root layout (Nav + Footer + JSON-LD schema + Vercel Analytics).

| Route | File |
|---|---|
| `/` | `app/(main)/page.tsx` |
| `/menu` | `app/(main)/menu/page.tsx` |
| `/gallery` | `app/(main)/gallery/page.tsx` |
| `/about-us` | `app/(main)/about-us/page.tsx` |
| `/contact-us` | `app/(main)/contact-us/page.tsx` |
| `/checkout` | `app/(main)/checkout/page.tsx` — cart checkout, pay-at-pickup |
| `POST /api/orders` | `app/api/orders/route.ts` — places an order (see below) |
| `/reservations` | `app/(main)/reservations/page.tsx` — table booking form |
| `POST /api/reservations` | `app/api/reservations/route.ts` — saves a reservation as a regular scheduled order |

### Data fetching pattern

Public pages are **async Server Components** with `export const revalidate = 900` (ISR, 15-min TTL) — except `/checkout`, which is `export const dynamic = "force-dynamic"` since store-hours/pause-ordering gating must never be stale. Data is fetched directly from Firestore on the server:

- `lib/siteData.server.ts` — updates, gallery, daily specials (home page)
- `lib/orderMenuData.ts` — `webCategories`/`webMenuItems`/`webOptionGroups`/`webOptions` (menu page, the active model — see `ecommerce.md`)
- `lib/storeSettings.ts` — `settings/store` (hours/holidays/pause-ordering)

All wrap their loaders in React's `cache()` to deduplicate within a single request.

### Ordering feature

The `/menu` page doubles as the ordering UI (see `ecommerce.md` for the full Firestore data-model contract this reads). Key pieces:

- `lib/availability.ts` — pure logic (no Firestore): sold-out/time-window availability for items & options, store open/closed decision tree, and scheduled-pickup validation up to `MAX_SCHEDULE_DAYS_AHEAD` (30 days) via a `datetime-local` calendar+clock input. All timezone math uses `Intl.DateTimeFormat` with the store's IANA timezone — no date library dependency.
- `lib/menuOptions.ts` — resolves a menu item's option groups/options into a display-ready view model with availability computed.
- `lib/cartStore.ts` — client-side cart, Zustand, in-memory only (no persistence — cart does not survive a refresh or a new session, by design). Snapshots name/price at add-to-cart time so the cart renders without the full menu loaded; **never trusted for money** — `/api/orders` re-derives every price from live Firestore data.
- `lib/orderPricing.ts` — GST (5%) + PST (6%) computation, Saskatchewan restaurant meal rates confirmed with the business owner.
- `lib/firebaseAdmin.ts` — trusted server-only Firestore (bypasses security rules) for the one write path that must not be reachable via the public client SDK: `orders`. Requires `SERVICE_ACCOUNT_KEY` above; never import from a Client Component.
- `lib/reservation.ts` — reservations are regular scheduled orders with one hard-coded $0 "Reservation" item (guest count = quantity of its "Number of guests" option). Unlike `/api/orders`, `/api/reservations` enforces `settings/store.reservationHours` (per weekday, set in website-admin; `close` is the LAST bookable time, inclusive), holidays, pause and a 60-min lead time. The form's day chips and time input come from `getReservationDays` / `getReservationWindow`, checked with the same `getReservationInvalidReason` the API uses; the "No reservations X – Y" note is the stretch between store opening and the first booking time.
- `app/api/orders/route.ts` — validates the cart against live Firestore data (availability, min/max option selection, pickup-time validity) and writes to `orders` via `firebaseAdmin`. The route is a thin wrapper; the steps live in `lib/server/orders/` (`customer.ts`, `fulfillment.ts`, `menuIndex.ts` — option pricing rules shared with `/api/cart/availability`, `buildOrderItems.ts`, `newOrder.ts` — the order doc shared with `/api/reservations`, `saveOrder.ts`) and `lib/server/rewards/`. `lib/server/http.ts` has the JSON error helpers. See `orders-schema.md` for the Firestore shape, written for the separate admin app to read — **this repo has no admin/order-management UI**, by design (see that doc).
- `lib/orderApi.ts` — request/response types of the order, cart and rewards API routes, shared by the routes and the browser code (`lib/apiClient.ts`'s `postJson`).
- Checkout UI: `hooks/checkout/useCheckoutForm.ts` combines `useCartAvailability`, `usePickupSchedule`, `useCustomerDetails`, `useRedeemPoints` and `usePlacedOrder` (submit state, waiting for the restaurant, cancel). The rewards box is `components/checkout/rewards/`.

### Firebase collections

One Firebase project (`asianlepos`) is shared with the POS, Orders app, website-admin and rewards. **Everything below lives under `businesses/{NEXT_PUBLIC_BUSINESS_ID}/`** — build paths with `bizCol` / `bizDoc` (`lib/business.ts`, client SDK, also used by server components) or `adminBizCol` (`lib/server/business.ts`, Admin SDK). The website's menu collections have a `web` prefix because the POS has its own `categories` / `menuItems` / … in the same business. Security rules live in the separate `asian-le-firebase` repo.

| Collection (in the business) | Type | Used for |
|---|---|---|
| `webCategories` | `FoodCategory` | Menu category groupings |
| `webMenuItems` | `MenuItem` | Individual menu items |
| `webOptionGroups` | `OptionGroup` | Reusable modifier groups |
| `webOptions` | `ItemOption` | Individual modifier choices |
| `settings/store` (single doc) | `StoreSettings` | Hours, holidays, pause-ordering kill switch, restaurant confirm-call number |
| `orders` | `Order` | Written by this site (`/api/orders`), read by the Orders app and the POS |
| `members` | — | Rewards members (read-only here: the signed-in member's doc, and their balance on the server) |
| `dailySpecials` | `DailySpecial` | Day-of-week special configs |
| `dailySpecialItems` | `DailySpecialItem` | Items belonging to daily specials |
| `updates` | `ImageItem` | News/updates on home page |
| `gallery` | `ImageItem` | Gallery page photos |

### Global types

All domain types are declared globally in `types/global.d.ts` — no import needed in component files. This includes the ordering model (`FoodCategory`, `MenuItem`, `OptionGroup`, `ItemOption`, `StoreSettings`, etc. — see `ecommerce.md`), which mirrors the separate admin app's contract exactly, and the `Order` model this site writes (see `orders-schema.md`).

### Key lib files

- `lib/store.ts` — Single source of truth for store details (address, phone, hours, social links). Import `STORE` wherever contact info is needed.
- `lib/imagePolicy.ts` — `skipNextImageOptimization()` — pass this to `unoptimized` on `<Image>` for Firebase Storage URLs to avoid burning Vercel image optimization quota. Those images are kept small at the source instead: website-admin shrinks uploads (`lib/imageUpload.ts` there: max 2000 px, WebP, 1-year cache header), and `scripts/shrink-storage-images.mjs` did the same once for older uploads (dry run by default; `--apply` writes, backups go to `image-backup/`).

### Component conventions

- `"use client"` is only added when React hooks or browser APIs are needed (e.g., `Nav.tsx`, `UpdatesSection`). Everything else is a Server Component.
- Section components under `components/home/` are pure presentational; data is fetched in `app/(main)/page.tsx` and passed as props.
- `components/PageContainer.tsx` wraps content with max-width + horizontal padding.

### Styling

Tailwind CSS v4. The "Dark & ivory" design tokens live in `app/globals.css` (`@theme`): `ink` / `ink-raised` / `ink-line` (dark sections), `ivory` / `sand` (light sections), `on-ink` / `on-ink-muted` / `body` / `muted` (text), `gold` (accent on dark), `brand` (red accent on light). Fonts come from `next/font` in `app/layout.tsx`: Plus Jakarta Sans (`font-sans`, everything) and Instrument Serif (`font-accent`, one italic word in a heading). Instrument Serif lacks Vietnamese letters, so Vietnamese text uses `vietnameseSerif.className` from `lib/fonts.ts` (Cormorant Garamond italic) with `lang="vi"`. Use the tokens, not raw hex or the old stone/amber classes (every page now uses the tokens).

Home page (`app/(main)/page.tsx`) sections, in order: `HeroSection`, `WelcomeSection`, `WeeklySpecialsSection` (Firestore daily specials, today highlighted via `dayOfWeekInTimezone` + the order/rewards cards), `MenuHighlightsSection` (`discoverMenuData.ts`), `UpdatesSection` (Firestore `updates` images shown whole; a placeholder when empty, so sections keep alternating dark/light), `KitchenSection`, `VisitSection` (Firestore `hours`, storefront photo, map). Hero and storefront photos are placeholders to be replaced.

### SEO

- `app/sitemap.ts` exports the sitemap.
- `app/robots.ts` exports robots config.
- Each public page builds its `metadata` with `pageMetadata({ path, title, description, ogTitle?, ogDescription? })` from `lib/seo.ts`. That adds the canonical link and the full Open Graph block (site name, locale, share image), which Next.js would otherwise drop because a page's `openGraph` replaces the root's instead of merging. Add new public pages to `app/sitemap.ts`.
- Share image: `public/og-image.jpg` (1200×630, currently a placeholder dining room photo).
- The root layout renders `components/RestaurantJsonLd.tsx` (schema.org `Restaurant`) from `lib/store.ts`. It has no opening hours on purpose: Google takes hours from the Google Business Profile, and the Firestore `hours` collection is free text for visitors.
