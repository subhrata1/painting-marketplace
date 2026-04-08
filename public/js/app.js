// ---- API helper ----
async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ---- Auth state ----
let currentUser = null;

async function loadUser() {
  try {
    const data = await api('/auth/me');
    currentUser = data.user;
  } catch {
    currentUser = null;
  }
  updateNav();
  return currentUser;
}

function updateNav() {
  const navLinks = document.getElementById('nav-links');
  if (!navLinks) return;

  const common = `<a href="/">Gallery</a><a href="/terms.html">Terms</a>`;

  if (currentUser) {
    const artistLinks = currentUser.role === 'artist'
      ? `<a href="/upload.html">Upload</a><a href="/dashboard.html">Dashboard</a>`
      : '';
    navLinks.innerHTML = `${common}${artistLinks}
      <span style="color:var(--muted);font-size:.85rem">${currentUser.name}</span>
      <button onclick="logout()">Logout</button>`;
  } else {
    navLinks.innerHTML = `${common}
      <a href="/login.html">Login</a>
      <a href="/register.html" class="btn btn-primary btn-sm">Sign Up</a>`;
  }
}

async function logout() {
  await api('/auth/logout', { method: 'POST' });
  currentUser = null;
  window.location.href = '/';
}

// ---- Formatting ----
function formatPrice(cents) {
  return '$' + (cents / 100).toFixed(2);
}

function paintingCard(p) {
  return `
    <div class="card" onclick="location.href='/painting.html?id=${p.id}'">
      <img src="${p.image_path}" alt="${p.title}" loading="lazy">
      <div class="card-body">
        <div class="card-title">${esc(p.title)}</div>
        <div class="card-artist">${esc(p.artist_name || '')}</div>
        <div class="card-price">${formatPrice(p.price_cents)}</div>
        <div class="card-meta">
          ${p.style ? `<span>${esc(p.style)}</span>` : ''}
          ${p.medium ? `<span>${esc(p.medium)}</span>` : ''}
        </div>
      </div>
    </div>`;
}

function esc(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => loadUser());
