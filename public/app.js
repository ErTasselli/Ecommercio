// Utils
const fmtEUR = (cents) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR' }).format((cents || 0) / 100);
const $ = (sel) => document.querySelector(sel);

// State carrello in localStorage
const CART_KEY = 'cart_items_v1';
function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; }
}

async function showHomeAdminPanel() {
  const panel = document.getElementById('homeAdminPanel');
  if (!panel) return; // Not on home
  panel.classList.remove('hidden');
  const msgBox = document.getElementById('homeAdminMsg');
  // Load categories, products and current layout
  try {
    const [catsRes, prodsRes, settingsRes] = await Promise.all([
      fetch('/api/categories'),
      fetch('/api/products'),
      fetch('/api/settings', { cache: 'no-store' })
    ]);
    const [categories, products, settings] = await Promise.all([
      catsRes.json(), prodsRes.json(), settingsRes.json()
    ]);
    const layout = parseHomeLayout(settings && settings.homeLayout);
    renderHomeAdminList(categories, products, layout);
    bindHomeAdminActions(categories, products);
  } catch (e) {
    if (msgBox) msgBox.textContent = '❌ Errore nel caricamento di categorie/prodotti';
  }
}

function parseHomeLayout(raw) {
  if (!raw) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
}

function renderHomeAdminList(categories, products, layout) {
  const box = document.getElementById('homeCatList');
  if (!box) return;
  // Order categories: if layout has selection, use its order then append others unchecked
  const byId = new Map(categories.map(c => [c.id, c]));
  const selectedIds = layout.map(c => c.category_id);
  const ordered = layout
    .map(c => ({ ...c, cat: byId.get(c.category_id) }))
    .filter(x => x.cat);
  const remaining = categories.filter(c => !selectedIds.includes(c.id)).map(c => ({ category_id: c.id, product_ids: [], cat: c }));
  const full = ordered.concat(remaining);

  box.innerHTML = full.map((entry, idx) => {
    const c = entry.cat;
    const catProducts = products.filter(p => p.category_id === c.id);
    const selected = new Set(entry.product_ids || []);
    const items = catProducts.map(p => {
      const img = p.image_url || ('https://picsum.photos/seed/' + p.id + '/120/80');
      return `
        <label class="inline" style="gap:8px; align-items:center;">
          <input type="checkbox" data-prod="${p.id}" ${selected.has(p.id) ? 'checked':''} />
          <img src="${img}" alt="${escapeHtml(p.title)}" style="width:64px;height:48px;object-fit:cover;border:1px solid var(--border);border-radius:6px;background:#0c0d12;" />
          <span>${escapeHtml(p.title)}</span>
        </label>
      `;
    }).join('') || '<div class="muted">Nessun prodotto in questa categoria</div>';
    return `
      <div class="row" data-row data-cat-id="${c.id}">
        <div style="display:flex; align-items:center; gap:8px;">
          <div class="actions" style="display:flex; gap:4px;">
            <button class="btn ghost" data-move-up title="Sposta su">⬆️</button>
            <button class="btn ghost" data-move-down title="Sposta giù">⬇️</button>
          </div>
          <label class="inline" style="gap:6px;">
            <input type="checkbox" data-enable-cat ${selectedIds.includes(c.id) ? 'checked':''} />
            <strong>${escapeHtml(c.name)}</strong>
          </label>
        </div>
        <div class="list" style="margin-top:6px; padding-left:28px;">
          ${items}
        </div>
      </div>
    `;
  }).join('');

  // Buttons to move rows up/down
  box.querySelectorAll('[data-row]').forEach(row => {
    const up = row.querySelector('[data-move-up]');
    const down = row.querySelector('[data-move-down]');
    if (up) up.addEventListener('click', (e) => {
      e.preventDefault();
      const prev = row.previousElementSibling;
      if (prev) row.parentNode.insertBefore(row, prev);
    });
    if (down) down.addEventListener('click', (e) => {
      e.preventDefault();
      const next = row.nextElementSibling;
      if (next) row.parentNode.insertBefore(next, row);
    });
  });
}

