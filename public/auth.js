const $ = (s) => document.querySelector(s);

async function updateSessionBox() {
  try {
    const res = await fetch('/api/session');
    const data = await res.json();
    const box = $('#sessionBox');
    if (data.user) {
      box.innerHTML = `Signed in as <strong>${data.user.username}</strong> (${data.user.role})`;
    } else {
      box.textContent = 'Not signed in.';
    }
  } catch {
    $('#sessionBox').textContent = 'Error reading session';
  }
}

async function onLogin(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const payload = Object.fromEntries(fd.entries());
  const msg = $('#loginMsg');
  msg.textContent = 'Signing in...';
  try {
    const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const d = await res.json();
    if (res.ok) {
      msg.textContent = '✅ Signed in';
      updateSessionBox();
      // Redirect to home after successful login
      window.location.href = '/';
    } else {
      msg.textContent = `❌ ${d.error || 'Error'}`;
    }
  } catch {
    msg.textContent = '❌ Network error';
  }
}

async function onRegister(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const payload = Object.fromEntries(fd.entries());
  const msg = $('#registerMsg');
  msg.textContent = 'Creating account...';
  try {
    const res = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const d = await res.json();
    if (res.ok) {
      msg.textContent = `✅ Registered as ${d.user.username} (${d.user.role})`;
      updateSessionBox();
      // Redirect to home after successful registration
      window.location.href = '/';
    } else {
      msg.textContent = `❌ ${d.error || 'Error'}`;
    }
  } catch {
    msg.textContent = '❌ Network error';
  }
}

async function onLogout() {
  await fetch('/api/logout', { method: 'POST' });
  updateSessionBox();
}

window.addEventListener('DOMContentLoaded', () => {
  $('#loginForm').addEventListener('submit', onLogin);
  $('#registerForm').addEventListener('submit', onRegister);
  $('#logoutBtn').addEventListener('click', onLogout);
  $('#refreshSession').addEventListener('click', updateSessionBox);
  updateSessionBox();
});
