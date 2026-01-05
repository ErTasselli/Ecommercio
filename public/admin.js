const $ = (s) => document.querySelector(s);
const fmtEUR = (cents) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR' }).format((cents || 0) / 100);

async function checkSession() {
  try {
    const res = await fetch('/api/session');
    const data = await res.json();
    if (data.user && data.user.role === 'admin') {
      $('#loginSection').classList.add('hidden');
      $('#adminSection').classList.remove('hidden');
      await loadSettings();
      await loadProducts();
    }
  } catch {}
}

async function login(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const payload = Object.fromEntries(fd.entries());
  const msg = $('#loginMsg');
  msg.textContent = 'Signing in...';
  try {
    const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (res.ok) {
      const d = await res.json();
      if (d.user && d.user.role === 'admin') {
        msg.textContent = '✅ Signed in';
        $('#loginSection').classList.add('hidden');
        $('#adminSection').classList.remove('hidden');
        await loadSettings();
        await loadProducts();
      } else {
        msg.textContent = '❌ This account is not an admin';
      }
    } else {
      const d = await res.json();
      msg.textContent = `❌ ${d.error || 'Error'}`;
    }
  } catch {
    msg.textContent = '❌ Network error';
  }
}

async function logout() {
  await fetch('/api/logout', { method: 'POST' });
  location.reload();
}

async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (data.siteName) $('#siteNameInput').value = data.siteName;
  } catch {}
}

async function saveSettings(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const siteName = fd.get('siteName');
  const msg = $('#settingsMsg');
  msg.textContent = 'Saving...';
  try {
    const res = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteName }) });
    if (res.ok) msg.textContent = '✅ Saved'; else msg.textContent = '❌ Save error';
  } catch { msg.textContent = '❌ Network error'; }
}

async function loadProducts() {
  const box = $('#adminProducts');
  box.innerHTML = '<div class="msg">Loading products...</div>';
  try {
    const res = await fetch('/api/products');
    const items = await res.json();
    if (!Array.isArray(items) || !items.length) {
      box.innerHTML = '<div class="msg">No products yet. Create one on the left ➕</div>';
      return;
    }
    box.innerHTML = items.map(p => `
      <div class="inline">
        <input type="text" value="${escapeHtml(p.title)}" data-field="title" data-id="${p.id}">
        <input class="price-eur" type="number" step="0.01" value="${(p.price_cents/100).toFixed(2)}" data-field="price">
        <input type="text" value="${escapeHtml(p.image_url || '')}" data-field="image_url">
        <div class="actions">
          <button class="btn success" data-save="${p.id}">💾</button>
          <button class="btn danger" data-del="${p.id}">🗑️</button>
        </div>
        <input type="text" value="${escapeHtml(p.description || '')}" data-field="description" placeholder="Description" style="grid-column: 1 / -1;">
      </div>
    `).join('');

    box.querySelectorAll('[data-save]').forEach(btn => btn.addEventListener('click', () => saveProduct(btn)));
    box.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', () => delProduct(btn)));
  } catch (e) {
    console.error(e);
    box.innerHTML = '<div class="msg">Error while loading</div>';
  }
}

async function saveProduct(btn) {
  const id = Number(btn.getAttribute('data-save'));
  const parent = btn.closest('.inline');
  const inputs = parent.querySelectorAll('input[data-field]');
  const payload = { };
  inputs.forEach(inp => {
    const f = inp.getAttribute('data-field');
    if (f === 'price') payload.price_cents = Math.round(Number(inp.value || 0) * 100);
    else payload[f] = inp.value;
  });
  const res = await fetch(`/api/products/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) alert('Save error');
}

async function delProduct(btn) {
  const id = Number(btn.getAttribute('data-del'));
  if (!confirm('Delete this product?')) return;
  const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
  if (res.ok) loadProducts(); else alert('Delete error');
}

async function createProduct(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const title = fd.get('title');
  const description = fd.get('description') || '';
  const price_cents = Math.round(Number(fd.get('price') || 0) * 100);
  const image_url = fd.get('image_url') || '';
  const msg = $('#createMsg');
  msg.textContent = 'Creating...';
  try {
    const res = await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, description, price_cents, image_url }) });
    if (res.ok) {
      e.target.reset();
      msg.textContent = '✅ Created';
      loadProducts();
    } else {
      const d = await res.json();
      msg.textContent = `❌ ${d.error || 'Error'}`;
    }
  } catch {
    msg.textContent = '❌ Network error';
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"]+/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s]));
}

// Bind events
window.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.querySelector('#loginForm');
  if (loginForm) loginForm.addEventListener('submit', login);
  const logoutBtn = document.querySelector('#logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);
  const settingsForm = document.querySelector('#settingsForm');
  if (settingsForm) settingsForm.addEventListener('submit', saveSettings);
  const createForm = document.querySelector('#createForm');
  if (createForm) createForm.addEventListener('submit', createProduct);
  checkSession();
});