function collectHomeLayoutFromUI() {
  const box = document.getElementById('homeCatList');
  const out = [];
  if (!box) return out;
  box.querySelectorAll('[data-row]').forEach(row => {
    const catId = Number(row.getAttribute('data-cat-id'));
    const enabled = row.querySelector('[data-enable-cat]').checked;
    if (!enabled) return;
    const prods = Array.from(row.querySelectorAll('[data-prod]'))
      .filter(inp => inp.checked)
      .map(inp => Number(inp.getAttribute('data-prod')));
    out.push({ category_id: catId, product_ids: prods });
  });
  return out;
}

function bindHomeAdminActions(categories, products) {
  const saveBtn = document.getElementById('homeLayoutSave');
  const resetBtn = document.getElementById('homeLayoutReset');
  const msgBox = document.getElementById('homeAdminMsg');
  if (saveBtn && !saveBtn.dataset.bound) {
    saveBtn.dataset.bound = '1';
    saveBtn.addEventListener('click', async () => {
      const layout = collectHomeLayoutFromUI();
      const payload = { homeLayout: JSON.stringify(layout) };
      msgBox.textContent = 'Salvataggio layout...';
      try {
        const res = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (res.ok) {
          msgBox.textContent = '✅ Layout salvato';
          loadProducts();
        } else {
          const d = await res.json().catch(() => ({}));
          msgBox.textContent = '❌ Errore salvataggio: ' + (d.error || res.status);
        }
      } catch {
        msgBox.textContent = '❌ Errore di rete';
      }
    });
  }
  if (resetBtn && !resetBtn.dataset.bound) {
    resetBtn.dataset.bound = '1';
    resetBtn.addEventListener('click', async () => {
      msgBox.textContent = 'Ripristino layout...';
      try {
        const res = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ homeLayout: '' }) });
        if (res.ok) {
          msgBox.textContent = '✅ Ripristinato';
          loadProducts();
          // Ricarica pannello
          showHomeAdminPanel();
        } else {
          const d = await res.json().catch(() => ({}));
          msgBox.textContent = '❌ Errore: ' + (d.error || res.status);
        }
      } catch {
        msgBox.textContent = '❌ Errore di rete';
      }
    });
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"]+/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s]));
}
function saveCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  updateCartCount();
}
function addToCart(product, qty = 1) {
  const cart = getCart();
  const existing = cart.find(i => i.id === product.id);
  if (existing) existing.quantity += qty; else cart.push({ id: product.id, title: product.title, price_cents: product.price_cents, quantity: qty });
  saveCart(cart);
  openCart();
  renderCart();
}
function removeFromCart(id) {
  const cart = getCart().filter(i => i.id !== id);
  saveCart(cart);
  renderCart();
}
function changeQty(id, qty) {
  const cart = getCart();
  const it = cart.find(i => i.id === id);
  if (!it) return;
  it.quantity = Math.max(1, qty);
  saveCart(cart);
  renderCart();
}
function cartTotal() {
  return getCart().reduce((s, i) => s + i.price_cents * i.quantity, 0);
}

// UI iniziale
window.addEventListener('DOMContentLoaded', () => {
  $('#year').textContent = new Date().getFullYear();
  updateCartCount();
  loadSettings();
  updateAuthNav();
  loadProducts();
  setupCartDrawer();
});

async function loadSettings() {
  try {
    const res = await fetch('/api/settings', { cache: 'no-store' });
    const data = await res.json();
    if (data.siteName) {
      document.title = `${data.siteName}`;
      const el = $('#siteName');
      if (el) el.textContent = data.siteName;
    }
    // Homepage editable texts
    const heroTitle = document.getElementById('heroTitle');
    if (heroTitle && data.heroTitle) heroTitle.innerHTML = data.heroTitle;
    const heroSubtitle = document.getElementById('heroSubtitle');
    if (heroSubtitle && data.heroSubtitle) heroSubtitle.innerHTML = data.heroSubtitle;
    const aboutText = document.getElementById('aboutText');
    if (aboutText && data.aboutText) aboutText.innerHTML = data.aboutText;
    const contactText = document.getElementById('contactText');
    if (contactText && data.contactText) contactText.innerHTML = data.contactText;
    const footerText = document.getElementById('footerText');
    if (footerText && data.footerText) footerText.innerHTML = data.footerText;
  } catch {}
}

