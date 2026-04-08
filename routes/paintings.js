const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Configure file upload
const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads'),
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

// List paintings (public)
router.get('/', (req, res) => {
  const { style, search, artist_id, limit = 50, offset = 0 } = req.query;
  let sql = `SELECT p.*, u.name as artist_name FROM paintings p JOIN users u ON p.artist_id = u.id WHERE p.status = 'available'`;
  const params = [];

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
  const total = db.prepare('SELECT COUNT(*) as count FROM paintings WHERE status = ?').get('available').count;
  res.json({ paintings, total });
});

// Get single painting (public)
router.get('/:id', (req, res) => {
  const painting = db.prepare(
    `SELECT p.*, u.name as artist_name, u.bio as artist_bio
     FROM paintings p JOIN users u ON p.artist_id = u.id
     WHERE p.id = ?`
  ).get(req.params.id);

  if (!painting) return res.status(404).json({ error: 'Painting not found' });
  res.json({ painting });
});

// Upload painting (artists only)
router.post('/', authenticateToken, requireRole('artist', 'admin'), upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Image is required' });

  const { title, description, style, medium, year_created, width_inches, height_inches, price } = req.body;
  if (!title || !price) return res.status(400).json({ error: 'Title and price are required' });

  const priceCents = Math.round(parseFloat(price) * 100);
  if (priceCents < 100) return res.status(400).json({ error: 'Minimum price is $1.00' });

  const result = db.prepare(
    `INSERT INTO paintings (artist_id, title, description, style, medium, year_created, width_inches, height_inches, price_cents, image_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    req.user.id, title, description || null, style || null, medium || null,
    year_created || null, width_inches || null, height_inches || null,
    priceCents, '/uploads/' + req.file.filename
  );

  res.status(201).json({ id: result.lastInsertRowid });
});

// Update painting (owner only)
router.put('/:id', authenticateToken, (req, res) => {
  const painting = db.prepare('SELECT * FROM paintings WHERE id = ?').get(req.params.id);
  if (!painting) return res.status(404).json({ error: 'Painting not found' });
  if (painting.artist_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const { title, description, style, medium, price, status } = req.body;
  const priceCents = price ? Math.round(parseFloat(price) * 100) : null;

  db.prepare(
    `UPDATE paintings SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      style = COALESCE(?, style),
      medium = COALESCE(?, medium),
      price_cents = COALESCE(?, price_cents),
      status = COALESCE(?, status),
      updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(title || null, description || null, style || null, medium || null, priceCents, status || null, req.params.id);

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

// Get my paintings (artist dashboard)
router.get('/artist/mine', authenticateToken, requireRole('artist', 'admin'), (req, res) => {
  const paintings = db.prepare(
    'SELECT * FROM paintings WHERE artist_id = ? AND status != ? ORDER BY created_at DESC'
  ).all(req.user.id, 'removed');
  res.json({ paintings });
});

// Get styles for filtering
router.get('/meta/styles', (_req, res) => {
  const rows = db.prepare("SELECT DISTINCT style FROM paintings WHERE style IS NOT NULL AND status = 'available' ORDER BY style").all();
  res.json({ styles: rows.map(r => r.style) });
});

module.exports = router;
