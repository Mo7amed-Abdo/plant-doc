// deliverynotifications.js
let _notifs = [], _tab = 'all';

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth('delivery')) return;
  populateSidebarUser(); setupLogout();
  await loadNotifs();
  setupTabs(); setupMarkAll();
});

async function loadNotifs() {
  try {
    _notifs = (await api.get('/delivery/notifications?limit=100')).data || [];
    updateCount(); render(_filtered(_tab));
  } catch (e) {
    showToast('Failed to load notifications', 'error');
    render([]);
  }
}

function render(list) {
  // Target the notifications list container in the HTML
  const con = document.querySelector('[data-notifications-list], .flex.flex-col.gap-3, main .flex.flex-col.gap-4');
  if (!con) return;

  if (!list.length) {
    con.innerHTML = `<div class="py-16 text-center col-span-full">
      <span class="material-symbols-outlined text-5xl text-on-surface-variant/40 block mb-3">notifications_off</span>
      <p class="text-on-surface-variant font-medium">No notifications</p>
    </div>`;
    return;
  }

  const unread = list.filter(n => !n.is_read);
  const read   = list.filter(n => n.is_read);

  let html = '';
  if (unread.length) {
    html += `<p class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3">New · ${unread.length}</p>`;
    html += unread.map(notifCard).join('');
  }
  if (read.length) {
    html += `<p class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mt-6 mb-3">Earlier</p>`;
    html += read.map(notifCard).join('');
  }
  con.innerHTML = html;

  // Wire click to mark read
  con.querySelectorAll('.notif-item:not(.is-read)').forEach(el => {
    el.addEventListener('click', () => markOne(el.dataset.nid, el));
  });
}

function notifCard(n) {
  const iconMap = {
    new_order:       'add_shopping_cart',
    order_update:    'update',
    delivery_status: 'local_shipping',
    system:          'notifications',
    pickup_ready:    'inventory',
    delivered:       'check_circle',
  };
  const icon = iconMap[n.type] || 'notifications';
  return `<div class="notif-item ${n.is_read ? 'is-read' : ''} bg-surface-container-lowest border border-surface-variant rounded-[16px] flex items-start overflow-hidden cursor-pointer hover:shadow-sm transition-all relative mb-3" data-nid="${n._id}">
    ${!n.is_read ? `<div class="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-l-[16px]"></div>` : ''}
    <div class="pl-5 py-5 shrink-0 ${n.is_read ? 'opacity-60' : ''}">
      <div class="w-10 h-10 rounded-full bg-primary-fixed/40 text-primary flex items-center justify-center">
        <span class="material-symbols-outlined fill text-[20px]">${icon}</span>
      </div>
    </div>
    <div class="flex-1 min-w-0 py-5 px-4 ${n.is_read ? 'opacity-75' : ''}">
      <div class="flex items-start justify-between gap-2 mb-1">
        <h4 class="text-sm font-bold text-on-surface">${n.title || 'Notification'}</h4>
        <span class="text-xs font-semibold ${n.is_read ? 'text-on-surface-variant' : 'text-primary'} shrink-0">${timeAgo(n.created_at)}</span>
      </div>
      <p class="text-sm text-on-surface-variant leading-relaxed">${n.body || ''}</p>
    </div>
    ${!n.is_read ? `<div class="pr-4 py-5 flex items-start shrink-0">
      <div class="w-2.5 h-2.5 rounded-full bg-error mt-1"></div>
    </div>` : ''}
  </div>`;
}

async function markOne(id, el) {
  if (el.classList.contains('is-read')) return;
  try {
    await api.put(`/delivery/notifications/${id}/read`);
    const n = _notifs.find(x => x._id === id); if (n) n.is_read = true;
    el.classList.add('is-read');
    el.querySelector('.absolute.left-0')?.remove();
    el.querySelector('.w-2.5.h-2.5')?.remove();
    el.querySelectorAll('.opacity-60,.opacity-75').forEach(e => {});
    updateCount();
  } catch (_) {}
}

async function markAll() {
  try {
    await api.put('/delivery/notifications/read-all');
    _notifs.forEach(n => n.is_read = true);
    render(_filtered(_tab));
    updateCount();
    showToast('All marked as read', 'success');
  } catch (e) {
    showToast('Failed', 'error');
  }
}

function setupMarkAll() {
  document.querySelectorAll('button').forEach(btn => {
    if (btn.textContent?.trim().includes('Mark all') || btn.textContent?.trim().includes('Mark All')) {
      btn.addEventListener('click', markAll);
    }
  });
}

function setupTabs() {
  document.querySelectorAll('[data-filter-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('[data-filter-tab]').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      _tab = tab.dataset.filterTab;
      render(_filtered(_tab));
    });
  });
}

function _filtered(f) {
  if (f === 'unread') return _notifs.filter(n => !n.is_read);
  return _notifs;
}

function updateCount() {
  const n = _notifs.filter(x => !x.is_read).length;
  document.querySelectorAll('[data-unread-count], #unread-count').forEach(el => {
    el.textContent = n;
    el.classList.toggle('hidden', n === 0);
  });
}
