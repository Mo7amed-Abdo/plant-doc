let _notifs = [], _tab = 'all';

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth('expert')) return;
  populateSidebarUser();
  setupLogout();
  await loadNotifs();
  setupTabs();
  setupMarkAll();
});

async function loadNotifs() {
  try {
    const expertId = await getExpertProfileId();
    if (!expertId) throw new Error('Expert profile not found');
    _notifs = dedupeNotifications((await api.get(`/notifications/expert/${expertId}`)).data || []);
    updateCount();
    render(_filtered(_tab));
  } catch (e) {
    showToast('Failed to load notifications', 'error');
  }
}

function render(list) {
  const con = document.querySelector('[data-notifications-list], main .flex.flex-col.gap-3, main .flex.flex-col.gap-6');
  if (!con) return;

  con.querySelectorAll('.notif-item').forEach((el) => el.remove());
  con.querySelectorAll('[data-notif-section]').forEach((el) => el.remove());
  con.innerHTML = '';

  if (!list.length) {
    con.innerHTML = `
      <div class="flex flex-col items-center justify-center py-24 text-center gap-4">
        <div class="w-20 h-20 rounded-full bg-surface-container border-2 border-surface-variant flex items-center justify-center">
          <span class="material-symbols-outlined text-[40px] text-on-surface-variant/30">notifications_off</span>
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
      <div data-notif-section class="flex items-center gap-3 mb-1 mt-2">
        <span class="text-[11px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">${label}</span>
        <div class="flex-1 h-px bg-slate-100"></div>
        <span class="text-[11px] text-slate-400">${items.length} notification${items.length !== 1 ? 's' : ''}</span>
      </div>
      ${items.map(notifCard).join('')}`;
  });

  con.innerHTML = html;

  con.querySelectorAll('.notif-item[data-nid]').forEach((el) => {
    el.addEventListener('click', async () => {
      await markOne(el.dataset.nid, el);
      handleNotificationNavigation(el.dataset.nid);
    });
  });
}

function notifCard(n) {
  const iconMap = {
    new_pending_case: { icon: 'pending_actions', bg: 'bg-amber-50', color: 'text-amber-600', ring: 'border-amber-100' },
    unread_chat_message: { icon: 'forum', bg: 'bg-blue-50', color: 'text-blue-600', ring: 'border-blue-100' },
    system: { icon: 'notifications', bg: 'bg-slate-50', color: 'text-slate-500', ring: 'border-slate-200' },
  };
  const style = iconMap[n.type] || iconMap.system;
  const link = notificationLink(n);
  const isRead = !!n.is_read;

  return `
  <div class="notif-item ${isRead ? 'is-read' : 'unread'}
              relative flex items-start gap-4 px-5 py-4
              bg-white rounded-2xl border cursor-pointer
              ${isRead ? 'border-slate-100' : 'border-green-100 bg-green-50/30'}
              shadow-sm"
       data-nid="${n._id}" ${isRead ? 'data-read="true"' : ''}>
    ${!isRead ? `<div class="unread-bar absolute left-0 top-0 bottom-0 w-[3px] bg-primary rounded-l-2xl"></div>` : ''}
    <div class="notif-icon-wrap shrink-0 mt-0.5">
      <div class="w-11 h-11 rounded-full ${style.bg} border ${style.ring} flex items-center justify-center">
        <span class="material-symbols-outlined fill ${style.color} text-[20px]">${style.icon}</span>
      </div>
    </div>
    <div class="notif-content flex-1 min-w-0">
      <div class="flex items-start justify-between gap-3">
        <p class="text-sm font-bold text-on-surface leading-snug">${escapeHtml(n.title)}</p>
        <div class="flex items-center gap-2 shrink-0">
          <span class="text-[11px] font-medium text-slate-400 whitespace-nowrap">${timeAgo(n.created_at)}</span>
          ${!isRead ? `<div class="unread-dot w-2 h-2 bg-primary rounded-full shrink-0 mt-0.5"></div>` : ''}
        </div>
      </div>
      <p class="text-sm text-slate-500 mt-0.5 leading-relaxed">${escapeHtml(n.body || n.message || '')}</p>
      ${link ? `
      <a href="${link}" onclick="event.stopPropagation()"
         class="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-primary hover:text-primary/80 hover:underline transition-colors">
        View details <span class="material-symbols-outlined text-[13px]">arrow_forward</span>
      </a>` : ''}
    </div>
  </div>`;
}

