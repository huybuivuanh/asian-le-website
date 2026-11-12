# Asian Le Website

Website for **Asian Le**, a Chinese and Vietnamese restaurant in Prince Albert, SK, at
[www.asianle.ca](https://www.asianle.ca). Customers can browse the menu, **order takeout
online** (pay at pickup), **book a table**, and use their **Asian Le Rewards** points at
checkout. Built with Next.js 16 (App Router), TypeScript, Tailwind CSS v4, and Firebase.

## Pages

| Route | Description |
|---|---|
| `/` | Home: hero, welcome, this week's daily specials (today highlighted), menu highlights, news, kitchen, visit info with hours and map |
| `/menu` | Full menu |
| `/order` | Online ordering: live availability (sold out, time windows), item options, cart, wait time |
| `/checkout` | Pickup now or scheduled (up to 30 days ahead), customer details, rewards sign-in and points, pay at pickup. Waits for the restaurant to confirm |
| `/reservations` | Table booking, limited to the reservation hours set in website-admin |
| `/gallery` | Photo gallery |
| `/about-us` | About the restaurant |
| `/contact-us` | Contact form (Formspree) and location info |

API routes: `POST /api/orders` (places an order), `/api/cart/availability`,
`POST /api/reservations`, `/api/rewards/points`.

## How it fits with the other apps

All data lives in the shared **`asianlepos`** Firebase project under
`businesses/{NEXT_PUBLIC_BUSINESS_ID}/`, with the POS, Orders app, website-admin and rewards.

- **website-admin** edits the menu (`webCategories`, `webMenuItems`, `webOptionGroups`,
  `webOptions`), daily specials, gallery, news, hours and store settings.
- **Orders** written here go to `orders`. The **Asian Le Orders** app accepts, prints and
  completes them; the POS shows them read-only. This repo has no order-management UI.
- **Rewards:** customers sign in at checkout; the order saves `loyalty = { memberId, memberName }`.
  100 points = $5 off before tax. Points aren't taken at checkout: the Orders app takes and
  earns them when it completes the order. `/api/orders` makes sure the same points aren't
  promised on two open orders.
- **Prices are never trusted from the browser.** `/api/orders` re-prices the cart from live
  Firestore data, checks availability and pickup time, and writes with the Admin SDK.
- Security rules live in the `asian-le-firebase` repo.

Full details: `CLAUDE.md`, `ecommerce.md` (menu data model) and `orders-schema.md` (order shape).

## Tech Stack

- **Framework**: Next.js 16 (App Router, Server Components, ISR every 15 minutes; `/checkout` is always dynamic)
- **Language**: TypeScript (strict)
- **Styling**: Tailwind CSS v4, "dark & ivory" design tokens in `app/globals.css`
- **Backend / CMS**: Firebase (Firestore, Storage, Auth for rewards) + Firebase Admin SDK on the server
- **Cart**: Zustand (in memory only)
- **Analytics**: Vercel Analytics + Speed Insights
- **Deployment**: Vercel; `asianle.ca` redirects to `www.asianle.ca`

## Project Structure

```
app/
  (main)/            # All public pages (route group, no URL segment)
  api/               # orders, cart, reservations, rewards
  layout.tsx         # Root layout: Nav, Footer, JSON-LD, analytics
  sitemap.ts         # Sitemap
  robots.ts          # robots.txt

components/
  home/  menu/  order/  cart/  checkout/  reservation/  gallery/  contact/  ui/
  Nav.tsx  Footer.tsx  RestaurantJsonLd.tsx  PageContainer.tsx

hooks/checkout/      # Checkout form state (availability, pickup time, details, rewards, placed order)

lib/
  siteData.server.ts # Home page data (updates, gallery, daily specials)
  orderMenuData.ts   # Website menu from Firestore
  storeSettings.ts   # Hours, holidays, pause ordering
  availability.ts    # Sold-out / time windows / store open / pickup-time rules (pure)
  orderPricing.ts    # GST 5% + PST 6%
  cartStore.ts       # Client cart
  reservation.ts     # Reservations (saved as $0 scheduled orders)
  rewards*.ts        # Rewards config, sign-in, rules
  business.ts        # bizCol / bizDoc path helpers
  seo.ts             # SITE_URL and pageMetadata()
  store.ts           # Store address, phone, social links
  server/            # Server-only: orders/, rewards/, Admin SDK business paths, HTTP helpers

scripts/
  shrink-storage-images.mjs   # One-time shrink of older Storage images (dry run by default)

types/
  global.d.ts  enum.ts
```

## Getting Started

```bash
npm install
cp .env.example .env.local   # then fill it in
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

```
# Firebase web config (asianlepos)
NEXT_PUBLIC_API_KEY=
NEXT_PUBLIC_AUTH_DOMAIN=
NEXT_PUBLIC_PROJECT_ID=
NEXT_PUBLIC_STORAGE_BUCKET=
NEXT_PUBLIC_MESSAGING_SENDER_ID=
NEXT_PUBLIC_APP_ID=
NEXT_PUBLIC_MEASUREMENT_ID=

# Required: this site's businesses/{id} doc id
NEXT_PUBLIC_BUSINESS_ID=

# Server only: the whole Firebase service account JSON on one line (needed to place orders)
SERVICE_ACCOUNT_KEY=

# Contact form
NEXT_PUBLIC_FORMSPREE_FORM_ID=

# Optional rewards settings
NEXT_PUBLIC_REWARDS_ENABLED=   # "false" hides rewards at checkout
NEXT_PUBLIC_REWARDS_APP_URL=   # defaults to https://rewards.asianle.ca
```

Without `SERVICE_ACCOUNT_KEY` everything works except placing orders and reservations.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
