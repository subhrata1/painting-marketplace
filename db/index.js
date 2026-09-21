const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Use persistent volume path in production, local path in dev
const uploadsDir = path.join(__dirname, '..', 'uploads');
const dbPath = process.env.NODE_ENV === 'production'
  ? path.join(uploadsDir, 'marketplace.db')
  : path.join(__dirname, 'marketplace.db');
const schemaPath = path.join(__dirname, 'schema.sql');

// Create DB and apply schema if needed
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(schemaPath, 'utf8');
db.exec(schema);

// Migrations — add columns that may not exist in older databases
const migrations = [
  `ALTER TABLE paintings ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD' CHECK(currency IN ('USD', 'EUR', 'GBP'))`,
  `ALTER TABLE users ADD COLUMN reminder_sent INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN instagram_url TEXT`,
];

// Table migrations — create tables that may not exist in older databases
const tableMigrations = [
  `CREATE TABLE IF NOT EXISTS spotlights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    painting_id INTEGER NOT NULL,
    message TEXT,
    week_start DATE NOT NULL,
    week_end DATE NOT NULL,
    auto_selected INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (painting_id) REFERENCES paintings(id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_spotlights_week ON spotlights(week_start, week_end)`,
  `CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    painting_id INTEGER NOT NULL,
    name TEXT NOT NULL DEFAULT 'Anonymous',
    text TEXT NOT NULL,
    rating INTEGER NOT NULL DEFAULT 0 CHECK(rating IN (-1, 0, 1)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (painting_id) REFERENCES paintings(id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_reviews_painting ON reviews(painting_id)`,
  `CREATE TABLE IF NOT EXISTS reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    painting_id INTEGER NOT NULL,
    fingerprint TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('like', 'dislike')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (painting_id) REFERENCES paintings(id),
    UNIQUE(painting_id, fingerprint)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_reactions_painting ON reactions(painting_id)`,
];

for (const sql of migrations) {
  try { db.exec(sql); } catch (e) {
    // Ignore "duplicate column" errors — means migration already ran
    if (!e.message.includes('duplicate column')) throw e;
  }
}

for (const sql of tableMigrations) {
  try { db.exec(sql); } catch (e) {
    console.error('Table migration error:', e.message);
  }
}

// Seed artist Instagram URLs
const instagramSeeds = [
  { id: 2, url: 'https://www.instagram.com/subu_951_patel/' },
];
for (const seed of instagramSeeds) {
  db.prepare('UPDATE users SET instagram_url = ? WHERE id = ? AND instagram_url IS NULL').run(seed.url, seed.id);
}

module.exports = db;