async function markOne(id, el) {
  if (el.dataset.read) return;
  try {
    await api.patch(`/notifications/${id}/read`, {});
    const n = _notifs.find((x) => x._id === id);
    if (n) n.is_read = true;

    el.classList.remove('unread', 'bg-green-50/30', 'border-green-100');
    el.classList.add('is-read', 'border-slate-100');
    el.dataset.read = 'true';
    el.querySelector('.unread-bar')?.remove();
    el.querySelector('.unread-dot')?.remove();

    updateCount();
  } catch (_) {}
}

async function markAll() {
  try {
    const expertId = await getExpertProfileId();
    await api.patch(`/notifications/expert/${expertId}/read-all`, {});
    _notifs.forEach((n) => { n.is_read = true; });
    render(_filtered(_tab));
    updateCount();
    showToast('All marked as read', 'success');
  } catch (e) {
    showToast('Failed', 'error');
  }
}

const markAllRead = markAll;

function setupMarkAll() {
  document.querySelectorAll('button').forEach((btn) => {
    if (btn.textContent?.includes('Mark all') || btn.getAttribute('onclick')?.includes('markAllRead')) {
      btn.removeAttribute('onclick');
      btn.addEventListener('click', markAll);
    }
  });
}

function setupTabs() {
  document.querySelectorAll('[data-filter-tab], [onclick*="setTab"]').forEach((tab) => {
    const f = tab.dataset.filterTab || tab.getAttribute('onclick')?.match(/'([^']+)'\)/)?.[1];
    if (!f) return;
    tab.removeAttribute('onclick');
    tab.addEventListener('click', () => {
      _tab = f;
      document.querySelectorAll('[data-filter-tab], [onclick*="setTab"], .filter-tab').forEach((t) => {
        t.classList.remove('active');
        t.classList.add('border-slate-200', 'bg-white', 'text-slate-600');
        t.classList.remove('border-transparent');
      });
      tab.classList.add('active');
      tab.classList.remove('border-slate-200', 'bg-white', 'text-slate-600');
      tab.classList.add('border-transparent');
      render(_filtered(f));
    });
  });
}

function _filtered(f) {
  if (f === 'unread') return _notifs.filter((n) => !n.is_read);
  if (f === 'pending') return _notifs.filter((n) => n.type === 'new_pending_case');
  if (f === 'messages') return _notifs.filter((n) => n.type === 'unread_chat_message');
  return _notifs;
}

function updateCount() {
  const n = _notifs.filter((x) => !x.is_read).length;
  document.querySelectorAll('#unread-count, [data-unread-count]').forEach((el) => {
    el.textContent = n;
    el.classList.toggle('hidden', n === 0);
  });

  const unreadChatCount = _notifs.filter((item) => !item.is_read && item.type === 'unread_chat_message').length;
  const unreadPendingCount = _notifs.filter((item) => !item.is_read && item.type === 'new_pending_case').length;
  if (typeof renderExpertSidebarBadge === 'function') {
    renderExpertSidebarBadge('[data-chat-badge]', unreadChatCount);
    renderExpertSidebarBadge('[data-pending-badge]', unreadPendingCount);
  }
}

function notificationLink(notification) {
  if (notification.type === 'new_pending_case') return '/frontend/expert/expertPendingcases.html';
  if (notification.type === 'unread_chat_message') {
    const chatId = notification.relatedConversationId || notification.related_conversation_id || notification.related_id;
    return chatId ? `/frontend/expert/expertChat.html?chatId=${encodeURIComponent(chatId)}` : '/frontend/expert/expertChat.html';
  }
  return null;
}

function handleNotificationNavigation(notificationId) {
  const notification = _notifs.find((item) => item._id === notificationId);
  const link = notification ? notificationLink(notification) : null;
  if (link) window.location.href = link;
}

function dedupeNotifications(items) {
  const seen = new Set();
  return (items || []).filter((item) => {
    const key = item?._id || item?.id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function getExpertProfileId() {
  const cachedProfile = Auth.getProfile();
  if (cachedProfile?.id) return cachedProfile.id;
  const profile = (await api.get('/expert/profile')).data;
  localStorage.setItem('plantdoc_profile', JSON.stringify(profile));
  return profile.id;
}
