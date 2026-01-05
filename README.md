# 🛍️ Ecommercio – Dark themed e-commerce (Express + SQLite + Stripe)

A modern, dark-themed e-commerce with:

- Admin area (role-based) to manage products and site name.
- User registration and login. The first registered account becomes admin automatically.
- Product CRUD (create, update, delete) restricted to admin.
- Client-side cart and Stripe Checkout integration.
- SQLite database (file `data.sqlite`).

## Requirements

- Node.js 18+
- Stripe keys (optional to test payments): create an account at https://dashboard.stripe.com/

## Setup

1. Open this folder `ecommercio`.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create the `.env` from the example and edit as needed:
   ```bash
   cp .env.example .env
   ```
4. Start the dev server:
   ```bash
   npm run dev
   ```
   Or production:
   ```bash
   npm start
   ```
5. Open http://localhost:3000

## App pages

- `public/index.html`: main site with top bar (Home, Shop, About Us, Contact Us), products grid and cart.
- `public/auth.html`: Sign In / Sign Up for users and admins (first user becomes admin).
- `public/admin.html`: admin panel (login, site settings, product CRUD).
- `public/success.html`, `public/cancel.html`: post-checkout pages.

## Project structure

- `server.js`: Express server, SQLite init, REST APIs, Stripe Checkout.
- `public/styles.css`: modern dark theme.
- `public/app.js`: shop and cart logic.
- `public/admin.js`: admin panel logic.
- `public/auth.js`: authentication page logic.
- `.env.example`: environment variables example.
- `data.sqlite`: generated on first run.

## APIs

- `POST /api/register` – create account (first user becomes admin)
- `POST /api/login` – login
- `POST /api/logout` – logout
- `GET /api/session` – current session `{ user|null }`
- `GET /api/settings` – read settings (e.g., `siteName`)
- `POST /api/settings` – save settings (admin)
- `GET /api/products` – list products
- `POST /api/products` – create product (admin)
- `PUT /api/products/:id` – update product (admin)
- `DELETE /api/products/:id` – delete product (admin)
- `POST /api/create-checkout-session` – create Stripe checkout from cart items

Prices are stored in cents in the DB: `price_cents`.

## Stripe

- Set `STRIPE_SECRET_KEY` and `STRIPE_PUBLIC_KEY` in `.env` to enable checkout.
- For testing, use Stripe test cards: https://stripe.com/docs/testing

## Notes

- For production, change `SESSION_SECRET` and harden admin access.
- Product images can be public URLs. If not provided, a placeholder will be used.

Enjoy building with 🛍️ Ecommercio!
