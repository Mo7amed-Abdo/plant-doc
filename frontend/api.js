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
  const initials = user.full_name ? user.full_name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2) : 'U';
  document.querySelectorAll('[data-user-name]').forEach(el    => el.textContent = user.full_name || 'User');
  document.querySelectorAll('[data-user-role]').forEach(el    => el.textContent = user.role ? user.role.charAt(0).toUpperCase()+user.role.slice(1) : '');
  document.querySelectorAll('[data-user-initials]').forEach(el=> el.textContent = initials);
  document.querySelectorAll('[data-user-avatar]').forEach(el  => { if (user.avatar) el.src = user.avatar; });
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
const ORDER_STATUS_CLS = { pending:'bg-secondary-container text-on-secondary-container', processing:'bg-primary-fixed/30 text-primary', shipped:'bg-secondary-container text-on-secondary-container', on_the_way:'bg-primary-fixed/30 text-primary', arriving:'bg-primary-fixed/40 text-primary', delivered:'bg-primary text-on-primary', cancelled:'bg-error-container text-on-error-container' };
const DELIVERY_STATUS_CLS = { pending:'bg-secondary-container text-on-secondary-container', picked_up:'bg-primary-fixed/30 text-primary', on_the_way:'bg-secondary-container text-on-secondary-container', arriving:'bg-primary-fixed/40 text-primary', delivered:'bg-primary text-on-primary', failed:'bg-error-container text-on-error-container' };
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
