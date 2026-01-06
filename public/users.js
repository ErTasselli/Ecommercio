const $ = (s) => document.querySelector(s);

async function ensureAdminSession() {
  try {
    const res = await fetch('/api/session');
    const data = await res.json();
    if (!data.user) {
      window.location.href = '/auth.html';
      return false;
    }
    if (data.user.role !== 'admin') {
      window.location.href = '/';
      return false;
    }
    return true;
  } catch {
    window.location.href = '/auth.html';
    return false;
  }
}

async function logout() {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/auth.html';
}

function userCard(u) {
  const profile = [
    [u.first_name, u.last_name].filter(Boolean).join(' ').trim(),
    u.birth_date ? `Born: ${u.birth_date}` : '',
    u.shipping_address ? `Ship: ${u.shipping_address} ${u.shipping_zip || ''}` : '',
    u.billing_address ? `Bill: ${u.billing_address} ${u.billing_zip || ''}` : ''
  ].filter(Boolean).join(' • ');

  const created = u.created_at ? new Date(u.created_at.replace(' ', 'T') + 'Z').toLocaleString() : '';

  return `
    <div class="row" data-id="${u.id}">
      <div style="min-width:220px">
        <div><strong>${escapeHtml(u.username)}</strong></div>
        <div class="muted">Joined: ${escapeHtml(created)} · Purchases: ${u.purchases || 0}</div>
      </div>
      <div style="flex:1; min-width:260px">
        <div>${profile ? escapeHtml(profile) : '<span class="muted">No profile</span>'}</div>
      </div>
      <div style="min-width:180px">
        <div class="muted">Role: <strong>${u.role}</strong>${u.banned ? ' · <span style="color:#f66">BANNED</span>' : ''}</div>
      </div>
      <div class="actions">
        ${u.banned ? `<button class="btn" data-unban="${u.id}">Unban</button>` : `<button class="btn danger" data-ban="${u.id}">Ban</button>`}
        ${u.role === 'admin' ? `<button class="btn" data-makeuser="${u.id}">Remove admin</button>` : `<button class="btn success" data-makeadmin="${u.id}">Make admin</button>`}
      </div>
    </div>
  `;
}

async function loadUsers() {
  const list = $('#usersList');
  const msg = $('#usersMsg');
  msg.textContent = 'Loading users...';
  list.innerHTML = '';
  try {
    const res = await fetch('/api/admin/users', { cache: 'no-store' });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      msg.textContent = `❌ Error: ${d.error || res.status}`;
      return;
    }
    const users = await res.json();
    msg.textContent = '';
    if (!Array.isArray(users) || !users.length) {
      list.innerHTML = '<div class="msg">No users found.</div>';
      return;
    }
    list.innerHTML = users.map(userCard).join('');

    // Bind actions
    list.querySelectorAll('[data-ban]').forEach(btn => btn.addEventListener('click', () => setBan(Number(btn.dataset.ban), true)));
    list.querySelectorAll('[data-unban]').forEach(btn => btn.addEventListener('click', () => setBan(Number(btn.dataset.unban), false)));
    list.querySelectorAll('[data-makeadmin]').forEach(btn => btn.addEventListener('click', () => setRole(Number(btn.dataset.makeadmin), 'admin')));
    list.querySelectorAll('[data-makeuser]').forEach(btn => btn.addEventListener('click', () => setRole(Number(btn.dataset.makeuser), 'user')));
  } catch (e) {
    console.error(e);
    msg.textContent = '❌ Network error';
  }
}

async function setBan(id, banned) {
  const list = $('#usersList');
  const prev = list.innerHTML;
  list.innerHTML = '<div class="msg">Applying...</div>';
  try {
    const res = await fetch(`/api/admin/users/${id}/ban`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ banned }) });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(`Error: ${d.error || res.status}`);
      list.innerHTML = prev;
      return;
    }
    await loadUsers();
  } catch (e) {
    alert('Network error');
    list.innerHTML = prev;
  }
}

async function setRole(id, role) {
  const list = $('#usersList');
  const prev = list.innerHTML;
  list.innerHTML = '<div class="msg">Applying...</div>';
  try {
    const res = await fetch(`/api/admin/users/${id}/role`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(`Error: ${d.error || res.status}`);
      list.innerHTML = prev;
      return;
    }
    await loadUsers();
  } catch (e) {
    alert('Network error');
    list.innerHTML = prev;
  }
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"]+/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s]));
}

window.addEventListener('DOMContentLoaded', async () => {
  const ok = await ensureAdminSession();
  if (!ok) return;
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);
  await loadUsers();
});
