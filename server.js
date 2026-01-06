require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const morgan = require('morgan');
const cors = require('cors');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const multer = require('multer');

// Stripe
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_PUBLIC_KEY = process.env.STRIPE_PUBLIC_KEY || '';
const stripe = STRIPE_SECRET_KEY ? require('stripe')(STRIPE_SECRET_KEY) : null;

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev_secret_change_me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 } // 8 hours
}));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
// Uploads directory
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_');
    cb(null, Date.now() + '_' + safe);
  }
});
const upload = multer({ storage });

// Routes: profile
app.get('/api/profile', requireAuth, (req, res) => {
  const uid = req.session.user.id;
  const row = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(uid);
  res.json(row || {});
});

app.post('/api/profile', requireAuth, (req, res) => {
  const uid = req.session.user.id;
  const { first_name, last_name, birth_date, shipping_address, shipping_zip, billing_address, billing_zip } = req.body || {};
  const existing = db.prepare('SELECT 1 FROM user_profiles WHERE user_id = ?').get(uid);
  if (existing) {
    db.prepare(`UPDATE user_profiles SET first_name=?, last_name=?, birth_date=?, shipping_address=?, shipping_zip=?, billing_address=?, billing_zip=?, updated_at=datetime('now') WHERE user_id=?`)
      .run(first_name || null, last_name || null, birth_date || null, shipping_address || null, shipping_zip || null, billing_address || null, billing_zip || null, uid);
  } else {
    db.prepare(`INSERT INTO user_profiles (user_id, first_name, last_name, birth_date, shipping_address, shipping_zip, billing_address, billing_zip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(uid, first_name || null, last_name || null, birth_date || null, shipping_address || null, shipping_zip || null, billing_address || null, billing_zip || null);
  }
  const saved = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(uid);
  res.json({ ok: true, profile: saved });
});
// Database init
const db = new Database(path.join(__dirname, 'data.sqlite'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL,
  image_url TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user', -- 'user' | 'admin'
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id INTEGER PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  birth_date TEXT,
  shipping_address TEXT,
  shipping_zip TEXT,
  billing_address TEXT,
  billing_zip TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
`);

// Migrations: add category_id to products if missing
const productColumns = db.prepare("PRAGMA table_info(products)").all();
const hasCategoryId = productColumns.some(c => c.name === 'category_id');
if (!hasCategoryId) {
  db.prepare('ALTER TABLE products ADD COLUMN category_id INTEGER').run();
}

// Migration: add banned flag to users if missing
const userColumns = db.prepare("PRAGMA table_info(users)").all();
const hasBanned = userColumns.some(c => c.name === 'banned');
if (!hasBanned) {
  db.prepare("ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0").run();
}

// Default site name if not set
const siteNameRow = db.prepare("SELECT value FROM settings WHERE key = 'siteName'").get();
if (!siteNameRow) {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('siteName', ?)").run('Ecommercio');
}

// Seed default admin account if not exists (admin/admin)
const existingAdminUser = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!existingAdminUser) {
  const hash = bcrypt.hashSync('admin', 10);
  db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
    .run('admin', hash, 'admin');
}

// Auth middleware
function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// Auth routes (register/login/logout/session)
app.get('/api/session', (req, res) => {
  res.json({ user: req.session.user || null });
});

app.post('/api/register', (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Missing username or password' });
  if (typeof username !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'Invalid payload' });
  const normalizedRole = role === 'admin' ? 'admin' : 'user';
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return res.status(409).json({ error: 'Username already exists' });
  const anyAdmin = db.prepare("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1").get();
  const effectiveRole = anyAdmin ? normalizedRole : 'admin';
  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, hash, effectiveRole);
  const user = { id: info.lastInsertRowid, username, role: effectiveRole };
  req.session.user = user;
  res.status(201).json({ user });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Missing username or password' });
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!row) return res.status(401).json({ error: 'Invalid credentials' });
  if (row.banned) return res.status(403).json({ error: 'User is banned' });
  const ok = bcrypt.compareSync(password, row.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const user = { id: row.id, username: row.username, role: row.role };
  req.session.user = user;
  res.json({ user });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// Routes: settings
app.get('/api/settings', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
  res.json(settings);
});

app.post('/api/settings', requireAdmin, (req, res) => {
  const { siteName } = req.body;
  if (typeof siteName !== 'string' || !siteName.trim()) {
    return res.status(400).json({ error: 'Invalid siteName' });
  }
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('siteName', ?)").run(siteName.trim());
  res.set('Cache-Control', 'no-store');
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
  res.json({ ok: true, settings });
});

// Routes: categories CRUD (admin)
app.get('/api/categories', (_req, res) => {
  const items = db.prepare('SELECT * FROM categories ORDER BY name ASC').all();
  res.json(items);
});

app.post('/api/categories', requireAdmin, (req, res) => {
  const { name } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Invalid name' });
  try {
    const info = db.prepare('INSERT INTO categories (name) VALUES (?)').run(String(name).trim());
    const created = db.prepare('SELECT * FROM categories WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(created);
  } catch (e) {
    return res.status(409).json({ error: 'Category already exists' });
  }
});

app.put('/api/categories/:id', requireAdmin, (req, res) => {
  const { name } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Invalid name' });
  const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Category not found' });
  db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(String(name).trim(), req.params.id);
  const updated = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  res.json(updated);
});

app.delete('/api/categories/:id', requireAdmin, (req, res) => {
  // Set category_id to NULL for products in this category
  db.prepare('UPDATE products SET category_id = NULL WHERE category_id = ?').run(req.params.id);
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Routes: products CRUD
app.get('/api/products', (req, res) => {
  const items = db.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
  res.json(items);
});

app.get('/api/products/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Product not found' });
  res.json(item);
});

app.post('/api/products', requireAdmin, upload.single('image'), (req, res) => {
  const { title, description, price_cents, category_id } = req.body;
  if (!title || price_cents === undefined) return res.status(400).json({ error: 'Missing data' });
  const price = Number(price_cents);
  if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'Invalid price' });
  const image_url = req.file ? `/uploads/${req.file.filename}` : '';
  const catId = category_id ? Number(category_id) : null;
  const info = db.prepare('INSERT INTO products (title, description, price_cents, image_url, category_id) VALUES (?, ?, ?, ?, ?)')
    .run(title, description || '', price, image_url, catId);
  const created = db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(created);
});

