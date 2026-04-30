// deliverynotifications.js
let notifications = [];

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth('delivery')) return;
  populateSidebarUser();
  setupLogout();
  setupMarkAll();
  await loadNotifications();
});

async function loadNotifications() {
  try {
    notifications = (await api.get('/delivery/notifications?limit=100')).data || [];
    renderNotifications();
    updateUnreadCount();
  } catch (e) {
    showToast('Failed to load notifications', 'error');
    renderEmpty();
  }
}

function renderNotifications() {
  const unreadList = document.querySelector('[data-unread-list]');
  const readList = document.querySelector('[data-read-list]');
  if (!unreadList || !readList) return;

  const unread = notifications.filter((n) => !n.is_read);
  const read = notifications.filter((n) => n.is_read);

  unreadList.innerHTML = unread.length ? unread.map((n) => notificationCard(n)).join('') : emptySection('No unread notifications');
  readList.innerHTML = read.length ? read.map((n) => notificationCard(n)).join('') : emptySection('No earlier notifications');

  document.querySelectorAll('.notif-item[data-id]').forEach((el) => {
    if (el.classList.contains('is-read')) return;
    el.addEventListener('click', () => markOneAsRead(el.dataset.id));
  });
}

function notificationCard(n) {
  const kind = normalizeType(n.type);
  const iconMap = {
    delivery_assigned: 'local_shipping',
    delivery_completed: 'task_alt',
    delivery_failed: 'warning',
    delivery_update: 'route',
    system: 'notifications',
  };
  const toneMap = {
    delivery_assigned: 'bg-primary-container/20 text-primary',
    delivery_completed: 'bg-primary-fixed/40 text-primary',
    delivery_failed: 'bg-error-container text-on-error-container',
    delivery_update: 'bg-secondary-container text-on-secondary-container',
    system: 'bg-surface-container-high text-on-surface-variant',
  };

  const icon = iconMap[kind] || 'notifications';
  const tone = toneMap[kind] || toneMap.system;
  const readClass = n.is_read ? 'is-read opacity-75' : '';

  return `<div class="notif-item ${readClass} bg-surface-container-lowest border border-surface-variant rounded-[16px] flex items-start gap-4 overflow-hidden cursor-pointer hover:shadow-sm transition-all relative mb-3" data-id="${n._id}">
    ${!n.is_read ? '<div class="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-l-[16px]"></div>' : ''}
    <div class="pl-5 py-5 shrink-0">
      <div class="w-10 h-10 rounded-full ${tone} flex items-center justify-center">
        <span class="material-symbols-outlined fill text-[20px]">${icon}</span>
      </div>
    </div>
    <div class="flex-1 min-w-0 py-5 pr-5">
      <div class="flex items-start justify-between gap-2 mb-1">
        <h3 class="text-sm ${n.is_read ? 'font-medium' : 'font-bold'} text-on-surface">${escapeHtml(n.title || 'Notification')}</h3>
        <span class="text-xs ${n.is_read ? 'text-on-surface-variant' : 'text-primary font-semibold'} whitespace-nowrap">${timeAgo(n.created_at)}</span>
      </div>
      <p class="text-sm text-on-surface-variant leading-relaxed">${escapeHtml(n.body || '')}</p>
    </div>
    ${!n.is_read ? '<div class="py-5 pr-5 flex items-start shrink-0"><div class="w-2.5 h-2.5 rounded-full bg-primary mt-1"></div></div>' : ''}
  </div>`;
}

function emptySection(message) {
  return `<div class="py-10 text-center border border-dashed border-surface-variant rounded-xl">
    <span class="material-symbols-outlined text-3xl text-on-surface-variant/50 block mb-2">notifications_off</span>
    <p class="text-on-surface-variant text-sm">${message}</p>
  </div>`;
}

function renderEmpty() {
  const unreadList = document.querySelector('[data-unread-list]');
  const readList = document.querySelector('[data-read-list]');
  if (unreadList) unreadList.innerHTML = emptySection('Could not load unread notifications');
  if (readList) readList.innerHTML = emptySection('Could not load earlier notifications');
}

async function markOneAsRead(id) {
  try {
    await api.put(`/delivery/notifications/${id}/read`);
    const target = notifications.find((n) => String(n._id) === String(id));
    if (target) target.is_read = true;
    renderNotifications();
    updateUnreadCount();
  } catch (e) {
    showToast('Failed to mark notification as read', 'error');
  }
}

async function markAllAsRead() {
  try {
    await api.put('/delivery/notifications/read-all');
    notifications = notifications.map((n) => ({ ...n, is_read: true }));
    renderNotifications();
    updateUnreadCount();
    showToast('All marked as read', 'success');
  } catch (e) {
    showToast('Failed to mark all as read', 'error');
  }
}

function setupMarkAll() {
  const btn = document.getElementById('mark-all-btn');
  if (!btn) return;
  btn.addEventListener('click', markAllAsRead);
}

function updateUnreadCount() {
  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const countEl = document.getElementById('unread-count');
  if (countEl) {
    countEl.textContent = String(unreadCount);
    countEl.classList.toggle('hidden', unreadCount === 0);
  }
}

function normalizeType(type) {
  if (!type) return 'system';
  if (type === 'new_order') return 'delivery_assigned';
  if (type === 'order_update') return 'delivery_update';
  return type;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
