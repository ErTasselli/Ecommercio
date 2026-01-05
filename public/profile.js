const $ = (s) => document.querySelector(s);

async function initProfilePage() {
  // Ensure user session exists and not admin
  const sres = await fetch('/api/session', { cache: 'no-store' });
  const sdata = await sres.json();
  if (!sdata.user) { window.location.href = '/auth.html'; return; }
  if (sdata.user.role === 'admin') { window.location.href = '/admin.html'; return; }

  // Load profile data
  try {
    const res = await fetch('/api/profile', { cache: 'no-store' });
    const p = await res.json();
    const form = $('#profileForm');
    if (p) {
      for (const k of ['first_name','last_name','birth_date','shipping_address','shipping_zip','billing_address','billing_zip']) {
        if (form.elements[k] && p[k] != null) form.elements[k].value = p[k];
      }
    }
  } catch {}

  // Copy shipping to billing toggle
  const copy = $('#copyShipping');
  copy.addEventListener('change', () => {
    if (copy.checked) {
      const f = $('#profileForm');
      f.elements['billing_address'].value = f.elements['shipping_address'].value;
      f.elements['billing_zip'].value = f.elements['shipping_zip'].value;
    }
  });
}

async function logout() {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/';
}

window.addEventListener('DOMContentLoaded', () => {
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);
  initProfilePage();
  const form = $('#profileForm');
  if (form) form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    const res = await fetch('/api/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const msg = $('#profileMsg');
    if (res.ok) msg.textContent = '✅ Saved'; else msg.textContent = '❌ Save error';
  });
});
