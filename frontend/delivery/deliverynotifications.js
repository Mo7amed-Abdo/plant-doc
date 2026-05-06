let _notifs = [];
let _tab = 'all';

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth('delivery')) return;
  populateSidebarUser();
  setupLogout();
  setupTabs();
  setupMarkAll();
  await loadNotifications();
});

async function loadNotifications() {
  try {
    _notifs = (await api.get('/delivery/notifications?limit=100')).data || [];
    updateUnreadCount();
    render(_filtered(_tab));
  } catch (_) {
    showToast('Failed to load notifications', 'error');
    render([]);
  }
}

function render(list) {
  const con = document.querySelector('[data-notifications-list]');
  if (!con) return;
  con.innerHTML = '';

  if (!list.length) {
    con.innerHTML = `
      <div class="flex flex-col items-center justify-center py-24 text-center gap-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
        <div class="w-20 h-20 rounded-full bg-slate-100 border-2 border-slate-200 flex items-center justify-center">
          <span class="material-symbols-outlined text-[40px] text-slate-400">notifications_off</span>
        </div>
        <div>
          <p class="font-semibold text-slate-600 text-base">No notifications</p>
          <p class="text-sm text-slate-400 mt-1">You're all caught up! Check back later.</p>
        </div>
      </div>`;
    return;
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);
  const groups = { Today: [], Yesterday: [], 'This Week': [], Earlier: [] };

  list.forEach((n) => {
    const d = new Date(n.created_at);
    if (d >= today) groups.Today.push(n);
    else if (d >= yesterday) groups.Yesterday.push(n);
    else if (d >= weekAgo) groups['This Week'].push(n);
    else groups.Earlier.push(n);
  });

  let html = '';
  Object.entries(groups).forEach(([label, items]) => {
    if (!items.length) return;
    html += `
      <div class="flex items-center gap-3 mb-1 mt-2">
        <span class="text-[11px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">${label}</span>
        <div class="flex-1 h-px bg-slate-100"></div>
        <span class="text-[11px] text-slate-400">${items.length} notification${items.length !== 1 ? 's' : ''}</span>
      </div>
      ${items.map(notificationCard).join('')}
    `;
  });
  con.innerHTML = html;

  con.querySelectorAll('.notif-item[data-id]').forEach((el) => {
    if (el.dataset.read) return;
    el.addEventListener('click', () => markOneAsRead(el.dataset.id, el));
  });
}

function notificationCard(n) {
  const kind = normalizeType(n.type);
  const iconMap = {
    delivery_assigned: { icon: 'local_shipping', bg: 'bg-cyan-50', color: 'text-cyan-700', ring: 'border-cyan-100' },
    delivery_completed: { icon: 'task_alt', bg: 'bg-green-50', color: 'text-green-700', ring: 'border-green-100' },
    delivery_failed: { icon: 'warning', bg: 'bg-red-50', color: 'text-red-600', ring: 'border-red-100' },
    delivery_update: { icon: 'route', bg: 'bg-violet-50', color: 'text-violet-600', ring: 'border-violet-100' },
    system: { icon: 'notifications', bg: 'bg-slate-50', color: 'text-slate-500', ring: 'border-slate-200' },
  };
  const style = iconMap[kind] || iconMap.system;
  const isRead = !!n.is_read;
  const detailsLink = notificationLink(n);

  return `
  <div class="notif-item ${isRead ? 'is-read' : 'unread'} relative flex items-start gap-4 px-5 py-4 bg-white rounded-2xl border cursor-pointer ${isRead ? 'border-slate-100' : 'border-green-100 bg-green-50/30'} shadow-sm overflow-hidden mb-3"
       data-id="${n._id}" ${isRead ? 'data-read="true"' : ''}>
    ${!isRead ? '<div class="absolute left-0 top-0 bottom-0 w-[3px] bg-green-700 rounded-l-2xl"></div>' : ''}
    <div class="shrink-0 mt-0.5">
      <div class="w-11 h-11 rounded-full ${style.bg} border ${style.ring} flex items-center justify-center">
        <span class="material-symbols-outlined fill ${style.color} text-[20px]">${style.icon}</span>
      </div>
    </div>
    <div class="flex-1 min-w-0">
      <div class="flex items-start justify-between gap-3">
        <p class="text-sm font-bold text-slate-800 leading-snug">${escapeHtml(n.title || 'Notification')}</p>
        <div class="flex items-center gap-2 shrink-0">
          <span class="text-[11px] font-medium text-slate-400 whitespace-nowrap">${timeAgo(n.created_at)}</span>
          ${!isRead ? '<div class="w-2 h-2 bg-green-700 rounded-full shrink-0 mt-0.5"></div>' : ''}
        </div>
      </div>
      <p class="text-sm text-slate-500 mt-0.5 leading-relaxed">${escapeHtml(n.body || '')}</p>
      ${detailsLink ? `<a href="${detailsLink}" onclick="event.stopPropagation()" class="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-green-700 hover:text-green-600 hover:underline transition-colors">View details <span class="material-symbols-outlined text-[13px]">arrow_forward</span></a>` : ''}
    </div>
  </div>`;
}

