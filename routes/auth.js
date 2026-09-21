const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { moderateImage } = require('../middleware/moderation');

const uploadsDir = path.join(__dirname, '..', 'uploads');

const profileStorage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, 'profile-' + crypto.randomUUID() + ext);
  }
});
const profileUpload = multer({
  storage: profileStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  }
});

// Painting image upload config (for artist registration)
const paintingStorage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, crypto.randomUUID() + ext);
  }
});
const paintingUpload = multer({
  storage: paintingStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  }
});

const { sendWelcomeEmail, sendAdminNewArtistNotice } = require('../utils/mailer');

const router = express.Router();

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 7 * 86400000,
};

// Register
router.post('/register', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const { password, name, role } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password, and name are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  // Artists must register via /register-artist (includes required painting upload)
  if (role === 'artist') {
    return res.status(400).json({ error: 'Artists must register with at least one painting. Please use the artist sign-up form.' });
  }

  // Admin email gets admin role, otherwise buyer
  const adminEmail = process.env.ADMIN_EMAIL;
  let allowedRole;
  if (adminEmail && email.toLowerCase() === adminEmail.toLowerCase()) {
    allowedRole = 'admin';
  } else {
    allowedRole = 'buyer';
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  const hash = bcrypt.hashSync(password, 12);
  const result = db.prepare(
    'INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)'
  ).run(email, hash, name, allowedRole);

  const token = jwt.sign(
    { id: result.lastInsertRowid, email, name, role: allowedRole },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.cookie('token', token, COOKIE_OPTS);
  res.json({ user: { id: result.lastInsertRowid, email, name, role: allowedRole } });
});

// Register artist with required first painting
router.post('/register-artist', (req, res, next) => {
  paintingUpload.single('painting_image')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Image must be under 10MB' });
      return res.status(400).json({ error: 'Upload failed: ' + err.message });
    }
    next();
  });
}, async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const { password, name, painting_title, painting_price, painting_currency } = req.body;

  // Validate user fields
  if (!email || !password || !name) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'Email, password, and name are required' });
  }
  if (password.length < 8) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  // Validate painting fields
  if (!req.file) {
    return res.status(400).json({ error: 'Please upload an image of your first painting' });
  }
  if (!painting_title || !painting_title.trim()) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'Please enter a title for your painting' });
  }
  if (!painting_price || isNaN(parseFloat(painting_price)) || parseFloat(painting_price) <= 0) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'Please enter a valid price for your painting' });
  }

  // Check for duplicate email
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    fs.unlink(req.file.path, () => {});
    return res.status(409).json({ error: 'Email already registered' });
  }

  // AI content moderation
  try {
    const result = await moderateImage(req.file.path);
    if (!result.safe) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: result.reason });
    }
  } catch (err) {
    console.error('[MODERATION] Check failed during registration:', err.message);
    // Allow if moderation fails — don't block artist signup due to AI errors
  }

  // Determine role
  const adminEmail = process.env.ADMIN_EMAIL;
  let allowedRole = 'artist';
  if (adminEmail && email.toLowerCase() === adminEmail.toLowerCase()) {
    allowedRole = 'admin';
  }

  // Create user + painting atomically
  const priceCents = Math.round(parseFloat(painting_price) * 100);
  if (priceCents < 100) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'Minimum price is 1.00' });
  }
  const validCurrency = ['USD', 'EUR', 'GBP'].includes(painting_currency) ? painting_currency : 'USD';
  const hash = bcrypt.hashSync(password, 12);

  const transaction = db.transaction(() => {
    const userResult = db.prepare(
      'INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)'
    ).run(email, hash, name, allowedRole);

    const paintingResult = db.prepare(
      `INSERT INTO paintings (artist_id, title, price_cents, currency, image_path, status)
       VALUES (?, ?, ?, ?, ?, 'available')`
    ).run(userResult.lastInsertRowid, painting_title.trim(), priceCents, validCurrency, '/uploads/' + req.file.filename);

    return { userId: userResult.lastInsertRowid, paintingId: paintingResult.lastInsertRowid };
  });

  let result;
  try {
    result = transaction();
  } catch (e) {
    fs.unlink(req.file.path, () => {});
    console.error('[REGISTER-ARTIST] Transaction failed:', e.message);
    return res.status(500).json({ error: 'Registration failed. Please try again.' });
  }

  const token = jwt.sign(
    { id: result.userId, email, name, role: allowedRole },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.cookie('token', token, COOKIE_OPTS);
  res.json({
    user: { id: result.userId, email, name, role: allowedRole },
    painting: { id: result.paintingId }
  });

  // Send welcome email + admin notification (async, don't block response)
  sendWelcomeEmail(email, name)
    .then(() => console.log('[MAIL] Welcome email sent to', email))
    .catch(e => console.error('[MAIL] Welcome email FAILED for', email, ':', e.message));
  sendAdminNewArtistNotice(email, name)
    .then(() => console.log('[MAIL] Admin notification sent for', email))
    .catch(e => console.error('[MAIL] Admin notification FAILED:', e.message));
});

// Login
router.post('/login', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = (req.body.password || '');
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.cookie('token', token, COOKIE_OPTS);
  res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});

