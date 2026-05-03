// ─── PlantDoc Shared API Utility ─────────────────────────────────────────────
// Used by every page across all roles. Load this FIRST on every page.

const API_BASE = 'http://localhost:5000/api';

function ensureBrandLogoTheme() {
  if (!document.head) return;

  if (!document.querySelector('link[data-brand-baloo-font]')) {
    const font = document.createElement('link');
    font.rel = 'stylesheet';
    font.href = 'https://fonts.googleapis.com/css2?family=Baloo+2:wght@700;800&display=swap';
    font.setAttribute('data-brand-baloo-font', '1');
    document.head.appendChild(font);
  }

  if (!document.getElementById('plantdoc-brand-style')) {
    const style = document.createElement('style');
    style.id = 'plantdoc-brand-style';
    style.textContent = `
      .brand-logo-text {
        font-family: 'Baloo 2', sans-serif;
        font-weight: 800;
        letter-spacing: -0.01em;
        animation: brandLogoIn 560ms ease-out both, brandFloat 2.8s ease-in-out infinite;
        display: inline-block;
        line-height: 1;
      }
      .brand-logo-size-sidebar { font-size: 1.36rem; }
      .brand-logo-size-mobile { font-size: 1.52rem; }
      .brand-logo-plant {
        color: #047a43;
        animation: plantPulse 2.2s ease-in-out infinite;
      }
      .brand-logo-doc {
        color: #67b689;
        animation: docPulse 2.2s ease-in-out infinite;
      }
      .brand-logo-text:hover {
        transform: translateY(-1px) scale(1.02);
        filter: drop-shadow(0 3px 10px rgba(3, 122, 67, 0.26));
      }
      @keyframes brandFloat {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-3px); }
      }
      @keyframes plantPulse {
        0%, 100% { color: #047a43; filter: brightness(1); }
        50% { color: #06a15a; filter: brightness(1.08); }
      }
      @keyframes docPulse {
        0%, 100% { color: #67b689; filter: brightness(1); }
        50% { color: #8bdeb0; filter: brightness(1.1); }
      }
      @keyframes brandLogoIn {
        from { opacity: 0; transform: translateY(6px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
    `;
    document.head.appendChild(style);
  }
}

function applyBrandLogoText() {
  const candidates = document.querySelectorAll('span, h1, h2, h3, h4, div, a');
  candidates.forEach((el) => {
    if (!el || el.classList.contains('brand-logo-text')) return;
    if (el.children.length > 0) return;
    if ((el.textContent || '').trim() !== 'PlantDoc') return;
    const cls = (el.className || '').toString();
    const isMobileSize = /\btext-xl\b|\btext-2xl\b/.test(cls);
    const sizeClass = isMobileSize ? 'brand-logo-size-mobile' : 'brand-logo-size-sidebar';
    el.innerHTML = `<span class="brand-logo-text ${sizeClass}"><span class="brand-logo-plant">Plant</span><span class="brand-logo-doc">Doc</span></span>`;
  });
}

document.addEventListener('DOMContentLoaded', () => {
  ensureBrandLogoTheme();
  applyBrandLogoText();
  // Guest users should not hit authenticated APIs.
  if (!Auth.isGuest?.()) {
    setupFarmerChatBadge().catch(() => null);
    setupFarmerNotificationBadge().catch(() => null);
  }
});

