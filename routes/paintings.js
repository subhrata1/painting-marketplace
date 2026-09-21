const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { moderateImage } = require('../middleware/moderation');
const { postToInstagram, buildSpotlightCaption } = require('../utils/instagram');

const fs = require('fs');
const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure file upload
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, crypto.randomUUID() + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

// --- Specific routes MUST come before /:id wildcard ---

// Get my paintings (artist dashboard)
router.get('/artist/mine', authenticateToken, requireRole('artist', 'admin'), (req, res) => {
  const paintings = db.prepare(
    'SELECT * FROM paintings WHERE artist_id = ? AND status != ? ORDER BY created_at DESC'
  ).all(req.user.id, 'removed');
  res.json({ paintings });
});

// Admin: get all paintings across all artists
router.get('/admin/all', authenticateToken, requireRole('admin'), (req, res) => {
  const paintings = db.prepare(
    `SELECT p.*, u.name as artist_name, u.email as artist_email
     FROM paintings p JOIN users u ON p.artist_id = u.id
     WHERE p.status != 'removed'
     ORDER BY p.created_at DESC`
  ).all();
  res.json({ paintings });
});

// Get paintings added this week (public)
router.get('/new-this-week', (_req, res) => {
  const paintings = db.prepare(`
    SELECT p.*, u.name as artist_name, u.id as artist_id
    FROM paintings p
    JOIN users u ON p.artist_id = u.id
    WHERE p.status IN ('available', 'sold')
      AND p.created_at >= date('now', '-7 days')
    ORDER BY p.created_at DESC
  `).all();
  res.json({ paintings });
});

// Get styles for filtering
router.get('/meta/styles', (_req, res) => {
  const rows = db.prepare("SELECT DISTINCT style FROM paintings WHERE style IS NOT NULL AND status = 'available' ORDER BY style").all();
  res.json({ styles: rows.map(r => r.style) });
});

// Get current spotlight (public)
router.get('/spotlight', (_req, res) => {
  const spotlight = db.prepare(`
    SELECT s.*, p.title, p.description, p.style, p.medium, p.price_cents, p.currency,
           p.image_path, p.status as painting_status, p.year_created,
           p.width_inches, p.height_inches, u.name as artist_name, u.id as artist_id
    FROM spotlights s
    JOIN paintings p ON s.painting_id = p.id
    JOIN users u ON p.artist_id = u.id
    WHERE date('now') BETWEEN s.week_start AND s.week_end
      AND p.status IN ('available', 'sold')
    ORDER BY s.created_at DESC LIMIT 1
  `).get();
  res.json({ spotlight: spotlight || null });
});

// Admin: set spotlight manually
router.post('/spotlight', authenticateToken, requireRole('admin'), (req, res) => {
  const { painting_id, message, skip_instagram } = req.body;
  if (!painting_id) return res.status(400).json({ error: 'painting_id is required' });

  const painting = db.prepare('SELECT * FROM paintings WHERE id = ? AND status IN (\'available\', \'sold\')').get(painting_id);
  if (!painting) return res.status(404).json({ error: 'Painting not found or not available' });

  const artist = db.prepare('SELECT name FROM users WHERE id = ?').get(painting.artist_id);

  // Current week: Monday to Sunday
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const weekStart = monday.toISOString().slice(0, 10);
  const weekEnd = sunday.toISOString().slice(0, 10);

  // Remove existing spotlight for this week
  db.prepare('DELETE FROM spotlights WHERE week_start = ?').run(weekStart);

  db.prepare(
    'INSERT INTO spotlights (painting_id, message, week_start, week_end, auto_selected) VALUES (?, ?, ?, ?, 0)'
  ).run(painting_id, message || null, weekStart, weekEnd);

  // Auto-post to Instagram (async, don't block response)
  if (!skip_instagram) {
    const domain = process.env.DOMAIN || 'https://thebrushcollective.com';
    const imageUrl = domain + painting.image_path;
    const caption = buildSpotlightCaption(painting, artist ? artist.name : 'Unknown Artist', message);

    postToInstagram(imageUrl, caption)
      .then(postId => {
        if (postId) console.log('[SPOTLIGHT] Instagram post published:', postId);
      })
      .catch(e => console.error('[SPOTLIGHT] Instagram post failed:', e.message));
  }

  res.json({ ok: true, weekStart, weekEnd });
});

// --- General routes ---

