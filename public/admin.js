const $ = (s) => document.querySelector(s);
const fmtEUR = (cents) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR' }).format((cents || 0) / 100);
let CATEGORIES = [];

async function checkSession() {
  try {
    const res = await fetch('/api/session');
    const data = await res.json();
    if (data.user && data.user.role === 'admin') {
      $('#loginSection').classList.add('hidden');
      $('#adminSection').classList.remove('hidden');
      await loadSettings();
      await loadCategories();
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
    if (res.ok) {
      msg.textContent = '✅ Saved';
      // Reload settings to reflect the current value in the input
      loadSettings();
    } else {
      msg.textContent = '❌ Save error';
    }
  } catch { msg.textContent = '❌ Network error'; }
}

// Categories
async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    CATEGORIES = await res.json();
    renderCategories();
    populateCategorySelects();
  } catch (e) {
    console.error(e);
  }
}

function renderCategories() {
  const box = $('#categoriesList');
  if (!box) return;
  if (!Array.isArray(CATEGORIES) || !CATEGORIES.length) {
    box.innerHTML = '<div class="msg">No categories yet. Create one above ➕</div>';
    return;
  }
  box.innerHTML = CATEGORIES.map(c => `
    <div class="row">
      <div><input type="text" value="${escapeHtml(c.name)}" data-cat-name="${c.id}" /></div>
      <div class="actions">
        <button class="btn success" data-cat-save="${c.id}">💾</button>
        <button class="btn danger" data-cat-del="${c.id}">🗑️</button>
      </div>
    </div>
  `).join('');
  box.querySelectorAll('[data-cat-save]').forEach(b => b.addEventListener('click', () => saveCategory(b)));
  box.querySelectorAll('[data-cat-del]').forEach(b => b.addEventListener('click', () => delCategory(b)));
}

function populateCategorySelects() {
  const createSel = $('#createCategorySelect');
  if (createSel) {
    createSel.innerHTML = ['<option value="">No category</option>'].concat(
      CATEGORIES.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
    ).join('');
  }
}

async function saveCategory(btn) {
  const id = Number(btn.getAttribute('data-cat-save'));
  const inp = document.querySelector(`[data-cat-name="${id}"]`);
  const name = inp.value.trim();
  const res = await fetch(`/api/categories/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
  if (res.ok) loadCategories(); else alert('Save error');
}

async function delCategory(btn) {
  const id = Number(btn.getAttribute('data-cat-del'));
  if (!confirm('Delete this category? Products will be uncategorized.')) return;
  const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' });
  if (res.ok) loadCategories(); else alert('Delete error');
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
    box.innerHTML = items.map(p => {
      const opts = ['<option value="">No category</option>'].concat(
        CATEGORIES.map(c => `<option value="${c.id}" ${p.category_id===c.id? 'selected':''}>${escapeHtml(c.name)}</option>`)
      ).join('');
      return `
      <div class="card">
        <div class="inline" style="align-items:start;">
          <input type="text" value="${escapeHtml(p.title)}" data-field="title" data-id="${p.id}">
          <input class="price-eur" type="number" step="0.01" value="${(p.price_cents/100).toFixed(2)}" data-field="price">
          <select data-field="category_id">${opts}</select>
          <input type="text" placeholder="price_..." value="${escapeHtml(p.stripe_price_id || '')}" data-field="stripe_price_id">
          <div class="actions">
            <button class="btn success" data-save="${p.id}">💾</button>
            <button class="btn danger" data-del="${p.id}">🗑️</button>
          </div>
          <input type="text" value="${escapeHtml(p.description || '')}" data-field="description" placeholder="Description" style="grid-column: 1 / -1;">
          <div style="grid-column: 1 / -1; display:flex; gap:10px; align-items:center;">
            <img src="${p.image_url || ''}" alt="${escapeHtml(p.title)}" style="width:80px;height:60px;object-fit:cover;border:1px solid var(--border);border-radius:8px;background:#0c0d12;" />
            <input type="file" accept="image/*" data-image="${p.id}" />
          </div>
        </div>
      </div>`;
    }).join('');

    box.querySelectorAll('[data-save]').forEach(btn => btn.addEventListener('click', () => saveProduct(btn)));
    box.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', () => delProduct(btn)));
  } catch (e) {
    console.error(e);
    box.innerHTML = '<div class="msg">Error while loading</div>';
  }
}

async function saveProduct(btn) {
  const id = Number(btn.getAttribute('data-save'));
  const card = btn.closest('.card');
  const inputs = card.querySelectorAll('[data-field]');
  const form = new FormData();
  inputs.forEach(inp => {
    const f = inp.getAttribute('data-field');
    if (f === 'price') form.set('price_cents', String(Math.round(Number(inp.value || 0) * 100)));
    else form.set(f, inp.value);
  });
  const fileInp = card.querySelector(`[input][data-image="${id}"]`) || card.querySelector(`[data-image="${id}"]`);
  if (fileInp && fileInp.files && fileInp.files[0]) {
    form.set('image', fileInp.files[0]);
  }
  const res = await fetch(`/api/products/${id}`, { method: 'PUT', body: form });
  if (!res.ok) alert('Save error'); else loadProducts();
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
  const price = Number(fd.get('price') || 0);
  fd.delete('price');
  fd.set('price_cents', String(Math.round(price * 100)));
  const msg = $('#createMsg');
  msg.textContent = 'Creating...';
  try {
    const res = await fetch('/api/products', { method: 'POST', body: fd });
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
  const createCategoryForm = document.querySelector('#createCategoryForm');
  if (createCategoryForm) createCategoryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const name = String(fd.get('name') || '').trim();
    if (!name) return;
    const res = await fetch('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    if (res.ok) { e.target.reset(); loadCategories(); } else alert('Error creating category');
  });
  checkSession();
});
