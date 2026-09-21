# The Brush Collective — Project Reference

> **Tagline:** Where every brushstroke finds its buyer
> **Live URL:** https://www.thebrushcollective.com (Railway: https://painting-marketplace-production.up.railway.app)
> **Domain:** www.thebrushcollective.com (registered on Squarespace — root domain without `www` does not resolve)
> **Hosting:** Railway (CLI deploy via `railway up`)
> **Stack:** Node.js / Express / SQLite (better-sqlite3) / Stripe Connect / Resend (email)

---

## Overview

The Brush Collective is a curated online marketplace where artists worldwide can sign up, upload, and sell their original paintings directly to collectors. The site owner acts as admin/curator and also sells their own art. The platform takes a 20% commission on each sale; artists keep 80%. Artists are responsible for their own shipping.

---

## Architecture

```
Browser (HTML/CSS/JS)
   │
   ▼
Express Server (Node.js, port 3000)
   ├── /api/auth        → Registration, login, logout, profile, admin user management
   ├── /api/paintings   → CRUD, upload, search, filter, spotlight
   ├── /api/payments    → Stripe Connect, checkout sessions, webhooks, orders
   │
   ├── SQLite Database  → users, paintings, orders, spotlights tables
   ├── /uploads/        → Painting images (persistent volume in production)
   ├── Stripe Connect   → 80/20 split, artist payouts, secure checkout
   ├── Resend (HTTP)    → Transactional emails (welcome, reminders, spotlight, admin alerts)
   ├── node-cron        → Weekly spotlight (Mon 9AM), New This Week IG post (Fri 10AM), hourly artist check
   ├── Instagram API    → Auto-post spotlights + New This Week via Graph API (when credentials set)
   └── NSFW.js          → AI content moderation on image uploads
```

---

## File Structure

```
painting-marketplace/
├── server.js                  # Express entry point (trust proxy, cron registration)
├── package.json
├── .env                       # Secrets (JWT_SECRET, STRIPE keys, ADMIN_EMAIL, IG keys)
├── .env.example               # Template for env vars
├── SETUP-GUIDE.md             # Deployment & setup instructions
├── PROJECT-REFERENCE.md       # This file
│
├── db/
│   ├── schema.sql             # Database schema (users, paintings, orders, spotlights)
│   ├── index.js               # DB connection, migrations, table creation
│   └── init.js                # Manual DB init script
│
├── middleware/
│   ├── auth.js                # JWT authentication (authenticateToken, requireRole)
│   └── moderation.js          # AI image moderation using NSFW.js (MobileNetV2)
│
├── routes/
│   ├── auth.js                # Auth routes + admin user management + account deletion
│   ├── paintings.js           # Paintings CRUD, upload, search, filters, spotlight API
│   └── payments.js            # Stripe Connect, checkout, webhooks, orders
│
├── utils/
│   ├── mailer.js              # Email via Resend (welcome, reminder, spotlight announcement)
│   ├── artist-cron.js         # Hourly cron: 72h reminder + 96h auto-delete inactive artists
│   ├── spotlight-cron.js      # Weekly cron: auto-select spotlight (Mon 9AM UTC) + email + IG post
│   ├── new-this-week-cron.js  # Weekly cron: auto-post "New This Week" to Instagram (Fri 10AM UTC)
│   └── instagram.js           # Instagram Graph API integration (auto-post spotlights)
│
├── public/
│   ├── index.html             # Homepage — hero, spotlight, new this week, marquee, CTA, disclaimer
│   ├── gallery.html           # Dedicated gallery page (search, filters, artist/style dropdowns, tabs)
│   ├── artists.html           # Public artists listing page
│   ├── artist.html            # Individual artist profile (paintings + Instagram link)
│   ├── painting.html          # Painting detail page + buy button + inline edit form
│   ├── edit-painting.html     # Standalone edit page (legacy, inline edit preferred)
│   ├── upload.html            # Upload painting form (currency, dimensions, sold/available)
│   ├── dashboard.html         # Artist dashboard (stats, sales, shipments, edit/delete, Instagram URL)
│   ├── admin.html             # Admin panel (spotlight, new this week IG posts, artists, paintings, users)
│   ├── ig-announcement.html   # Instagram post/story generator (downloadable PNGs)
│   ├── join.html              # "Sell Your Art" landing page for artists (← Home link)
│   ├── login.html             # Login page
│   ├── register.html          # Sign up (buyer or artist)
│   ├── order-success.html     # Post-purchase confirmation
│   ├── terms.html             # Terms of Service
│   ├── css/style.css          # Global styles (dark theme)
│   └── js/app.js              # Shared JS (api helper, auth, nav, paintingCard, buyPainting)
│
├── backups/                   # Pre-feature backups for rollback
└── uploads/                   # Uploaded painting images
```