// List paintings (public) — supports status filter: available, sold, or both
router.get('/', (req, res) => {
  const { style, search, artist_id, status, limit = 50, offset = 0 } = req.query;
  const allowedStatuses = ['available', 'sold'];
  const statusFilter = allowedStatuses.includes(status) ? status : null;

  let sql = `SELECT p.*, u.name as artist_name FROM paintings p JOIN users u ON p.artist_id = u.id WHERE p.status IN ('available', 'sold')`;
  const params = [];

  if (statusFilter) { sql += ' AND p.status = ?'; params.push(statusFilter); }
  if (style) { sql += ' AND p.style = ?'; params.push(style); }
  if (artist_id) { sql += ' AND p.artist_id = ?'; params.push(artist_id); }
  if (search) {
    sql += ' AND (p.title LIKE ? OR p.description LIKE ? OR u.name LIKE ?)';
    const q = `%${search}%`;
    params.push(q, q, q);
  }

  sql += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const paintings = db.prepare(sql).all(...params);
  const availableCount = db.prepare("SELECT COUNT(*) as count FROM paintings WHERE status = 'available'").get().count;
  const soldCount = db.prepare("SELECT COUNT(*) as count FROM paintings WHERE status = 'sold'").get().count;
  res.json({ paintings, availableCount, soldCount });
});

