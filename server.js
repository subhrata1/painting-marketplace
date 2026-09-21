require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const authRoutes = require('./routes/auth');
const paintingRoutes = require('./routes/paintings');
const paymentRoutes = require('./routes/payments');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Railway's reverse proxy so secure cookies work over HTTPS
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Force HTTPS and www in production
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, 'https://' + req.hostname + req.url);
    }
    next();
  });
}

// Stripe webhook needs raw body — must come before express.json()
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), paymentRoutes.handleWebhook);

// Middleware
app.use(express.json());
app.use(cookieParser());

// Static files — no cache on HTML so updates are always served fresh
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/paintings', paintingRoutes);
app.use('/api/payments', paymentRoutes);

// Admin backup endpoint — download the SQLite database (token auth for cron jobs)
const fs = require('fs');
app.get('/api/admin/backup', (req, res) => {
  const token = req.query.token;
  const backupSecret = process.env.BACKUP_SECRET;
  if (!backupSecret || token !== backupSecret) {
    return res.status(403).json({ error: 'Invalid backup token' });
  }
  const dbPath = path.join(__dirname, 'uploads', 'marketplace.db');
  const localDbPath = path.join(__dirname, 'db', 'marketplace.db');
  const filePath = fs.existsSync(dbPath) ? dbPath : localDbPath;
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Database not found' });
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Disposition', `attachment; filename="brush-collective-backup-${date}.db"`);
  res.setHeader('Content-Type', 'application/octet-stream');
  fs.createReadStream(filePath).pipe(res);
});

// API error handler — return JSON for API routes, not HTML
app.use('/api', (err, req, res, next) => {
  console.error('API error:', err.message);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// SPA fallback — serve index.html for non-API, non-file routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start artist upload check cron (72h reminder + 96h auto-delete)
const { startArtistCron } = require('./utils/artist-cron');
startArtistCron();

// Start weekly spotlight cron (auto-select + email announcement every Monday)
const { startSpotlightCron } = require('./utils/spotlight-cron');
startSpotlightCron();

// Start "New This Week" cron (auto-post to Instagram every Friday)
const { startNewThisWeekCron } = require('./utils/new-this-week-cron');
startNewThisWeekCron();

app.listen(PORT, () => {
  console.log(`The Brush Collective running at http://localhost:${PORT}`);
});
