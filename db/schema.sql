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
  year_created TEXT,
  width_inches REAL,
  height_inches REAL,
  price_cents INTEGER NOT NULL,
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_paintings_artist ON paintings(artist_id);
CREATE INDEX IF NOT EXISTS idx_paintings_status ON paintings(status);
CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_artist ON orders(artist_id);