// Upload painting (artists only)
router.post('/', authenticateToken, requireRole('artist', 'admin'), (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      console.error('Upload error:', err.message);
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Image must be under 10MB' });
      return res.status(400).json({ error: 'Upload failed: ' + err.message });
    }
    next();
  });
}, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Image is required' });

  // AI content moderation — check image before allowing upload
  try {
    const result = await moderateImage(req.file.path);
    console.log('Moderation scores:', JSON.stringify(result.scores));
    if (!result.safe) {
      // Delete the rejected file
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: result.reason });
    }
  } catch (err) {
    console.error('Moderation check failed:', err.message);
    // Allow upload if moderation fails (don't block artists due to AI errors)
  }

  const { title, description, style, medium, year_created, width_inches, height_inches, price, currency, listing_status } = req.body;
  if (!title || !price) return res.status(400).json({ error: 'Title and price are required' });

  const priceCents = Math.round(parseFloat(price) * 100);
  if (priceCents < 100) return res.status(400).json({ error: 'Minimum price is $1.00' });

  const validCurrency = ['USD', 'EUR', 'GBP'].includes(currency) ? currency : 'USD';
  const status = listing_status === 'sold' ? 'sold' : 'available';

  const result = db.prepare(
    `INSERT INTO paintings (artist_id, title, description, style, medium, year_created, width_inches, height_inches, price_cents, currency, image_path, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    req.user.id, title, description || null, style || null, medium || null,
    year_created || null, width_inches || null, height_inches || null,
    priceCents, validCurrency, '/uploads/' + req.file.filename, status
  );

  res.status(201).json({ id: result.lastInsertRowid });
});

// --- Reviews (no login required) ---

// Get reviews for a painting
router.get('/:id/reviews', (req, res) => {
  const reviews = db.prepare(
    'SELECT * FROM reviews WHERE painting_id = ? ORDER BY created_at DESC'
  ).all(req.params.id);
  res.json({ reviews });
});

// Post a review (no login required)
router.post('/:id/reviews', (req, res) => {
  const { name, text, rating } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Review text is required' });

  const painting = db.prepare('SELECT id FROM paintings WHERE id = ?').get(req.params.id);
  if (!painting) return res.status(404).json({ error: 'Painting not found' });

  const cleanName = (name && name.trim()) ? name.trim() : 'Anonymous';
  const cleanRating = [-1, 0, 1].includes(Number(rating)) ? Number(rating) : 0;

  const result = db.prepare(
    'INSERT INTO reviews (painting_id, name, text, rating) VALUES (?, ?, ?, ?)'
  ).run(req.params.id, cleanName, text.trim(), cleanRating);

  res.status(201).json({ id: result.lastInsertRowid });
});

// Delete a review (admin only)
router.delete('/:id/reviews/:reviewId', authenticateToken, requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM reviews WHERE id = ? AND painting_id = ?').run(req.params.reviewId, req.params.id);
  res.json({ ok: true });
});

// --- Reactions (thumbs up / thumbs down, no login required) ---

// Get reaction counts for a painting
router.get('/:id/reactions', (req, res) => {
  const likes = db.prepare("SELECT COUNT(*) as count FROM reactions WHERE painting_id = ? AND type = 'like'").get(req.params.id).count;
  const dislikes = db.prepare("SELECT COUNT(*) as count FROM reactions WHERE painting_id = ? AND type = 'dislike'").get(req.params.id).count;
  const fp = req.query.fp;
  let userReaction = null;
  if (fp) {
    const row = db.prepare('SELECT type FROM reactions WHERE painting_id = ? AND fingerprint = ?').get(req.params.id, fp);
    if (row) userReaction = row.type;
  }
  res.json({ likes, dislikes, userReaction });
});

// Toggle reaction (no login required — uses fingerprint)
router.post('/:id/reactions', (req, res) => {
  const { type, fingerprint } = req.body;
  if (!fingerprint) return res.status(400).json({ error: 'Fingerprint is required' });
  if (!['like', 'dislike'].includes(type)) return res.status(400).json({ error: 'Type must be like or dislike' });

  const painting = db.prepare('SELECT id FROM paintings WHERE id = ?').get(req.params.id);
  if (!painting) return res.status(404).json({ error: 'Painting not found' });

  const existing = db.prepare('SELECT * FROM reactions WHERE painting_id = ? AND fingerprint = ?').get(req.params.id, fingerprint);

  if (existing) {
    if (existing.type === type) {
      // Same reaction — remove it (toggle off)
      db.prepare('DELETE FROM reactions WHERE id = ?').run(existing.id);
    } else {
      // Different reaction — switch it
      db.prepare('UPDATE reactions SET type = ? WHERE id = ?').run(type, existing.id);
    }
  } else {
    // New reaction
    db.prepare('INSERT INTO reactions (painting_id, fingerprint, type) VALUES (?, ?, ?)').run(req.params.id, fingerprint, type);
  }

  // Return updated counts
  const likes = db.prepare("SELECT COUNT(*) as count FROM reactions WHERE painting_id = ? AND type = 'like'").get(req.params.id).count;
  const dislikes = db.prepare("SELECT COUNT(*) as count FROM reactions WHERE painting_id = ? AND type = 'dislike'").get(req.params.id).count;
  const row = db.prepare('SELECT type FROM reactions WHERE painting_id = ? AND fingerprint = ?').get(req.params.id, fingerprint);
  res.json({ likes, dislikes, userReaction: row ? row.type : null });
});

// Get single painting (public) — MUST be last GET route
router.get('/:id', (req, res) => {
  const painting = db.prepare(
    `SELECT p.*, u.name as artist_name, u.bio as artist_bio
     FROM paintings p JOIN users u ON p.artist_id = u.id
     WHERE p.id = ?`
  ).get(req.params.id);

  if (!painting) return res.status(404).json({ error: 'Painting not found' });
  res.json({ painting });
});

// Update painting (owner only)
router.put('/:id', authenticateToken, (req, res) => {
  const painting = db.prepare('SELECT * FROM paintings WHERE id = ?').get(req.params.id);
  if (!painting) return res.status(404).json({ error: 'Painting not found' });
  if (painting.artist_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const { title, description, style, medium, price, currency, year_created, width_inches, height_inches, status } = req.body;

  const updatedTitle = title || painting.title;
  const updatedDesc = description !== undefined ? description : painting.description;
  const updatedStyle = style !== undefined ? style : painting.style;
  const updatedMedium = medium !== undefined ? medium : painting.medium;
  const updatedYear = year_created !== undefined ? year_created : painting.year_created;
  const updatedWidth = width_inches !== undefined && width_inches !== null ? width_inches : painting.width_inches;
  const updatedHeight = height_inches !== undefined && height_inches !== null ? height_inches : painting.height_inches;
  const updatedPrice = price ? Math.round(parseFloat(price) * 100) : painting.price_cents;
  const updatedCurrency = ['USD', 'EUR', 'GBP'].includes(currency) ? currency : painting.currency;
  const updatedStatus = status || painting.status;

  db.prepare(
    `UPDATE paintings SET
      title = ?, description = ?, style = ?, medium = ?,
      year_created = ?, width_inches = ?, height_inches = ?,
      price_cents = ?, currency = ?, status = ?,
      updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(updatedTitle, updatedDesc || null, updatedStyle || null, updatedMedium || null,
    updatedYear || null, updatedWidth || null, updatedHeight || null,
    updatedPrice, updatedCurrency, updatedStatus, req.params.id);

  res.json({ ok: true });
});

// Delete (remove) painting
router.delete('/:id', authenticateToken, (req, res) => {
  const painting = db.prepare('SELECT * FROM paintings WHERE id = ?').get(req.params.id);
  if (!painting) return res.status(404).json({ error: 'Painting not found' });
  if (painting.artist_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized' });
  }

  db.prepare("UPDATE paintings SET status = 'removed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