async function updateAuthNav() {
  try {
    const res = await fetch('/api/session');
    const data = await res.json();
    const authLink = document.getElementById('authLink');
    const accountLink = document.getElementById('accountLink');
    if (!authLink || !accountLink) return;
    if (data.user) {
      authLink.classList.add('hidden');
      accountLink.classList.remove('hidden');
      accountLink.textContent = data.user.username;
      accountLink.setAttribute('href', data.user.role === 'admin' ? '/admin.html' : '/profile.html');
      accountLink.title = data.user.role === 'admin' ? 'Go to admin' : 'Go to your profile';
      // Enable inline editing on homepage if admin
      if (data.user.role === 'admin') {
        enableInlineEditingForAdmin();
        showHomeAdminPanel();
      }
    } else {
      authLink.classList.remove('hidden');
      accountLink.classList.add('hidden');
      accountLink.textContent = '';
      accountLink.removeAttribute('href');
    }
  } catch {}
}

function getEditableNodes() {
  return {
    heroTitle: document.getElementById('heroTitle'),
    heroSubtitle: document.getElementById('heroSubtitle'),
    aboutText: document.getElementById('aboutText'),
    contactText: document.getElementById('contactText'),
    footerText: document.getElementById('footerText'),
  };
}

function enableInlineEditingForAdmin() {
  // Only on homepage where these nodes exist
  const nodes = getEditableNodes();
  const any = Object.values(nodes).some(Boolean);
  if (!any) return;

  Object.values(nodes).forEach(el => {
    if (!el) return;
    el.setAttribute('contenteditable', 'true');
    el.style.outline = '1px dashed var(--border, #444)';
    el.style.outlineOffset = '4px';
    el.title = 'Editable (admin)';
  });

  if (!document.getElementById('saveHomeTextsBtn')) {
    const btn = document.createElement('button');
    btn.id = 'saveHomeTextsBtn';
    btn.textContent = '💾 Salva testi homepage';
    btn.className = 'btn success';
    btn.style.position = 'fixed';
    btn.style.right = '16px';
    btn.style.bottom = '16px';
    btn.style.zIndex = '9999';
    btn.addEventListener('click', saveHomepageTexts);
    document.body.appendChild(btn);
  }
}

async function saveHomepageTexts() {
  const btn = document.getElementById('saveHomeTextsBtn');
  const nodes = getEditableNodes();
  const payload = {};
  for (const [k, el] of Object.entries(nodes)) {
    if (el) payload[k] = el.innerHTML.trim();
  }
  const original = btn ? btn.textContent : '';
  if (btn) btn.textContent = 'Saving...';
  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      if (btn) btn.textContent = '✅ Salvato';
      // Refresh to ensure consistency from server
      loadSettings();
      setTimeout(() => { if (btn) btn.textContent = original || '💾 Salva testi homepage'; }, 1200);
    } else {
      const d = await res.json().catch(() => ({}));
      if (btn) btn.textContent = '❌ Errore';
      alert('Errore salvataggio: ' + (d.error || res.status));
      setTimeout(() => { if (btn) btn.textContent = original || '💾 Salva testi homepage'; }, 1500);
    }
  } catch (e) {
    if (btn) btn.textContent = '❌ Rete';
    setTimeout(() => { if (btn) btn.textContent = original || '💾 Salva testi homepage'; }, 1500);
  }
}

