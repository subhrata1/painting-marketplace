# Artistry — Painting Marketplace Setup Guide

Everything code-related is built and ready. Below are the **external steps you must complete** to go live.

---

## Quick Start (Local Development)

```bash
cd ~/painting-marketplace
npm install          # already done
cp .env.example .env # edit with your keys
npm run dev          # starts at http://localhost:3000
```

---

## STEP 1: Register a Domain Name

**You must do this manually** — requires payment and identity verification.

| Registrar | URL | Price Range |
|-----------|-----|-------------|
| Namecheap | namecheap.com | ~$9-15/year for .com |
| Google Domains | domains.google | ~$12/year |
| Cloudflare Registrar | dash.cloudflare.com | At-cost pricing |

**Recommended:** Pick a name like `artistry.com`, `artistrymarket.com`, etc.

After purchasing, you'll configure DNS in Step 3.

---

## STEP 2: Set Up Stripe (Payments & Billing)

This handles the 20% commission split automatically.

### 2a. Create a Stripe account
1. Go to **https://dashboard.stripe.com/register**
2. Complete business verification (name, address, bank account)
3. Once approved, go to **Developers → API Keys**
4. Copy your **Publishable key** (`pk_live_...`) and **Secret key** (`sk_live_...`)

### 2b. Enable Stripe Connect (for artist payouts)
1. In Stripe Dashboard → **Connect → Settings**
2. Enable **Express accounts**
3. Set your platform's branding (name, icon, color)
4. Set the **platform fee** — the code handles this (20%), but Stripe needs Connect enabled

### 2c. Set up the Webhook
1. Go to **Developers → Webhooks → Add endpoint**
2. Endpoint URL: `https://yourdomain.com/api/webhooks/stripe`
3. Select events:
   - `checkout.session.completed`
   - `account.updated`
4. Copy the **Signing secret** (`whsec_...`)

### 2d. Update your `.env` file
```
STRIPE_SECRET_KEY=sk_live_YOUR_KEY
STRIPE_PUBLISHABLE_KEY=pk_live_YOUR_KEY
STRIPE_WEBHOOK_SECRET=whsec_YOUR_SECRET
```

> **Use `sk_test_` keys first** to test with fake cards before going live.

---

## STEP 3: Choose Hosting & Deploy

### Option A: Railway (Easiest — recommended)

1. Go to **https://railway.app** → Sign up with GitHub
2. Click **New Project → Deploy from GitHub repo** (push this code to a GitHub repo first)
3. Railway auto-detects Node.js and runs `npm start`
4. Add environment variables in **Variables** tab (copy from your `.env`)
5. Add a **Volume** for the `uploads/` directory (persistent file storage)
6. Go to **Settings → Networking → Generate Domain** to get a Railway URL
7. Or add your custom domain (see DNS below)

**Cost:** ~$5-10/month for a small app

### Option B: DigitalOcean App Platform

1. Go to **https://cloud.digitalocean.com/apps** → Create App
2. Connect your GitHub repo
3. Set environment variables
4. Choose the **$5/month Basic plan**
5. Add a **managed database** (PostgreSQL) if you want to scale beyond SQLite later

### Option C: VPS (Full Control)

1. Spin up a VPS on DigitalOcean/Linode/Hetzner (~$5-6/month)
2. SSH in and install Node.js 20+
3. Clone your repo, run `npm install --production`
4. Use **PM2** to keep the server running:
   ```bash
   npm install -g pm2
   pm2 start server.js --name artistry
   pm2 save && pm2 startup
   ```
5. Install **Nginx** as a reverse proxy:
   ```nginx
   server {
       listen 80;
       server_name yourdomain.com;
       client_max_body_size 10M;

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   ```
6. Install SSL with **Certbot**:
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d yourdomain.com
   ```

---

## STEP 4: Configure DNS

After choosing a hosting provider, point your domain to it.

### For Railway / App Platform (CNAME):
1. Log into your domain registrar
2. Add a **CNAME** record:
   - **Name:** `@` or `www`
   - **Value:** The URL your host gave you (e.g., `artistry-production.up.railway.app`)

### For a VPS (A Record):
1. Add an **A** record:
   - **Name:** `@`
   - **Value:** Your server's IP address (e.g., `167.71.xx.xx`)
2. Add another **A** record for `www` pointing to the same IP

DNS propagation takes 5 minutes to 48 hours.

---

## STEP 5: Go-Live Checklist

| # | Task | Status |
|---|------|--------|
| 1 | Domain registered | ⬜ |
| 2 | Stripe account verified & live keys in `.env` | ⬜ |
| 3 | Stripe Connect enabled | ⬜ |
| 4 | Stripe webhook configured | ⬜ |
| 5 | Code deployed to hosting provider | ⬜ |
| 6 | DNS pointed to host | ⬜ |
| 7 | SSL/HTTPS working | ⬜ |
| 8 | Update `DOMAIN` in `.env` to `https://yourdomain.com` | ⬜ |
| 9 | Change `JWT_SECRET` to a random 64-character string | ⬜ |
| 10 | Test: register as artist, upload painting, buy with test card | ⬜ |
| 11 | Switch Stripe from test to live keys | ⬜ |

---

## Architecture Overview

```
┌─────────────┐     ┌─────────────────┐     ┌──────────┐
│   Browser    │────▶│  Express Server  │────▶│  SQLite   │
│  (HTML/CSS/  │     │  (Node.js)       │     │  Database  │
│   JS)        │◀────│                  │     └──────────┘
└─────────────┘     │  /api/auth       │
                    │  /api/paintings   │────▶ /uploads/ (images)
                    │  /api/payments    │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │  Stripe Connect   │
                    │  (20% to you,    │
                    │   80% to artist)  │
                    └──────────────────┘
```

---

## File Structure

```
painting-marketplace/
├── server.js              # Express app entry point
├── .env                   # Environment variables (secrets)
├── package.json
├── db/
│   ├── schema.sql         # Database schema
│   ├── index.js           # Database connection
│   └── init.js            # Manual DB init script
├── middleware/
│   └── auth.js            # JWT authentication
├── routes/
│   ├── auth.js            # Register, login, logout, profile
│   ├── paintings.js       # CRUD, upload, search, filter
│   └── payments.js        # Stripe Connect, checkout, webhooks, orders
├── public/
│   ├── index.html         # Gallery homepage
│   ├── login.html         # Login page
│   ├── register.html      # Sign up (buyer or artist)
│   ├── upload.html        # Artist: upload painting
│   ├── painting.html      # Painting detail + buy
│   ├── dashboard.html     # Artist dashboard (sales, shipments)
│   ├── order-success.html # Post-purchase confirmation
│   ├── terms.html         # Terms of Service (20% fee, shipping rules)
│   ├── css/style.css      # All styles
│   └── js/app.js          # Shared frontend JS
└── uploads/               # Uploaded painting images
```