app.put('/api/products/:id', requireAdmin, upload.single('image'), (req, res) => {
  const { title, description, price_cents, image_url, category_id } = req.body;
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Product not found' });
  const price = price_cents !== undefined ? Number(price_cents) : existing.price_cents;
  if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'Invalid price' });
  const newImage = req.file ? `/uploads/${req.file.filename}` : undefined;
  db.prepare('UPDATE products SET title = ?, description = ?, price_cents = ?, image_url = ?, category_id = ? WHERE id = ?')
    .run(
      title !== undefined ? title : existing.title,
      description !== undefined ? description : existing.description,
      price,
      newImage !== undefined ? newImage : (image_url !== undefined ? image_url : existing.image_url),
      category_id !== undefined ? (category_id ? Number(category_id) : null) : existing.category_id,
      req.params.id
    );
  const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  res.json(updated);
});

app.delete('/api/products/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Product not found' });
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Admin: users management
app.get('/api/admin/users', requireAdmin, (_req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.username, u.role, u.created_at, u.banned,
           p.first_name, p.last_name, p.birth_date, p.shipping_address, p.shipping_zip, p.billing_address, p.billing_zip, p.updated_at as profile_updated_at
    FROM users u
    LEFT JOIN user_profiles p ON p.user_id = u.id
    ORDER BY datetime(u.created_at) DESC
  `).all();
  // Purchases placeholder: 0 until orders support is added
  const users = rows.map(r => ({ ...r, purchases: 0 }));
  res.json(users);
});

app.post('/api/admin/users/:id/ban', requireAdmin, (req, res) => {
  const targetId = Number(req.params.id);
  const banned = req.body && (req.body.banned === true || req.body.banned === 1 || req.body.banned === '1');
  const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(targetId);
  if (!existing) return res.status(404).json({ error: 'User not found' });
  db.prepare('UPDATE users SET banned = ? WHERE id = ?').run(banned ? 1 : 0, targetId);
  const updated = db.prepare('SELECT id, username, role, created_at, banned FROM users WHERE id = ?').get(targetId);
  res.json({ ok: true, user: updated });
});

app.post('/api/admin/users/:id/role', requireAdmin, (req, res) => {
  const targetId = Number(req.params.id);
  const { role } = req.body || {};
  if (role !== 'admin' && role !== 'user') return res.status(400).json({ error: 'Invalid role' });
  const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(targetId);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === 'admin' && role === 'user') {
    const adminCount = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'admin'").get().c;
    if (adminCount <= 1) return res.status(400).json({ error: 'Cannot remove the last admin' });
  }
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, targetId);
  const updated = db.prepare('SELECT id, username, role, created_at, banned FROM users WHERE id = ?').get(targetId);
  res.json({ ok: true, user: updated });
});

// Stripe Checkout
app.post('/api/create-checkout-session', async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ error: 'Stripe is not configured. Set STRIPE_SECRET_KEY' });
    const { items } = req.body; // [{ id, quantity }]
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Cart is empty' });

    // Recupera i prodotti e costruisci line_items
    const line_items = items.map(({ id, quantity }) => {
      const p = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
      if (!p) throw new Error('Product not found: ' + id);
      return {
        price_data: {
          currency: 'eur',
          unit_amount: p.price_cents,
          product_data: { name: p.title, description: p.description || undefined },
        },
        quantity: Math.max(1, Number(quantity || 1)),
      };
    });

    const site = db.prepare("SELECT value FROM settings WHERE key = 'siteName'").get();
    const siteName = site ? site.value : 'Ecommercio';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items,
      success_url: `${req.protocol}://${req.get('host')}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.protocol}://${req.get('host')}/cancel.html`,
      metadata: { siteName }
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error creating checkout session' });
  }
});

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  if (!STRIPE_SECRET_KEY || !STRIPE_PUBLIC_KEY) {
    console.log('NOTE: Configure STRIPE_PUBLIC_KEY and STRIPE_SECRET_KEY in the .env file');
  }
});