async function loadProducts() {
  const grid = $('#products');
  grid.innerHTML = '<div class="msg">Loading products...</div>';
  try {
    const [prodsRes, catsRes, settingsRes] = await Promise.all([
      fetch('/api/products'),
      fetch('/api/categories'),
      fetch('/api/settings', { cache: 'no-store' })
    ]);
    const [items, categories, settings] = await Promise.all([
      prodsRes.json(), catsRes.json(), settingsRes.json()
    ]);
    if (!Array.isArray(items) || items.length === 0) {
      grid.innerHTML = '<div class="msg">No products available yet. Sign in as admin to create one ➕</div>';
      return;
    }
    const layout = parseHomeLayout(settings && settings.homeLayout);
    let html = '';
    if (layout && layout.length) {
      const catById = new Map(categories.map(c => [c.id, c]));
      for (const sec of layout) {
        const cat = catById.get(sec.category_id);
        if (!cat) continue;
        const selectedSet = new Set(sec.product_ids || []);
        const prods = items.filter(p => p.category_id === sec.category_id && (selectedSet.size === 0 || selectedSet.has(p.id)));
        if (prods.length === 0) continue;
        html += `<h4 class="section-title">${escapeHtml(cat.name)}</h4>`;
        html += '<div class="grid">' + prods.map(p => `
          <div class="product">
            <img src="${p.image_url || 'https://picsum.photos/seed/' + p.id + '/600/400'}" alt="${escapeHtml(p.title)}">
            <div class="info">
              <div class="title">${escapeHtml(p.title)}</div>
              <div class="desc">${escapeHtml((p.description || '').slice(0,120))}</div>
              <div class="bottom">
                <div class="price">${fmtEUR(p.price_cents)}</div>
                <button class="btn primary" data-add="${p.id}">Add to cart 🛒</button>
              </div>
            </div>
          </div>
        `).join('') + '</div>';
      }
      if (!html) {
        html = '<div class="msg">Nessun prodotto selezionato nel layout. Modifica il layout da admin oppure rimuovi il filtro.</div>';
      }
      grid.innerHTML = html;
    } else {
      // Fallback: mostra tutti i prodotti come prima
      grid.innerHTML = items.map(p => `
        <div class="product">
          <img src="${p.image_url || 'https://picsum.photos/seed/' + p.id + '/600/400'}" alt="${escapeHtml(p.title)}">
          <div class="info">
            <div class="title">${escapeHtml(p.title)}</div>
            <div class="desc">${escapeHtml((p.description || '').slice(0,120))}</div>
            <div class="bottom">
              <div class="price">${fmtEUR(p.price_cents)}</div>
              <button class="btn primary" data-add="${p.id}">Add to cart 🛒</button>
            </div>
          </div>
        </div>
      `).join('');
    }
    grid.querySelectorAll('[data-add]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-add'));
        const prod = items.find(x => x.id === id);
        addToCart(prod, 1);
      });
    });
  } catch (e) {
    console.error(e);
    grid.innerHTML = '<div class="msg">Error loading products.</div>';
  }
}

// Cart drawer
function setupCartDrawer() {
  const drawer = $('#cartDrawer');
  const backdrop = $('#backdrop');
  const openBtn = $('#cartBtn');
  const closeBtn = $('#closeCart');
  openBtn.addEventListener('click', openCart);
  closeBtn.addEventListener('click', closeCart);
  backdrop.addEventListener('click', closeCart);
  renderCart();
}
function openCart() {
  $('#cartDrawer').classList.add('open');
  $('#backdrop').classList.add('show');
}
function closeCart() {
  $('#cartDrawer').classList.remove('open');
  $('#backdrop').classList.remove('show');
}
function updateCartCount() {
  const count = getCart().reduce((s, i) => s + i.quantity, 0);
  const el = $('#cartCount'); if (el) el.textContent = String(count);
}
function renderCart() {
  const box = $('#cartItems');
  const items = getCart();
  if (!items.length) {
    box.innerHTML = '<div class="msg">Your cart is empty 😶</div>';
  } else {
    box.innerHTML = items.map(i => `
      <div class="row">
        <div>
          <div><strong>${i.title}</strong></div>
          <div class="muted">${fmtEUR(i.price_cents)} x</div>
        </div>
        <div class="actions">
          <input type="number" min="1" value="${i.quantity}" style="width:70px" data-qty="${i.id}" />
          <button class="btn ghost" data-rem="${i.id}">Remove</button>
        </div>
      </div>
    `).join('');
  }
  $('#cartTotal').textContent = fmtEUR(cartTotal());

  box.querySelectorAll('[data-rem]').forEach(b => b.addEventListener('click', () => removeFromCart(Number(b.getAttribute('data-rem')))));
  box.querySelectorAll('[data-qty]').forEach(inp => inp.addEventListener('change', () => changeQty(Number(inp.getAttribute('data-qty')), Number(inp.value || 1))));
}

// Checkout: navigate to dedicated page
$('#checkoutBtn').addEventListener('click', () => {
  window.location.href = '/checkout.html';
});
