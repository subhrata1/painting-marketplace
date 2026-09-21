-- Users table (artists and buyers)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'buyer' CHECK(role IN ('buyer', 'artist', 'admin')),
  bio TEXT,
  profile_image TEXT,
  stripe_account_id TEXT,
  stripe_onboarded INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Paintings table
CREATE TABLE IF NOT EXISTS paintings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artist_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  style TEXT,
  medium TEXT,
  series TEXT,
  year_created TEXT,
  width_inches REAL,
  height_inches REAL,
  price_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD' CHECK(currency IN ('USD', 'EUR', 'GBP')),
  image_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available', 'sold', 'removed')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (artist_id) REFERENCES users(id)
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  painting_id INTEGER NOT NULL,
  buyer_id INTEGER NOT NULL,
  artist_id INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  platform_fee_cents INTEGER NOT NULL,
  artist_payout_cents INTEGER NOT NULL,
  stripe_payment_intent TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded')),
  shipping_name TEXT,
  shipping_address TEXT,
  shipping_city TEXT,
  shipping_state TEXT,
  shipping_zip TEXT,
  shipping_country TEXT,
  tracking_number TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (painting_id) REFERENCES paintings(id),
  FOREIGN KEY (buyer_id) REFERENCES users(id),
  FOREIGN KEY (artist_id) REFERENCES users(id)
);

-- Spotlights table (weekly featured painting)
CREATE TABLE IF NOT EXISTS spotlights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  painting_id INTEGER NOT NULL,
  message TEXT,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  auto_selected INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (painting_id) REFERENCES paintings(id)
);

-- Reviews on paintings (no login required)
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  painting_id INTEGER NOT NULL,
  name TEXT NOT NULL DEFAULT 'Anonymous',
  text TEXT NOT NULL,
  rating INTEGER NOT NULL DEFAULT 0 CHECK(rating IN (-1, 0, 1)),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (painting_id) REFERENCES paintings(id)
);

-- Reactions (thumbs up / thumbs down — tracked by fingerprint for guests)
CREATE TABLE IF NOT EXISTS reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  painting_id INTEGER NOT NULL,
  fingerprint TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('like', 'dislike')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (painting_id) REFERENCES paintings(id),
  UNIQUE(painting_id, fingerprint)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_paintings_artist ON paintings(artist_id);
CREATE INDEX IF NOT EXISTS idx_paintings_status ON paintings(status);
CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_artist ON orders(artist_id);
CREATE INDEX IF NOT EXISTS idx_spotlights_week ON spotlights(week_start, week_end);
CREATE INDEX IF NOT EXISTS idx_reviews_painting ON reviews(painting_id);
CREATE INDEX IF NOT EXISTS idx_reactions_painting ON reactions(painting_id);