---

## Key Features

### For Artists
- Free sign-up, no listing fees
- **Must upload at least one painting during registration** — artists cannot join without artwork
- **Click-wrap Artist Agreement** required at sign-up — covers content responsibility, 20% commission, shipping obligations, prohibited content, liability disclaimer. Artist must check the agreement checkbox before registering.
- Upload paintings with title, price (USD/EUR/GBP), style, medium, dimensions (cm/inches toggle), description, image
- Mark paintings as "Available" or "Already Sold" (portfolio showcase)
- **Inline edit** paintings directly on the painting detail page (title, price, currency, status, style, medium, dimensions, year, description)
- Dashboard with stats: listed, sold, revenue, pending shipments
- Edit and Delete buttons on each painting card in dashboard
- Track sales and mark orders as shipped with tracking number
- Stripe Connect for direct payouts (80% of sale price)
- Add Instagram profile URL to dashboard (displayed on public artist profile page with IG icon)
- Delete own account (two-step confirmation: confirm + type "DELETE")

### Automated Artist Emails
- **Email provider:** [Resend](https://resend.com) — HTTP-based email API (not SMTP). Free tier: 100 emails/day, 3,000/month
- **Sender address:** `hello@thebrushcollective.com` (requires domain verification on Resend + DNS records on Squarespace)
- **Congratulations email** sent immediately when an artist registers with their first painting — celebrates the first listing being live, encourages uploading more paintings and connecting Stripe
- **Admin notification** sent to `ADMIN_NOTIFICATION_EMAIL` (subhratapatel@gmail.com) when a new artist joins — confirms first painting was uploaded during registration
- **Admin resend** — admin panel includes a "Resend Welcome Email" button per artist to manually re-send the welcome email
- **72-hour reminder** (safety net) — if an artist has no paintings after 72 hours (e.g. deleted all paintings after joining), they receive a reminder warning of auto-deletion in 24 hours
- **96-hour auto-deletion** — if still no paintings after 96 hours (72h + 24h grace), the artist profile is automatically deleted and a final notice is sent
- **Deletion notice** — informs the artist their profile was removed with a link to re-register
- Cron job runs hourly (`utils/artist-cron.js`) to check artist upload status — primarily a safety net since registration now requires a painting
- Uses `reminder_sent` column on users table to track email state
- Startup diagnostics: logs `RESEND_API_KEY` presence check and sender address on boot
- **Why Resend instead of SMTP?** Railway blocks outbound SMTP ports (465, 587). Resend uses HTTPS (port 443) which works on Railway.

### Artist Registration Flow
1. Artist selects "Sell my paintings" on `/register.html`
2. Painting upload fields appear: image (required), title (required), price (required), currency
3. **Click-wrap Artist Agreement** appears: scrollable terms box covering content responsibility, commission, shipping, prohibited content, liability — with a required checkbox
4. On submit, `POST /api/auth/register-artist` creates the user + painting atomically in a SQLite transaction
5. AI content moderation (NSFW.js) runs on the uploaded image before saving
6. If any step fails, the transaction rolls back and the uploaded file is cleaned up
7. On success: JWT cookie set, congratulations email + admin notification sent, user redirected to their new painting page
8. **Old `/register` endpoint blocks artist role** — returns error directing them to the artist sign-up form

#### DNS Records for Email (Squarespace)
To send from `hello@thebrushcollective.com`, these DNS records must be set in Squarespace (Settings → Domains → DNS Settings):

**Outbound (Resend — sending emails):**

| Type | Name | Data | Priority |
|------|------|------|----------|
| TXT | `resend._domainkey` | DKIM public key (from Resend dashboard) | — |
| MX | `send` | `feedback-smtp.eu-west-1.amazonses.com.` | 10 |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` | — |

Verify domain status at: https://resend.com/domains

**Inbound (ImprovMX — receiving emails):**

| Type | Name | Data | Priority |
|------|------|------|----------|
| MX | `@` | `mx1.improvmx.com.` | 10 |
| MX | `@` | `mx2.improvmx.com.` | 20 |
| TXT | `@` | `v=spf1 include:spf.improvmx.com ~all` | — |

Emails sent to `hello@thebrushcollective.com` (and any `*@thebrushcollective.com`) are forwarded to `subhratapatel@gmail.com` via [ImprovMX](https://improvmx.com) (free tier).
Manage aliases at: https://app.improvmx.com

### For Buyers / Public
- Browse all paintings without signing in
- Search by title, artist name
- Filter by style, status (Available/Sold/All)
- View all artists on `/artists.html`
- View individual artist profiles on `/artist.html?id=X`
- Click artist names on painting cards to view their full collection
- "Buy Now" button on every available painting card
- Painting detail page with full info + purchase button
- **Reviews & Feedback** — leave reviews on any painting without logging in (name optional, thumbs up/down rating)
- **Thumbs up / Thumbs down reactions** — anonymous reactions tracked by browser fingerprint (one per visitor per painting, toggleable)
- Secure checkout via Stripe
- If not logged in, redirected to sign up before purchasing

### Spotlight of the Week
- **Automatic weekly selection**: Every Monday at 9:00 AM UTC, a cron job (`utils/spotlight-cron.js`) auto-selects a random available painting as Spotlight of the Week
  - Skips if admin already set a spotlight for that week (admin override)
  - Avoids repeating the same painting as last week (if others are available)
- **Admin manual override**: Admin can set any painting as spotlight via the admin panel's Spotlight tab
  - Replaces any existing spotlight for the current week
  - Optional custom message displayed alongside the painting
- **Homepage display**: Spotlight section appears between hero and marquee with:
  - Painting image, title, artist name (linked to artist profile)
  - Custom message (if set), style/medium/year/size details, price
  - "View & Buy" / "See Artist" action buttons
  - Warm gold gradient background with decorative top-line accent
- **Email announcement**: Auto-sends styled HTML email to all registered users when a spotlight is selected (both auto and manual)
- **Instagram auto-post**: When spotlight is set (auto or manual), auto-posts to Instagram via Graph API with formatted caption + hashtags
  - Requires `INSTAGRAM_ACCOUNT_ID` and `INSTAGRAM_ACCESS_TOKEN` env vars
  - Gracefully skips if credentials not set
  - Admin can check "Skip Instagram post" when setting spotlight manually
- **Instagram announcement kit**: `/ig-announcement.html` generates downloadable Feed Post (1080x1080) and Story (1080x1920) images using html2canvas, with copy-caption button and posting instructions

### AI Content Moderation
- Uses NSFW.js (MobileNetV2 model) to scan uploaded painting images
- Blocks explicit/pornographic content automatically
- Model loads on server startup; runs inference on each upload
- If moderation API fails, upload is allowed (doesn't block artists due to AI errors)

### For Admin
- Admin role auto-assigned via `ADMIN_EMAIL` env var
- Admin panel at `/admin.html` with 5 tabs: Spotlight, New This Week, Artists, All Paintings, All Users
- Spotlight tab: view current spotlight, set new spotlight (painting dropdown + message), Instagram share card preview with download/copy-caption
- **New This Week tab**: Shows paintings added in the last 7 days with:
  - Combined grid Instagram card (4:5 portrait, 1080x1350) with all new paintings — download image + copy caption
  - Individual Instagram cards per painting — each with its own download image + copy caption
  - Auto-post status indicator showing next Friday auto-post schedule
  - Cards use `object-fit: contain` to show full paintings without distortion
- Stats overview: total artists, listed paintings, sold, total users — each stat card is clickable and navigates to its corresponding tab
- **Resend Welcome Email** button on each artist card in the Artists tab — manually re-sends the congratulations email
- **Set artist Instagram URL** via `PUT /api/auth/artists/:id/instagram`
- Edit any painting (inline edit on painting detail page)
- Remove any painting (inappropriate content moderation)
- Delete any user account (removes their paintings too)
- Admin account protected from self-deletion
- Can upload and sell own paintings too

### Homepage Design
- Clean, simple dark theme
- **Top navigation**: Gallery, Artists, Terms, Sell Your Art (always visible)
- Hamburger menu (☰) → full-screen overlay with:
  - Left: italic serif navigation links (Home, Gallery, Artists, Sell Your Art, About)
  - Right: about section, contact email, newsletter subscribe form
  - Links animate in with staggered delay
  - ☰ animates to ✕ when open
- **Spotlight of the Week** section (auto-hidden when no spotlight is active) — image uses `object-fit: contain` for full painting display
- **New This Week** section — shows paintings added in the last 7 days in a card grid
- Auto-scrolling marquee showing painting thumbnails with title + Available/Sold status
- **CTA row** (side-by-side): "Ready to sell your paintings?" + The Brush Collective about/contact with email and Instagram handle (`@thebrushcollective_`)
- **Footer disclaimer** — states all content is uploaded by artists and is their sole responsibility, with contact email for infringement claims
- Floating back-to-top button (↑) on all pages
- "← Home" back button on all subpages

### Gallery Page (`/gallery.html`)
- Dedicated page for browsing the full collection
- Dark gradient background matching site theme
- Search by title/artist, artist dropdown filter, style dropdown filter
- Tabs: All / Available / Sold (with live counts)
- Responsive grid with painting cards (4:5 aspect ratio images)
- Click any painting to view its detail page

### Painting Edit (Inline)
- On the painting detail page (`/painting.html?id=X`), the owner or admin sees an "Edit Painting" button
- Clicking it transforms the painting info section into an editable form (same page, no navigation)
- All fields editable: title, price, currency, status, style, medium, width, height, year, description
- Image is shown but cannot be changed after upload
- "Save Changes" button sends PUT request, reloads data, switches back to view mode
- "Cancel" button discards changes and returns to view mode
- Currency and status use toggle buttons (same style as upload form)

---

## Database Schema

### users
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER | Primary key, autoincrement |
| email | TEXT | Unique, not null |
| password_hash | TEXT | bcrypt, 12 rounds |
| name | TEXT | Not null |
| role | TEXT | 'buyer', 'artist', or 'admin' |
| bio | TEXT | Optional |
| profile_image | TEXT | Optional |
| instagram_url | TEXT | Optional Instagram profile URL |
| stripe_account_id | TEXT | Stripe Connect account |
| stripe_onboarded | INTEGER | 0 or 1 |
| created_at | DATETIME | Auto |
| updated_at | DATETIME | Auto |

### paintings
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER | Primary key, autoincrement |
| artist_id | INTEGER | FK → users.id |
| title | TEXT | Not null |
| description | TEXT | Optional |
| style | TEXT | e.g. "Impressionism", "Abstract" |
| medium | TEXT | e.g. "Oil on canvas" |
| year_created | TEXT | Optional |
| width_inches | REAL | Stored in inches (frontend converts cm) |
| height_inches | REAL | Stored in inches |
| price_cents | INTEGER | Price in cents |
| currency | TEXT | 'USD', 'EUR', or 'GBP' |
| image_path | TEXT | e.g. /uploads/uuid.jpg |
| status | TEXT | 'available', 'sold', or 'removed' |
| created_at | DATETIME | Auto |
| updated_at | DATETIME | Auto |

### orders
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER | Primary key, autoincrement |
| painting_id | INTEGER | FK → paintings.id |
| buyer_id | INTEGER | FK → users.id |
| artist_id | INTEGER | FK → users.id |
| total_cents | INTEGER | Full price |
| platform_fee_cents | INTEGER | 20% commission |
| artist_payout_cents | INTEGER | 80% to artist |
| stripe_payment_intent | TEXT | Stripe reference |
| status | TEXT | pending/paid/shipped/delivered/cancelled/refunded |
| shipping_* | TEXT | Name, address, city, state, zip, country |
| tracking_number | TEXT | Optional, added when shipped |
| created_at | DATETIME | Auto |
| updated_at | DATETIME | Auto |

### spotlights
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER | Primary key, autoincrement |
| painting_id | INTEGER | FK → paintings.id |
| message | TEXT | Optional admin message |
| week_start | DATE | Monday of the week |
| week_end | DATE | Sunday of the week |
| auto_selected | INTEGER | 1 = cron-selected, 0 = admin-set |
| created_at | DATETIME | Auto |

Index: `idx_spotlights_week` on (week_start, week_end)

### reviews
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER | Primary key, autoincrement |
| painting_id | INTEGER | FK → paintings.id |
| name | TEXT | Reviewer name (default 'Anonymous') |
| text | TEXT | Review text, not null |
| rating | INTEGER | -1 (dislike), 0 (neutral), 1 (like) |
| created_at | DATETIME | Auto |

### reactions
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER | Primary key, autoincrement |
| painting_id | INTEGER | FK → paintings.id |
| fingerprint | TEXT | Browser-generated ID for anonymous tracking |
| type | TEXT | 'like' or 'dislike' |
| created_at | DATETIME | Auto |

Unique constraint: (painting_id, fingerprint) — one reaction per visitor per painting

---

## API Routes

### Auth (`/api/auth`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /register | No | Create account (buyer/admin only — artists blocked, must use /register-artist) |
| POST | /register-artist | No | Create artist account with required first painting (multipart form) |
| POST | /login | No | Login, returns JWT cookie |
| POST | /logout | No | Clears JWT cookie |
| GET | /me | Yes | Get current user profile (includes instagram_url) |
| PUT | /me | Yes | Update name/bio/instagram_url |
| DELETE | /me | Yes | Delete own account (not admin) |
| GET | /public/artists | No | List artists with paintings (public) |
| GET | /public/artists/:id | No | Get single artist profile (includes instagram_url) |
| GET | /artists | Admin | List all artists with stats |
| PUT | /artists/:id/instagram | Admin | Set artist Instagram URL |
| GET | /users | Admin | List all users |
| POST | /users/:id/resend-welcome | Admin | Resend welcome email to an artist |
| DELETE | /users/:id | Admin | Delete a user and their paintings |

### Paintings (`/api/paintings`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | / | No | List paintings (filter by style, search, artist_id, status) |
| GET | /new-this-week | No | Get paintings added in the last 7 days |
| GET | /spotlight | No | Get current week's spotlight (painting + artist details) |
| POST | /spotlight | Admin | Set spotlight for current week (auto-posts to Instagram) |
| GET | /meta/styles | No | Get distinct styles for filter dropdown |
| GET | /artist/mine | Artist | Get my paintings |
| GET | /admin/all | Admin | Get all paintings across all artists |
| GET | /:id | No | Get single painting detail |
| POST | / | Artist | Upload new painting (multipart form) |
| PUT | /:id | Owner/Admin | Update painting (all fields: title, price, currency, status, style, medium, dimensions, year, description) |
| GET | /:id/reviews | No | Get all reviews for a painting |
| POST | /:id/reviews | No | Post a review (name, text, rating — no login required) |
| DELETE | /:id/reviews/:reviewId | Admin | Delete a review |
| GET | /:id/reactions | No | Get like/dislike counts + visitor's reaction (via ?fp=) |
| POST | /:id/reactions | No | Toggle like/dislike (uses fingerprint for anonymous tracking) |
| DELETE | /:id | Owner/Admin | Soft-delete (status → 'removed') |

### Payments (`/api/payments`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /connect | Artist | Create Stripe Connect account link |
| POST | /checkout/:id | Buyer | Create Stripe checkout session |
| POST | /webhook | No | Stripe webhook handler |
| GET | /orders/sales | Artist | Get artist's sales |
| PUT | /orders/:id/ship | Artist | Mark order as shipped |

---

## Environment Variables

```env
PORT=3000
JWT_SECRET=your-random-64-char-string
ADMIN_EMAIL=your@email.com
ADMIN_NOTIFICATION_EMAIL=subhratapatel@gmail.com
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
DOMAIN=https://www.thebrushcollective.com
NODE_ENV=production
BACKUP_SECRET=your-backup-secret

# Email (Resend — HTTP-based, works on Railway)
RESEND_API_KEY=re_...
EMAIL_FROM=The Brush Collective <hello@thebrushcollective.com>

# Instagram Graph API (optional — spotlight auto-post)
INSTAGRAM_ACCOUNT_ID=your-ig-business-account-id
INSTAGRAM_ACCESS_TOKEN=your-long-lived-access-token
```

---

## Deployment (Railway)

```bash
# Login
railway login

# Link to project (first time)
railway link

# Deploy
railway up

# View logs
railway logs

# Open in browser
railway open
```

**Important production notes:**
- Database stored on persistent volume at `/app/uploads/marketplace.db`
- `app.set('trust proxy', 1)` enabled for HTTPS behind Railway's reverse proxy
- Secure cookies with `sameSite: 'lax'` and `secure: true` in production
- Migrations in `db/index.js` handle schema evolution (ALTER TABLE with duplicate column catch)
- **Domain:** `www.thebrushcollective.com` — all email links must use `www` prefix. The root domain (`thebrushcollective.com` without `www`) has no A/CNAME record pointing to Railway and will not resolve. The `DOMAIN` env var is set to `https://www.thebrushcollective.com`.

---

## Paintings Listed

| Title | Description | Status |
|-------|-------------|--------|
| Velvet Bloom | Acrylic painting — woman adorned with roses | Available |
| Golden Hour in Full Bloom | Bold sunflower close-up, warm and inviting | Available |
| Jungle Sovereign | Striking leopard portrait, wild elegance | Available |
| The Fractured Duo | Cracked face diptych, sold in pair | Available |
| Wings of Stillness | Dragonfly painting, calm and graceful | Available |
| Veil of Wings | Butterfly face portrait, mystery and beauty | Available |
| Crown of Gold | Gold-on-black African woman portrait, royalty and grace | Available |

---

## Instagram Ad Campaign

Landing page: `/join.html` with Open Graph meta tags.
Target: artists worldwide, 25-55, interests in painting/art/galleries.
See the full Meta Ads Manager setup guide in conversation history.

---

## Key Fixes Applied

1. **Database persistence** — SQLite stored on Railway persistent volume
2. **HTTPS cookies** — `trust proxy` + secure cookie flags
3. **Route ordering** — specific routes before `/:id` wildcard in Express
4. **Schema migrations** — ALTER TABLE with duplicate column error handling
5. **FormData uploads** — skip Content-Type header for multipart requests
6. **Upload form validation** — changed price input from `type="number"` to `type="text" inputmode="decimal"` to fix browser validation error ("string did not match the expected pattern"); removed `pattern` attribute; added JS validation instead
7. **Painting edit** — separate edit page (`edit-painting.html`) had issues loading the form; replaced with inline edit directly on the painting detail page (`painting.html`) which transforms the info section into an editable form on click
8. **PUT route update** — replaced `COALESCE` pattern with direct field assignment so all fields (including description, currency, year, dimensions) can be properly updated
9. **Admin/user delete FK constraint** — deleting a user failed with "FOREIGN KEY constraint failed" because `orders` and `paintings` tables reference `users.id`. Fixed by temporarily disabling FK checks (`PRAGMA foreign_keys = OFF`) in `routes/auth.js` before deleting orders, paintings, and the user, then re-enabling in a `finally` block. Applied to both admin delete (`DELETE /api/auth/users/:id`) and self-delete (`DELETE /api/auth/me`) routes.
10. **Automated artist onboarding emails** — welcome email on registration, 72h upload reminder, 96h auto-deletion of inactive artists, admin notification on new artist signup. Uses node-cron for scheduling. Added `reminder_sent` column migration to `db/index.js`.
11. **Switched email from Nodemailer/SMTP to Resend HTTP API** — Railway blocks outbound SMTP ports (465, 587), causing connection timeouts. Replaced Nodemailer with Resend SDK (`resend` npm package) which uses HTTPS (port 443). Sender domain `thebrushcollective.com` verified via DNS records (DKIM + SPF) on Squarespace. Emails sent from `hello@thebrushcollective.com`.
12. **Spotlight of the Week** — Weekly featured painting with auto-selection cron (Mon 9AM UTC), admin manual override, homepage display, email announcements, and Instagram auto-post via Graph API. Database migration creates `spotlights` table on startup for existing production DBs.
13. **AI content moderation** — NSFW.js (MobileNetV2) scans uploaded painting images and blocks explicit content before it's saved.
14. **Instagram announcement kit** — `/ig-announcement.html` generates downloadable Feed Post (1080x1080) and Story (1080x1920) PNG images with copy-caption for manual Instagram posting.
15. **Reviews & Reactions** — Public reviews (no login required, optional name + thumbs up/down rating) and anonymous like/dislike reactions tracked by browser fingerprint on each painting detail page. Admin can delete reviews.
16. **Required painting on artist registration** — Artists must upload at least one painting during sign-up via a new `POST /api/auth/register-artist` multipart endpoint. User + painting are created atomically in a SQLite transaction. The old `/register` endpoint blocks artist role. AI content moderation runs on the image. Welcome email updated to congratulations ("Your first painting is live!") instead of 72h deadline warning.
17. **Click-wrap Artist Agreement** — Scrollable terms box on registration page (visible when "Sell my paintings" is selected) covering content responsibility, 20% commission, shipping obligations, prohibited content, and liability. Required checkbox must be ticked before submitting.
18. **Admin resend welcome email** — Admin panel Artists tab has a "Resend Welcome Email" button per artist via `POST /api/auth/users/:id/resend-welcome`.
19. **Disclaimer in hamburger menu** — Full-width disclaimer banner at bottom of the homepage overlay menu stating all content is uploaded by artists and is their sole responsibility.
20. **Email diagnostics** — Startup checks for `RESEND_API_KEY` presence and logs sender address. Cron job logs artist counts per check cycle. `EMAIL_FROM` set to `hello@thebrushcollective.com` on Railway.
21. **Inbound email forwarding** — Set up ImprovMX (free) to forward `hello@thebrushcollective.com` and catch-all `*@thebrushcollective.com` to `subhratapatel@gmail.com`. Added MX records (`mx1.improvmx.com`, `mx2.improvmx.com`) and SPF record on Squarespace DNS.
22. **Domain fix (`www` prefix)** — `thebrushcollective.com` (root domain) has no A/CNAME record and does not resolve. All links in emails and the `DOMAIN` env var must use `https://www.thebrushcollective.com`. Updated Railway `DOMAIN` variable accordingly.
23. **Gallery page** — Moved the collection out of the homepage into a dedicated `/gallery.html` page with search, artist dropdown, style filter, and All/Available/Sold tabs. Top nav "Gallery" link points to this page.
24. **New This Week section** — Homepage section showing paintings added in the last 7 days. API endpoint `GET /api/paintings/new-this-week`.
25. **New This Week admin tab** — Admin panel tab with Instagram post generator: combined grid card (up to 4 paintings) + individual cards per painting, each with downloadable 4:5 portrait image (1080x1350) and copy-caption. Uses html2canvas with `object-fit: contain` so paintings aren't cropped.
26. **Friday auto-post cron** — `utils/new-this-week-cron.js` runs every Friday at 10:00 AM UTC, auto-posts the week's new paintings to Instagram via Graph API. Uses the most recent painting as hero image with a caption listing all new works.
27. **Artist Instagram profiles** — Added `instagram_url` column to users table. Artists can set their Instagram URL in their dashboard. Shows on their public artist profile page (`/artist.html?id=X`) with IG icon and clickable handle. Admin can also set via `PUT /api/auth/artists/:id/instagram`.
28. **Homepage restructure** — Replaced inline gallery with link to gallery page. Added side-by-side CTA row (sell your art + about/contact with email and Instagram handle). Moved disclaimer to footer. Aligned Spotlight and New This Week sections to same max-width (900px) with left-aligned headings.
29. **Top navigation update** — Added "Sell Your Art" link (to `/join.html`) in the persistent top nav beside Terms. Join page has "← Home" back link.