function notificationLink(n) {
  const type = String(n?.type || '').toLowerCase();
  const title = String(n?.title || '').toLowerCase();
  const body = String(n?.body || '').toLowerCase();
  const relatedType = String(n?.related_type || '').toLowerCase();

  const isCompleted =
    type === 'delivery_completed' ||
    type === 'order_completed' ||
    title.includes('completed') ||
    body.includes('marked as delivered') ||
    body.includes('completed');

  if (isCompleted) return 'deliveryCompletedorders.html';

  const isAssigned =
    type === 'delivery_assigned' ||
    type === 'new_order' ||
    title.includes('new order assigned') ||
    body.includes('assigned to your delivery company');

  if (isAssigned) return 'activedelivery.html';

  if (relatedType === 'completed_delivery') return 'deliveryCompletedorders.html';
  return 'activedelivery.html';
}

async function markOneAsRead(id) {
  try {
    await api.put(`/delivery/notifications/${id}/read`);
    const target = _notifs.find((x) => String(x._id) === String(id));
    if (target) target.is_read = true;
    updateUnreadCount();
    render(_filtered(_tab));
  } catch (_) {
    showToast('Failed to mark notification as read', 'error');
  }
}

async function markAllAsRead() {
  try {
    await api.put('/delivery/notifications/read-all');
    _notifs.forEach((n) => { n.is_read = true; });
    updateUnreadCount();
    render(_filtered(_tab));
    showToast('All marked as read', 'success');
  } catch (_) {
    showToast('Failed to mark all as read', 'error');
  }
}

function setupMarkAll() {
  const btn = document.getElementById('mark-all-btn');
  if (!btn) return;
  btn.addEventListener('click', markAllAsRead);
}

function setupTabs() {
  document.querySelectorAll('[data-filter-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      _tab = tab.dataset.filterTab || 'all';
      document.querySelectorAll('[data-filter-tab]').forEach((t) => {
        t.classList.remove('active', 'border-transparent');
        t.classList.add('border-slate-200', 'bg-white', 'text-slate-600');
      });
      tab.classList.add('active', 'border-transparent');
      tab.classList.remove('border-slate-200', 'bg-white', 'text-slate-600');
      render(_filtered(_tab));
    });
  });
}

function _filtered(tab) {
  if (tab === 'unread') return _notifs.filter((n) => !n.is_read);
  return _notifs;
}

function updateUnreadCount() {
  const n = _notifs.filter((x) => !x.is_read).length;
  const badge = document.getElementById('unread-count');
  if (!badge) return;
  badge.textContent = String(n);
  badge.classList.toggle('hidden', n === 0);
}

function normalizeType(type) {
  if (!type) return 'system';
  if (type === 'new_order') return 'delivery_assigned';
  if (type === 'order_update' || type === 'order_status') return 'delivery_update';
  if (type === 'order_completed') return 'delivery_completed';
  return type;
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
