// ─── PlantDoc Shared API Utility ─────────────────────────────────────────────
// Used by every page across all roles. Load this FIRST on every page.

const API_BASE = 'http://localhost:5000/api';

// ── Auth ──────────────────────────────────────────────────────────────────────
const Auth = {
  getToken:    ()     => localStorage.getItem('plantdoc_token'),
  getUser:     ()     => JSON.parse(localStorage.getItem('plantdoc_user')    || 'null'),
  getProfile:  ()     => JSON.parse(localStorage.getItem('plantdoc_profile') || 'null'),
  setSession:  (data) => {
    localStorage.setItem('plantdoc_token',   data.token);
    localStorage.setItem('plantdoc_user',    JSON.stringify(data.user));
    if (data.profile) localStorage.setItem('plantdoc_profile', JSON.stringify(data.profile));
  },
  clearSession: () => {
    ['plantdoc_token','plantdoc_user','plantdoc_profile'].forEach(k => localStorage.removeItem(k));
  },
  isLoggedIn: () => !!localStorage.getItem('plantdoc_token'),
  getRole:    () => JSON.parse(localStorage.getItem('plantdoc_user') || 'null')?.role || null,
};

// ── Core fetch ────────────────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
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
  if (!Auth.isLoggedIn()) { window.location.href = '/frontend/login.html'; return false; }
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
