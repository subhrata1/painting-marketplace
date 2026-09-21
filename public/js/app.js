// ---- API helper ----
async function api(path, opts = {}) {
  const headers = opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' };
  const res = await fetch('/api' + path, {
    credentials: 'same-origin',
    headers: { ...headers, ...opts.headers },
    ...opts,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ---- Series / Collections ----
// Curated suggestions shown in the Series dropdown even before any painting uses them.
// (Series is always optional — "— None —" remains the default.)
const SUGGESTED_SERIES = [
  'Gold and Black Series',
  'Wild Majesty',
  'The Divine Feminine',
  'Irish Roots',
  'Gilded Wings',
];

// Merge curated suggestions with the series already in use, de-duplicated (case-insensitive) and sorted.
function mergeSeries(existing) {
  const seen = new Map(); // lowercase -> display value (first-seen wins)
  [...SUGGESTED_SERIES, ...(existing || [])].forEach(s => {
    const name = (s || '').trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (!seen.has(key)) seen.set(key, name);
  });
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
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

  const common = `<a href="/gallery.html">Gallery</a><a href="/artists.html">Artists</a><a href="/terms.html">Terms</a><a href="/join.html">Sell Your Art</a>`;

  if (currentUser) {
    let roleLinks = '';
    if (currentUser.role === 'admin') {
      roleLinks = `<a href="/upload.html">Upload</a><a href="/admin.html">Admin Panel</a><a href="/dashboard.html">My Paintings</a>`;
    } else if (currentUser.role === 'artist') {
      roleLinks = `<a href="/upload.html">Upload</a><a href="/dashboard.html">Dashboard</a>`;
    }
    navLinks.innerHTML = `${common}${roleLinks}
      <span style="color:var(--muted);font-size:.85rem">${currentUser.name}${currentUser.role === 'admin' ? ' (admin)' : ''}</span>
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
const CURRENCY_SYMBOLS = { USD: '$', EUR: '\u20AC', GBP: '\u00A3' };

function formatPrice(cents, currency) {
  const symbol = CURRENCY_SYMBOLS[currency] || '$';
  return symbol + (cents / 100).toFixed(2);
}

function paintingCard(p) {
  const isSold = p.status === 'sold';
  return `
    <div class="card ${isSold ? 'card-sold' : ''}" onclick="location.href='/painting.html?id=${p.id}'">
      <div class="card-img-wrap">
        <img src="${p.image_path}" alt="${p.title}" loading="lazy">
        ${isSold ? '<div class="sold-badge">SOLD</div>' : ''}
      </div>
      <div class="card-body">
        <div class="card-title">${esc(p.title)}</div>
        <div class="card-artist"><a href="/artist.html?id=${p.artist_id}" onclick="event.stopPropagation()" style="color:var(--accent);text-decoration:none">${esc(p.artist_name || '')}</a></div>
        <div class="card-price">${isSold ? '<span class="price-sold">SOLD</span>' : formatPrice(p.price_cents, p.currency)}</div>
        <div class="card-meta">
          ${p.style ? `<span>${esc(p.style)}</span>` : ''}
          ${p.medium ? `<span>${esc(p.medium)}</span>` : ''}
        </div>
        ${!isSold ? `<button class="btn btn-primary btn-sm card-buy-btn" onclick="event.stopPropagation();buyPainting(${p.id})">Buy Now</button>` : ''}
      </div>
    </div>`;
}

function buyPainting(id) {
  if (!currentUser) {
    window.location.href = '/register.html?role=buyer&next=painting&id=' + id;
    return;
  }
  api('/payments/checkout/' + id, { method: 'POST' })
    .then(r => { window.location.href = r.url; })
    .catch(err => alert(err.message));
}

function esc(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

// ---- Logo ----
function renderNavLogo() {
  const brand = document.querySelector('.nav-brand');
  if (!brand) return;
  brand.innerHTML = '<svg class="nav-logo" viewBox="0 0 260 80" xmlns="http://www.w3.org/2000/svg">'
    + '<defs>'
    + '<linearGradient id="pl1" x1="0%" y1="0%" x2="100%" y2="100%">'
    + '<stop offset="0%" stop-color="#c9a96e"/>'
    + '<stop offset="50%" stop-color="#dbb878"/>'
    + '<stop offset="100%" stop-color="#a07830"/>'
    + '</linearGradient>'
    + '</defs>'
    + '<g transform="translate(4,4) scale(0.72)">'
    + '<ellipse cx="35" cy="42" rx="32" ry="38" fill="none" stroke="#c9a96e" stroke-width="1" opacity=".4" transform="rotate(-15,35,42)"/>'
    + '<circle cx="20" cy="25" r="6" fill="#c9a96e" opacity=".6"/>'
    + '<circle cx="38" cy="18" r="5" fill="#dbb878" opacity=".5"/>'
    + '<circle cx="50" cy="28" r="4.5" fill="#a07830" opacity=".5"/>'
    + '<circle cx="22" cy="42" r="4" fill="#8a6b30" opacity=".4"/>'
    + '<circle cx="48" cy="48" r="5" fill="#e8c880" opacity=".4"/>'
    + '<ellipse cx="35" cy="58" rx="8" ry="6" fill="#0e0e0e" stroke="#c9a96e" stroke-width=".5" opacity=".3"/>'
    + '<line x1="55" y1="10" x2="15" y2="75" stroke="#888" stroke-width="2" stroke-linecap="round"/>'
    + '<path d="M55 10 Q58 5,60 3 Q63 1,58 6 Q56 8,55 10" fill="#c9a96e"/>'
    + '</g>'
    + '<text x="72" y="22" font-family="Playfair Display,Georgia,serif" font-size="8" font-weight="300" font-style="italic" fill="#888" letter-spacing="3.5">THE</text>'
    + '<text x="72" y="44" font-family="Playfair Display,Georgia,serif" font-size="24" font-weight="400" font-style="italic" fill="#e8c44a">Brush</text>'
    + '<text x="72" y="58" font-family="Playfair Display,Georgia,serif" font-size="16" font-weight="300" font-style="italic" fill="#f5f5f5">Collective</text>'
    + '<path d="M72 67 Q150 64,230 67" stroke="#c9a96e" stroke-width="1.2" fill="none" stroke-linecap="round" opacity=".5"/>'
    + '<text x="72" y="76" font-family="Inter,sans-serif" font-size="4.5" fill="#555" letter-spacing="1.8">WHERE EVERY BRUSHSTROKE FINDS ITS BUYER</text>'
    + '</svg>';
}

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
  loadUser();
  renderNavLogo();

  // Set favicon
  if (!document.querySelector('link[rel="icon"]')) {
    var fi = document.createElement('link');
    fi.rel = 'icon'; fi.type = 'image/svg+xml'; fi.href = '/favicon.svg';
    document.head.appendChild(fi);
  }

  // Add back button on all subpages
  const path = window.location.pathname;
  const isHome = path === '/' || path === '/index.html';
  if (!isHome) {
    const nav = document.querySelector('nav');
    if (nav) {
      const backLink = document.createElement('a');
      backLink.href = '/';
      backLink.innerHTML = '&#8592; Home';
      backLink.style.cssText = 'font-size:.82rem;color:var(--muted);display:inline-flex;align-items:center;gap:.3rem;text-decoration:none;margin-right:.5rem;';
      backLink.onmouseenter = () => backLink.style.color = 'var(--accent)';
      backLink.onmouseleave = () => backLink.style.color = 'var(--muted)';
      nav.insertBefore(backLink, nav.firstChild);
    }
  }

  // Floating back-to-top button on all pages
  const btn = document.createElement('button');
  btn.className = 'back-to-top';
  btn.innerHTML = '&#8593;';
  btn.setAttribute('aria-label', 'Back to top');
  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  document.body.appendChild(btn);

  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 400);
  });
});