async function setupFarmerChatBadge() {
  // Adds/updates an unread badge on the "Chat with Expert" nav item (farmer only).
  if (Auth.getRole() !== 'farmer') return;

  const links = Array.from(document.querySelectorAll('a[href$="expertschat.html"], a[href*="expertschat.html"]'));
  if (!links.length) return;

  let totalUnread = 0;
  try {
    const res = await api.get('/chats?limit=50');
    const chats = res.data || [];
    totalUnread = chats.reduce((sum, c) => sum + Number(c.unreadCount || 0), 0);
  } catch (_) {
    totalUnread = 0;
  }

  links.forEach((a) => {
    if (a.dataset._chatBadgeBound === '1') {
      const badge = a.querySelector('[data-chat-unread-count]');
      if (badge) {
        badge.textContent = totalUnread > 99 ? '99+' : String(totalUnread);
        badge.classList.toggle('hidden', totalUnread === 0);
      }
      return;
    }

    a.classList.add('relative');
    const badge = document.createElement('span');
    badge.dataset.chatUnreadCount = '1';
    badge.className = 'hidden ml-auto min-w-[18px] h-[18px] px-1.5 rounded-full bg-error text-white text-[10px] font-bold inline-flex items-center justify-center';
    badge.textContent = totalUnread > 99 ? '99+' : String(totalUnread);
    badge.classList.toggle('hidden', totalUnread === 0);

    // Ensure spacing: wrap existing content with a flex row if needed.
    if (!a.classList.contains('flex')) {
      a.classList.add('flex', 'items-center', 'gap-3');
    }
    a.appendChild(badge);
    a.dataset._chatBadgeBound = '1';
  });
}

async function setupFarmerNotificationBadge() {
  // Adds/updates an unread count badge on the "Notifications" nav item (farmer only).
  if (Auth.getRole() !== 'farmer') return;

  const navLinks = Array.from(document.querySelectorAll('a'));
  const targets = navLinks.filter((a) => {
    const icon = a.querySelector('.material-symbols-outlined');
    const iconText = icon?.textContent?.trim();
    const label = (a.textContent || '').toLowerCase();
    return iconText === 'notifications' || label.includes('notifications');
  });
  if (!targets.length) return;

  let unread = 0;
  try {
    const res = await api.get('/notifications?is_read=false&limit=1');
    unread = Number(res.meta?.total ?? (res.data || []).length ?? 0);
  } catch (_) {
    unread = 0;
  }

  targets.forEach((a) => {
    if (a.dataset._notifBadgeBound === '1') {
      const badge = a.querySelector('[data-notif-unread-count]');
      if (badge) {
        badge.textContent = unread > 99 ? '99+' : String(unread);
        badge.classList.toggle('hidden', unread === 0);
      }
      return;
    }

    const badge = document.createElement('span');
    badge.dataset.notifUnreadCount = '1';
    badge.className =
      'hidden ml-auto min-w-[18px] h-[18px] px-1.5 rounded-full bg-error text-white text-[10px] font-bold inline-flex items-center justify-center';
    badge.textContent = unread > 99 ? '99+' : String(unread);
    badge.classList.toggle('hidden', unread === 0);

    if (!a.classList.contains('flex')) {
      a.classList.add('flex', 'items-center', 'gap-3');
    }
    a.appendChild(badge);
    a.dataset._notifBadgeBound = '1';
  });
}

// ── Auth ──────────────────────────────────────────────────────────────────────
const Auth = {
  getToken:    ()     => localStorage.getItem('plantdoc_token'),
  getUser:     ()     => JSON.parse(localStorage.getItem('plantdoc_user')    || 'null'),
  getProfile:  ()     => JSON.parse(localStorage.getItem('plantdoc_profile') || 'null'),
  isGuest:     ()     => localStorage.getItem('plantdoc_guest') === '1',
  setGuest:    ()     => {
    localStorage.setItem('plantdoc_guest', '1');
    // Minimal identity for UI rendering (no token).
    localStorage.setItem('plantdoc_user', JSON.stringify({ role: 'farmer', full_name: 'Guest' }));
    localStorage.removeItem('plantdoc_profile');
    localStorage.removeItem('plantdoc_token');
  },
  setSession:  (data) => {
    localStorage.removeItem('plantdoc_guest');
    localStorage.setItem('plantdoc_token',   data.token);
    localStorage.setItem('plantdoc_user',    JSON.stringify(data.user));
    if (data.profile) localStorage.setItem('plantdoc_profile', JSON.stringify(data.profile));
  },
  clearSession: () => {
    ['plantdoc_token','plantdoc_user','plantdoc_profile','plantdoc_guest'].forEach(k => localStorage.removeItem(k));
  },
  isLoggedIn: () => !!localStorage.getItem('plantdoc_token'),
  getRole:    () => JSON.parse(localStorage.getItem('plantdoc_user') || 'null')?.role || null,
};

