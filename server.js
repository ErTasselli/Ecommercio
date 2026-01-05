require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const morgan = require('morgan');
const cors = require('cors');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

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
`);

// Default site name if not set
const siteNameRow = db.prepare("SELECT value FROM settings WHERE key = 'siteName'").get();
if (!siteNameRow) {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('siteName', ?)").run('🛍️ Ecommercio');
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
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
  res.json(settings);
});

app.post('/api/settings', requireAdmin, (req, res) => {
  const { siteName } = req.body;
  if (typeof siteName !== 'string' || !siteName.trim()) {
    return res.status(400).json({ error: 'Invalid siteName' });
  }
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES ("siteName", ?)').run(siteName.trim());
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

app.post('/api/products', requireAdmin, (req, res) => {
  const { title, description, price_cents, image_url } = req.body;
  if (!title || price_cents === undefined) return res.status(400).json({ error: 'Missing data' });
  const price = Number(price_cents);
  if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'Invalid price' });
  const info = db.prepare('INSERT INTO products (title, description, price_cents, image_url) VALUES (?, ?, ?, ?)')
    .run(title, description || '', price, image_url || '');
  const created = db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(created);
});

app.put('/api/products/:id', requireAdmin, (req, res) => {
  const { title, description, price_cents, image_url } = req.body;
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Product not found' });
  const price = price_cents !== undefined ? Number(price_cents) : existing.price_cents;
  if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'Invalid price' });
  db.prepare('UPDATE products SET title = ?, description = ?, price_cents = ?, image_url = ? WHERE id = ?')
    .run(
      title !== undefined ? title : existing.title,
      description !== undefined ? description : existing.description,
      price,
      image_url !== undefined ? image_url : existing.image_url,
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