// Logout
router.post('/logout', (_req, res) => {
  res.clearCookie('token', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
  res.json({ ok: true });
});

// Get current user
router.get('/me', authenticateToken, (req, res) => {
  const user = db.prepare('SELECT id, email, name, role, bio, profile_image, instagram_url, stripe_onboarded, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

// Update profile
router.put('/me', authenticateToken, (req, res) => {
  const { name, bio, instagram_url } = req.body;
  db.prepare('UPDATE users SET name = COALESCE(?, name), bio = COALESCE(?, bio), instagram_url = COALESCE(?, instagram_url), updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(name || null, bio || null, instagram_url !== undefined ? instagram_url : null, req.user.id);
  res.json({ ok: true });
});

// Upload profile image
router.post('/me/photo', authenticateToken, profileUpload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Please select an image' });
  const imagePath = '/uploads/' + req.file.filename;
  db.prepare('UPDATE users SET profile_image = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(imagePath, req.user.id);
  res.json({ profile_image: imagePath });
});

// Delete own account
router.delete('/me', authenticateToken, (req, res) => {
  const userId = req.user.id;

  // Prevent admin from deleting themselves
  if (req.user.role === 'admin') {
    return res.status(403).json({ error: 'Admin accounts cannot be self-deleted' });
  }

  // Temporarily disable FK checks so we can delete in any order
  db.pragma('foreign_keys = OFF');
  try {
    db.prepare('DELETE FROM orders WHERE painting_id IN (SELECT id FROM paintings WHERE artist_id = ?) OR artist_id = ? OR buyer_id = ?').run(userId, userId, userId);
    db.prepare('DELETE FROM paintings WHERE artist_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  } finally {
    db.pragma('foreign_keys = ON');
  }

  // Clear auth cookie
  res.clearCookie('token', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
  res.json({ ok: true });
});

// Public: list artists with paintings
router.get('/public/artists', (_req, res) => {
  const artists = db.prepare(
    `SELECT u.id, u.name, u.bio, u.profile_image,
      (SELECT COUNT(*) FROM paintings WHERE artist_id = u.id AND status IN ('available', 'sold')) as painting_count,
      (SELECT image_path FROM paintings WHERE artist_id = u.id AND status IN ('available', 'sold') ORDER BY created_at DESC LIMIT 1) as latest_image
     FROM users u
     WHERE u.role IN ('artist', 'admin')
       AND (SELECT COUNT(*) FROM paintings WHERE artist_id = u.id AND status IN ('available', 'sold')) > 0
     ORDER BY painting_count DESC`
  ).all();
  res.json({ artists });
});

// Public: get single artist profile
router.get('/public/artists/:id', (_req, res) => {
  const artist = db.prepare(
    'SELECT id, name, bio, profile_image, instagram_url FROM users WHERE id = ? AND role IN (\'artist\', \'admin\')'
  ).get(_req.params.id);
  if (!artist) return res.status(404).json({ error: 'Artist not found' });
  res.json({ artist });
});

// Admin: list all artists
router.get('/artists', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const artists = db.prepare(
    `SELECT id, email, name, role, bio, stripe_onboarded, created_at,
      (SELECT COUNT(*) FROM paintings WHERE artist_id = users.id AND status != 'removed') as painting_count,
      (SELECT COUNT(*) FROM paintings WHERE artist_id = users.id AND status = 'sold') as sold_count
     FROM users WHERE role IN ('artist', 'admin') ORDER BY created_at DESC`
  ).all();
  res.json({ artists });
});

// Admin: update artist instagram URL
router.put('/artists/:id/instagram', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { instagram_url } = req.body;
  db.prepare('UPDATE users SET instagram_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(instagram_url || null, req.params.id);
  res.json({ ok: true });
});

// Admin: list all users
router.get('/users', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const users = db.prepare(
    'SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC'
  ).all();
  res.json({ users });
});

// Admin: resend welcome email to an artist
router.post('/users/:id/resend-welcome', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  const user = db.prepare('SELECT id, email, name, role FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role !== 'artist' && user.role !== 'admin') {
    return res.status(400).json({ error: 'Can only send welcome emails to artists' });
  }

  try {
    await sendWelcomeEmail(user.email, user.name);
    console.log('[MAIL] Welcome email resent to', user.email, '(triggered by admin)');
    res.json({ ok: true, message: `Welcome email sent to ${user.email}` });
  } catch (e) {
    console.error('[MAIL] Resend welcome email FAILED for', user.email, ':', e.message);
    res.status(500).json({ error: 'Failed to send email: ' + e.message });
  }
});

// Admin: delete a user account
router.delete('/users/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  const targetId = Number(req.params.id);

  // Prevent deleting yourself
  if (targetId === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own admin account from here' });
  }

  const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(targetId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Temporarily disable FK checks so we can delete in any order
  db.pragma('foreign_keys = OFF');
  try {
    db.prepare('DELETE FROM orders WHERE painting_id IN (SELECT id FROM paintings WHERE artist_id = ?) OR artist_id = ? OR buyer_id = ?').run(targetId, targetId, targetId);
    db.prepare('DELETE FROM paintings WHERE artist_id = ?').run(targetId);
    db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
  } finally {
    db.pragma('foreign_keys = ON');
  }

  res.json({ ok: true });
});

module.exports = router;