// ── Core fetch ────────────────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  if (Auth.isGuest()) {
    throw Object.assign(new Error('Guest mode: please register to use this feature.'), { status: 401, data: {} });
  }
  const token   = Auth.getToken();
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res  = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error || data.message || `Request failed (${res.status})`;
    throw Object.assign(new Error(msg), { status: res.status, data });
  }
  return data;
}

const api = {
  get:    (path)       => apiFetch(path, { method: 'GET' }),
  post:   (path, body) => apiFetch(path, { method: 'POST',   body: body instanceof FormData ? body : JSON.stringify(body) }),
  put:    (path, body) => apiFetch(path, { method: 'PUT',    body: body instanceof FormData ? body : JSON.stringify(body) }),
  patch:  (path, body) => apiFetch(path, { method: 'PATCH',  body: JSON.stringify(body) }),
  delete: (path)       => apiFetch(path, { method: 'DELETE' }),
};

// ── Auth guard ────────────────────────────────────────────────────────────────
const ROLE_DASHBOARDS = {
  farmer:   '/frontend/farmer/farmerdashboard.html',
  expert:   '/frontend/expert/expertDashboard.html',
  company:  '/frontend/company/dashboardcompany.html',
  delivery: '/frontend/delivery/deliverydashboard.html',
};

function requireAuth(allowedRole = null) {
  if (!Auth.isLoggedIn()) {
    if (allowedRole === 'farmer' && Auth.isGuest()) return true;
    window.location.href = '/frontend/login.html';
    return false;
  }
  if (allowedRole && Auth.getRole() !== allowedRole) {
    window.location.href = ROLE_DASHBOARDS[Auth.getRole()] || '/frontend/login.html';
    return false;
  }
  return true;
}

function redirectToDashboard(role) {
  window.location.href = ROLE_DASHBOARDS[role] || '/frontend/login.html';
}

// ── Sidebar user population ───────────────────────────────────────────────────
function populateSidebarUser() {
  const user = Auth.getUser();
  if (!user) return;

  // We prefer cached role profile data when available (plantdoc_profile), and only fetch if missing.
  const role = user.role || null;
  const cachedProfile = Auth.getProfile();

  const roleLabel =
    role ? role.charAt(0).toUpperCase() + role.slice(1) : '';
  document.querySelectorAll('[data-user-role]').forEach((el) => { el.textContent = roleLabel; });

  const deriveDisplayName = (u, p) => {
    if (role === 'company') return p?.company_name || u.full_name || 'Company';
    // delivery uses a "DeliveryCompany" profile with logo + name/description in backend
    if (role === 'delivery') return p?.company_name || p?.name || u.full_name || 'Delivery';
    return u.full_name || 'User';
  };

  const displayName = deriveDisplayName(user, cachedProfile);
  const initials = (displayName || 'U')
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

  document.querySelectorAll('[data-user-name]').forEach((el) => { el.textContent = displayName; });
  document.querySelectorAll('[data-user-initials]').forEach((el) => { el.textContent = initials; });

  const avatarUrlFrom = (u, p) => {
    if (role === 'company') return p?.logo || u.avatar || null;
    if (role === 'delivery') return p?.logo || u.avatar || null;
    return p?.avatar || u.avatar || null;
  };

  const initialFallback = initialsAvatarDataUrl(initials);
  const setAvatarImg = (img, maybeUrl) => {
    if (!img) return;
    const prev = img.getAttribute('data-prev-src') || '';
    if (!prev) img.setAttribute('data-prev-src', prev || '');

    // Always start with a clean fallback so we never show a broken image icon.
    img.src = initialFallback;
    img.dataset.hasRealAvatar = '0';

    if (maybeUrl) {
      const resolved = resolveAssetUrl(maybeUrl);
      img.dataset.hasRealAvatar = '1';
      img.src = resolved;
      img.onerror = () => {
        img.onerror = null;
        img.dataset.hasRealAvatar = '0';
        img.src = initialFallback;
      };
    } else {
      img.onerror = null;
    }
  };

  const avatarUrl = avatarUrlFrom(user, cachedProfile);
  document.querySelectorAll('[data-user-avatar]').forEach((img) => setAvatarImg(img, avatarUrl));

  // Enable click-to-change avatar for the sidebar/header avatars (uses existing profile endpoints).
  enableSidebarAvatarUpload({ role, initials });

  // If we don't have a cached profile for this role, fetch it once in the background
  // and refresh sidebar values without requiring a page reload.
  if (!cachedProfile && role) {
    const endpoint = profileEndpointForRole(role);
    if (endpoint) {
      (async () => {
        try {
          const res = await api.get(endpoint);
          localStorage.setItem('plantdoc_profile', JSON.stringify(res.data));
          // Re-run to re-render name + avatar from fresh profile data.
          populateSidebarUser();
        } catch (_) {
          // Keep UI usable with user-only fallback.
        }
      })();
    }
  }
}

