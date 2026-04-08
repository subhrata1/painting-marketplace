const express = require('express');
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

function getStripe() {
  return require('stripe')(process.env.STRIPE_SECRET_KEY);
}

const PLATFORM_FEE = parseInt(process.env.PLATFORM_FEE_PERCENT || '20', 10);

// Create Stripe Connect account for artist
router.post('/connect', authenticateToken, requireRole('artist'), async (req, res) => {
  try {
    const stripe = getStripe();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

    let accountId = user.stripe_account_id;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        email: user.email,
        capabilities: { transfers: { requested: true } },
      });
      accountId = account.id;
      db.prepare('UPDATE users SET stripe_account_id = ? WHERE id = ?').run(accountId, req.user.id);
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${process.env.DOMAIN}/dashboard.html?stripe=refresh`,
      return_url: `${process.env.DOMAIN}/dashboard.html?stripe=success`,
      type: 'account_onboarding',
    });

    res.json({ url: accountLink.url });
  } catch (err) {
    console.error('Stripe Connect error:', err.message);
    res.status(500).json({ error: 'Failed to set up payment account' });
  }
});

// Create checkout session for a painting
router.post('/checkout/:paintingId', authenticateToken, async (req, res) => {
  try {
    const stripe = getStripe();
    const painting = db.prepare(
      `SELECT p.*, u.stripe_account_id, u.stripe_onboarded, u.name as artist_name
       FROM paintings p JOIN users u ON p.artist_id = u.id WHERE p.id = ?`
    ).get(req.params.paintingId);

    if (!painting) return res.status(404).json({ error: 'Painting not found' });
    if (painting.status !== 'available') return res.status(400).json({ error: 'Painting is no longer available' });
    if (painting.artist_id === req.user.id) return res.status(400).json({ error: 'You cannot buy your own painting' });

    if (!painting.stripe_account_id) {
      return res.status(400).json({ error: 'Artist has not set up payment receiving yet' });
    }

    const platformFee = Math.round(painting.price_cents * PLATFORM_FEE / 100);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: painting.title,
            description: `By ${painting.artist_name}`,
            images: painting.image_path ? [`${process.env.DOMAIN}${painting.image_path}`] : [],
          },
          unit_amount: painting.price_cents,
        },
        quantity: 1,
      }],
      payment_intent_data: {
        application_fee_amount: platformFee,
        transfer_data: { destination: painting.stripe_account_id },
      },
      shipping_address_collection: { allowed_countries: ['US', 'CA', 'GB', 'AU'] },
      metadata: {
        painting_id: painting.id.toString(),
        buyer_id: req.user.id.toString(),
        artist_id: painting.artist_id.toString(),
      },
      success_url: `${process.env.DOMAIN}/order-success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.DOMAIN}/painting.html?id=${painting.id}`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Checkout error:', err.message);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Stripe webhook handler — called from server.js with raw body
router.handleWebhook = async (req, res) => {
  const stripe = getStripe();
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send('Webhook error');
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { painting_id, buyer_id, artist_id } = session.metadata;
    const totalCents = session.amount_total;
    const platformFee = Math.round(totalCents * PLATFORM_FEE / 100);
    const artistPayout = totalCents - platformFee;

    const shipping = session.shipping_details;

    db.prepare(
      `INSERT INTO orders (painting_id, buyer_id, artist_id, total_cents, platform_fee_cents, artist_payout_cents, stripe_payment_intent, status, shipping_name, shipping_address, shipping_city, shipping_state, shipping_zip, shipping_country)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'paid', ?, ?, ?, ?, ?, ?)`
    ).run(
      painting_id, buyer_id, artist_id, totalCents, platformFee, artistPayout,
      session.payment_intent,
      shipping?.name || null,
      shipping?.address?.line1 || null,
      shipping?.address?.city || null,
      shipping?.address?.state || null,
      shipping?.address?.postal_code || null,
      shipping?.address?.country || null
    );

    db.prepare("UPDATE paintings SET status = 'sold', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(painting_id);
  }

  if (event.type === 'account.updated') {
    const account = event.data.object;
    if (account.charges_enabled) {
      db.prepare('UPDATE users SET stripe_onboarded = 1 WHERE stripe_account_id = ?').run(account.id);
    }
  }

  res.json({ received: true });
};

// Get my orders (buyer)
router.get('/orders/mine', authenticateToken, (req, res) => {
  const orders = db.prepare(
    `SELECT o.*, p.title, p.image_path, u.name as artist_name
     FROM orders o JOIN paintings p ON o.painting_id = p.id JOIN users u ON o.artist_id = u.id
     WHERE o.buyer_id = ? ORDER BY o.created_at DESC`
  ).all(req.user.id);
  res.json({ orders });
});

// Get my sales (artist)
router.get('/orders/sales', authenticateToken, requireRole('artist', 'admin'), (req, res) => {
  const orders = db.prepare(
    `SELECT o.*, p.title, p.image_path, u.name as buyer_name
     FROM orders o JOIN paintings p ON o.painting_id = p.id JOIN users u ON o.buyer_id = u.id
     WHERE o.artist_id = ? ORDER BY o.created_at DESC`
  ).all(req.user.id);
  res.json({ orders });
});

// Update shipping (artist marks as shipped)
router.put('/orders/:id/ship', authenticateToken, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.artist_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });

  const { tracking_number } = req.body;
  db.prepare(
    "UPDATE orders SET status = 'shipped', tracking_number = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(tracking_number || null, req.params.id);

  res.json({ ok: true });
});

module.exports = router;
