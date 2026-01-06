// Simple checkout page rendering and Stripe Checkout Session creation
const fmtEUR = (cents) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR' }).format((cents || 0) / 100);
const $ = (s) => document.querySelector(s);

const CART_KEY = 'cart_items_v1';
function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; }
}

function render() {
  const items = getCart();
  const list = $('#checkoutItems');
  const totalEl = $('#checkoutTotal');
  if (!items.length) {
    list.innerHTML = '<div class="msg">Your cart is empty.</div>';
    totalEl.textContent = fmtEUR(0);
    return;
  }
  list.innerHTML = items.map(i => `
    <div class="row">
      <div>
        <div><strong>${i.title}</strong></div>
        <div class="muted">${fmtEUR(i.price_cents)} × ${i.quantity}</div>
      </div>
      <div><strong>${fmtEUR(i.price_cents * i.quantity)}</strong></div>
    </div>
  `).join('');
  const total = items.reduce((s, it) => s + it.price_cents * it.quantity, 0);
  totalEl.textContent = fmtEUR(total);
}

async function pay() {
  const btn = $('#payBtn');
  const msg = $('#checkoutMsg');
  const items = getCart().map(i => ({ id: i.id, quantity: i.quantity }));
  if (!items.length) { msg.textContent = 'Cart is empty'; return; }
  btn.disabled = true; msg.textContent = 'Creating checkout session...';
  try {
    const res = await fetch('/api/create-checkout-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) });
    const data = await res.json();
    if (res.ok && data.url) {
      window.location.href = data.url;
    } else {
      msg.textContent = `❌ ${data.error || 'Error creating session'}`;
      btn.disabled = false;
    }
  } catch (e) {
    msg.textContent = '❌ Network error';
    btn.disabled = false;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  render();
  $('#payBtn').addEventListener('click', pay);
});