function profileEndpointForRole(role) {
  if (role === 'company') return '/company/profile';
  if (role === 'farmer')  return '/farmer/profile';
  if (role === 'expert')  return '/expert/profile';
  if (role === 'delivery') return '/delivery/profile';
  return null;
}

function uploadFieldForRole(role) {
  if (role === 'company') return 'logo';
  if (role === 'delivery') return 'logo';
  return 'avatar';
}

function resolveAssetUrl(url) {
  if (!url) return '';
  const s = String(url);
  if (s.startsWith('data:')) return s;
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  if (s.startsWith('/')) return API_BASE.replace(/\/api\/?$/, '') + s;
  return s;
}

function initialsAvatarDataUrl(initials) {
  const safe = String(initials || 'U').slice(0, 2).toUpperCase();
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e8f5e9"/>
      <stop offset="1" stop-color="#c8e6c9"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="32" fill="url(#g)"/>
  <text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle"
        font-family="Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="22"
        font-weight="700" fill="#0f5132">${safe}</text>
</svg>`.trim();
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function enableSidebarAvatarUpload({ role, initials }) {
  // Farmer dashboard: keep avatar static (no "Change photo" tooltip / upload).
  if (role === 'farmer' && String(window.location?.pathname || '').toLowerCase().includes('farmerdashboard.html')) {
    return;
  }

  const endpoint = profileEndpointForRole(role);
  if (!endpoint) return;

  const MAX_BYTES = 5 * 1024 * 1024; // consistent with other image uploads in the app
  const field = uploadFieldForRole(role);
  const inputId = 'plantdoc-profile-photo-input';
  const getInput = () => {
    let input = document.getElementById(inputId);
    if (input) return input;
    input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.id = inputId;
    input.style.display = 'none';
    document.body.appendChild(input);
    return input;
  };

  const fallback = initialsAvatarDataUrl(initials || 'U');

  document.querySelectorAll('[data-user-avatar]').forEach((img) => {
    if (!img || img.dataset.avatarUploadBound === '1') return;
    img.dataset.avatarUploadBound = '1';
    img.style.cursor = 'pointer';
    img.title = 'Change photo';

    img.addEventListener('click', (e) => {
      e.preventDefault();
      const input = getInput();
      // Remember which avatar(s) were clicked for preview purposes.
      input.dataset.clicked = '1';
      input.click();
    });
  });

  const input = getInput();
  if (input.dataset.bound === '1') return;
  input.dataset.bound = '1';
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    input.value = '';

    if (!file.type.startsWith('image/')) { showToast('Please select an image file', 'error'); return; }
    if (file.size > MAX_BYTES) { showToast('Image must be under 5MB', 'error'); return; }

    const previewUrl = URL.createObjectURL(file);
    const avatars = Array.from(document.querySelectorAll('[data-user-avatar]'));
    const prevSrcs = avatars.map((img) => img.src);
    avatars.forEach((img) => { img.src = previewUrl; });

    const ok = typeof confirmDialog === 'function'
      ? await confirmDialog('Upload this new profile photo?')
      : true;

    if (!ok) {
      URL.revokeObjectURL(previewUrl);
      avatars.forEach((img, i) => { img.src = prevSrcs[i] || fallback; });
      return;
    }

    try {
      const fd = new FormData();
      fd.append(field, file);
      await api.put(endpoint, fd);

      // Refresh cached profile and re-render name/avatar immediately.
      const res = await api.get(endpoint);
      localStorage.setItem('plantdoc_profile', JSON.stringify(res.data));
      showToast('Profile photo updated!', 'success');
      populateSidebarUser();
    } catch (err) {
      showToast(err.message || 'Upload failed', 'error');
      avatars.forEach((img, i) => { img.src = prevSrcs[i] || fallback; });
    } finally {
      URL.revokeObjectURL(previewUrl);
    }
  });
}

// ── Logout wiring — call once per page ───────────────────────────────────────
function setupLogout(socketInstance = null) {
  document.querySelectorAll('button').forEach(btn => {
    const icon = btn.querySelector('.material-symbols-outlined');
    if (icon && icon.textContent.trim() === 'logout') {
      btn.addEventListener('click', e => {
        e.preventDefault();
        if (socketInstance) socketInstance.disconnect();
        Auth.clearSession();
        window.location.href = '/frontend/login.html';
      });
    }
  });
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(message, type = 'success') {
  document.getElementById('plantdoc-toast')?.remove();
  const colors = { success:'bg-primary text-on-primary', error:'bg-error text-white', info:'bg-secondary text-white', warning:'bg-tertiary text-white' };
  const icons  = { success:'check_circle', error:'error', info:'info', warning:'warning' };
  const t = document.createElement('div');
  t.id = 'plantdoc-toast';
  t.className = `fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] px-5 py-3 rounded-xl shadow-lg text-sm font-semibold flex items-center gap-2 ${colors[type]||colors.success}`;
  t.innerHTML = `<span class="material-symbols-outlined text-[18px]">${icons[type]||'check_circle'}</span><span>${message}</span>`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// —— Notification tone ————————————————————————————————————————————————
let _plantdocAudioCtx = null;
let _plantdocToneUnlocked = false;
let _lastNotificationToneAt = 0;

function ensureNotificationToneUnlock() {
  if (_plantdocToneUnlocked) return;
  const unlock = () => {
    _plantdocToneUnlocked = true;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx && !_plantdocAudioCtx) _plantdocAudioCtx = new Ctx();
      if (_plantdocAudioCtx?.state === 'suspended') _plantdocAudioCtx.resume().catch(() => null);
    } catch (_) {}
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
}

function _emitNotificationTone() {
  const nowMs = Date.now();
  if (nowMs - _lastNotificationToneAt < 250) return;
  _lastNotificationToneAt = nowMs;

  const now = _plantdocAudioCtx.currentTime;
  const osc = _plantdocAudioCtx.createOscillator();
  const gain = _plantdocAudioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, now);
  osc.frequency.exponentialRampToValueAtTime(1046, now + 0.12);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.06, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
  osc.connect(gain);
  gain.connect(_plantdocAudioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.2);
}

function playNotificationTone() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!_plantdocAudioCtx) _plantdocAudioCtx = new Ctx();

    if (_plantdocAudioCtx.state === 'suspended') {
      _plantdocAudioCtx.resume()
        .then(() => {
          if (_plantdocAudioCtx.state === 'running') _emitNotificationTone();
        })
        .catch(() => null);
      return;
    }

    if (_plantdocAudioCtx.state === 'running') _emitNotificationTone();
  } catch (_) {
    // no-op if autoplay/audio is blocked
  }
}

window.playNotificationTone = playNotificationTone;
ensureNotificationToneUnlock();

// ── Loading skeleton ──────────────────────────────────────────────────────────
function skeletonRows(count, cols) {
  return Array(count).fill(`<tr>${Array(cols).fill(`<td class="px-6 py-4"><div class="h-4 bg-surface-variant animate-pulse rounded-lg w-3/4"></div></td>`).join('')}</tr>`).join('');
}
function skeletonCards(count) {
  return Array(count).fill(`<div class="bg-surface-container-lowest rounded-[16px] border border-surface-variant h-56 animate-pulse"></div>`).join('');
}

// ── Formatters ────────────────────────────────────────────────────────────────
function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });
}
function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
}
function timeAgo(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 60)    return 'Just now';
  if (diff < 3600)  return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return formatDate(iso);
}
function escapeHtml(str) {
  return (str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Badges ────────────────────────────────────────────────────────────────────
const SEVERITY_CLS = { low:'bg-primary-fixed/30 text-primary', medium:'bg-secondary-container text-on-secondary-container', high:'bg-error-container text-on-error-container', critical:'bg-error text-white' };
const ORDER_STATUS_CLS = { pending:'bg-secondary-container text-on-secondary-container', processing:'bg-primary-fixed/30 text-primary', shipped:'bg-secondary-container text-on-secondary-container', on_the_way:'bg-primary-fixed/30 text-primary', arriving:'bg-primary-fixed/40 text-primary', delivered:'bg-primary text-on-primary', delivery_failed:'bg-error-container text-on-error-container', cancelled:'bg-error-container text-on-error-container' };
const DELIVERY_STATUS_CLS = { picked_up:'bg-primary-fixed/30 text-primary', on_the_way:'bg-secondary-container text-on-secondary-container', arriving:'bg-primary-fixed/40 text-primary', delivered:'bg-primary text-on-primary', failed:'bg-error-container text-on-error-container' };
const PRIORITY_CLS = { low:'bg-surface-container text-on-surface-variant', medium:'bg-secondary-container text-on-secondary-container', high:'bg-error-container text-on-error-container', urgent:'bg-error text-white' };

function badge(label, cls) {
  return `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${cls}">${label}</span>`;
}
function severityBadge(s) {
  return badge(s ? s.charAt(0).toUpperCase()+s.slice(1) : 'Unknown', SEVERITY_CLS[s]||'bg-surface-container text-on-surface-variant');
}
function orderStatusBadge(s) {
  return badge(s ? s.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()) : 'Unknown', ORDER_STATUS_CLS[s]||'bg-surface-container text-on-surface-variant');
}
function deliveryStatusBadge(s) {
  return badge(s ? s.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()) : 'Unknown', DELIVERY_STATUS_CLS[s]||'bg-surface-container text-on-surface-variant');
}
function priorityBadge(p) {
  return badge(p ? p.charAt(0).toUpperCase()+p.slice(1) : 'Medium', PRIORITY_CLS[p]||'bg-surface-container text-on-surface-variant');
}

// ── Confirm dialog ────────────────────────────────────────────────────────────
function confirmDialog(message) {
  return new Promise(resolve => {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4';
    modal.innerHTML = `
      <div class="bg-surface rounded-2xl p-6 w-full max-w-sm shadow-xl">
        <p class="text-base font-semibold text-on-surface mb-5">${message}</p>
        <div class="flex gap-3">
          <button id="cd-cancel" class="flex-1 py-2.5 border border-outline-variant rounded-xl text-sm font-medium text-on-surface-variant hover:bg-surface-container transition-colors">Cancel</button>
          <button id="cd-confirm" class="flex-1 py-2.5 bg-error text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-colors">Confirm</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#cd-confirm').addEventListener('click', () => { modal.remove(); resolve(true);  });
    modal.querySelector('#cd-cancel').addEventListener('click',  () => { modal.remove(); resolve(false); });
    modal.addEventListener('click', e => { if (e.target === modal) { modal.remove(); resolve(false); } });
  });
}
