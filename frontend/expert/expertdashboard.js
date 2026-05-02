let expertDashboardSocket = null;
let expertNotifications = [];

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth('expert')) return;
  populateSidebarUser();
  bindDashboardActions();
  setupLogout(expertDashboardSocket);
  await Promise.all([loadStats(), loadRecentCases(), loadExpertNotifications()]);
  connectExpertDashboardSocket();
});

async function loadStats() {
  try {
    const profile = Auth.getProfile() || (await api.get('/expert/profile')).data;
    setText('[data-stat="cases-reviewed"]', profile.cases_reviewed || 0);
    setText('[data-stat="accuracy-rate"]', `${profile.accuracy_rate || 0}%`);
    const pool = await api.get('/treatment-requests/pool?limit=1');
    setText('[data-stat="pending-cases"]', pool.meta?.total || 0);
    const reviewedToday = await api.get('/cases/reviewed-today');
    setText('[data-stat="reviewed-today"]', reviewedToday.meta?.total || 0);
  } catch (error) {
    console.error('[ExpertDashboard] loadStats failed:', error);
  }
}

async function loadRecentCases() {
  const tbody = document.querySelector('table tbody');
  if (!tbody) return;
  tbody.innerHTML = skeletonRows(3, 6);
  try {
    const res = await api.get('/cases/validated?limit=5');
    const cases = res.data || [];
    if (!cases.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-on-surface-variant text-sm">No validated cases yet.</td></tr>`;
      return;
    }
    tbody.innerHTML = cases.map((c) => {
      const image = c.imageUrl
        ? `<div class="relative w-14 h-14">
            <img src="${c.imageUrl}" alt="${escapeHtml(c.title)}" class="w-14 h-14 rounded-xl object-cover border border-surface-variant" onerror="this.style.display='none';this.nextElementSibling.classList.remove('hidden');" />
            <div class="hidden absolute inset-0">${placeholderImageHtml()}</div>
          </div>`
        : placeholderImageHtml();
      const isTreatment = c.validationStatus === 'validated';
      const actionIcon = isTreatment ? 'medication' : 'search';
      const actionTitle = isTreatment ? 'المعالجة' : 'الكشف';
      return `<tr class="hover:bg-surface-container-low/50 transition-colors cursor-pointer" onclick="window.location.href='/expert/cases'">
        <td class="px-2 py-4">${image}</td>
        <td class="px-4 py-4 font-semibold text-on-surface">${escapeHtml(c.plantName || 'Unknown plant')}</td>
        <td class="px-4 py-4 text-on-surface-variant">${escapeHtml(c.title || 'Untitled case')}</td>
        <td class="px-4 py-4">${validationBadge(c.validationStatus)}</td>
        <td class="px-4 py-4 hidden sm:table-cell text-on-surface-variant">${formatDateTime(c.validatedAt)}</td>
        <td class="px-2 py-4 text-right"><button class="text-on-surface-variant hover:text-primary" title="${actionTitle}" aria-label="${actionTitle}"><span class="material-symbols-outlined text-[20px]">${actionIcon}</span></button></td>
      </tr>`;
    }).join('');
  } catch (error) {
    console.error('[ExpertDashboard] loadRecentCases failed:', error);
    tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-6 text-center text-error text-sm">Failed to load validated cases</td></tr>`;
  }
}

async function loadExpertNotifications() {
  try {
    const expertId = await getExpertProfileId();
    if (!expertId) return;

    const res = await api.get(`/notifications/expert/${expertId}`);
    expertNotifications = dedupeNotifications(res.data || []);
    renderNotifications();
    updateNotificationBadge();
  } catch (error) {
    console.error('[ExpertDashboard] loadExpertNotifications failed:', error);
    const list = document.querySelector('[data-notif-list]');
    if (list) {
      list.innerHTML = `<div class="text-sm text-error text-center py-6">Failed to load notifications.</div>`;
    }
  }
}

function bindDashboardActions() {
  document.querySelector('[data-view-all-cases]')?.addEventListener('click', () => {
    window.location.href = '/expert/cases';
  });

  document.querySelector('[data-profile-nav]')?.addEventListener('click', (event) => {
    if (event.target.closest('button')) return;
    window.location.href = '/expert/profile';
  });

  document.querySelector('[data-notif-toggle]')?.addEventListener('click', (event) => {
    event.stopPropagation();
    document.querySelector('[data-notif-dropdown]')?.classList.toggle('hidden');
  });

  document.querySelector('[data-mark-all-read]')?.addEventListener('click', async (event) => {
    event.stopPropagation();
    await markAllExpertNotificationsRead();
  });

  document.addEventListener('click', (event) => {
    const dropdown = document.querySelector('[data-notif-dropdown]');
    const toggle = document.querySelector('[data-notif-toggle]');
    if (!dropdown || !toggle) return;
    if (dropdown.contains(event.target) || toggle.contains(event.target)) return;
    dropdown.classList.add('hidden');
  });
}

function renderNotifications() {
  const list = document.querySelector('[data-notif-list]');
  if (!list) return;

  if (!expertNotifications.length) {
    list.innerHTML = `<div class="flex flex-col items-center justify-center py-10 text-center gap-3">
      <div class="w-16 h-16 rounded-full bg-surface-container border border-surface-variant flex items-center justify-center">
        <span class="material-symbols-outlined text-[30px] text-on-surface-variant/40">notifications_off</span>
      </div>
      <div>
        <p class="font-semibold text-slate-600 text-sm">No notifications</p>
        <p class="text-xs text-slate-400 mt-1">You're all caught up.</p>
      </div>
    </div>`;
    return;
  }

  list.innerHTML = expertNotifications.map(notificationCard).join('');
  list.querySelectorAll('[data-notification-id]').forEach((element) => {
    element.addEventListener('click', async () => {
      const notification = expertNotifications.find((item) => item._id === element.dataset.notificationId);
      if (!notification) return;
      await openNotification(notification);
    });
  });
}

function notificationCard(notification) {
  const style = getNotificationStyle(notification.type);
  const unread = !notification.is_read;

  return `<button type="button" data-notification-id="${notification._id}" class="w-full text-left relative flex items-start gap-4 px-4 py-4 bg-white rounded-2xl border ${unread ? 'border-green-100 bg-green-50/30' : 'border-slate-100'} shadow-sm hover:bg-slate-50 transition-colors">
    ${unread ? '<div class="absolute left-0 top-0 bottom-0 w-[3px] bg-primary rounded-l-2xl"></div>' : ''}
    <div class="w-11 h-11 rounded-full ${style.bg} border ${style.ring} flex items-center justify-center shrink-0">
      <span class="material-symbols-outlined fill ${style.color} text-[20px]">${style.icon}</span>
    </div>
    <div class="flex-1 min-w-0">
      <div class="flex items-start justify-between gap-3">
        <p class="text-sm font-bold text-on-surface leading-snug">${escapeHtml(notification.title)}</p>
        <div class="flex items-center gap-2 shrink-0">
          <span class="text-[11px] font-medium text-slate-400 whitespace-nowrap">${timeAgo(notification.created_at)}</span>
          ${unread ? '<div class="w-2 h-2 bg-primary rounded-full shrink-0 mt-0.5"></div>' : ''}
        </div>
      </div>
      <p class="text-sm text-slate-500 mt-0.5 leading-relaxed">${escapeHtml(notification.body || notification.message || '')}</p>
    </div>
  </button>`;
}

function getNotificationStyle(type) {
  const styles = {
    new_pending_case: { icon: 'pending_actions', bg: 'bg-amber-50', color: 'text-amber-600', ring: 'border-amber-100' },
    unread_chat_message: { icon: 'forum', bg: 'bg-blue-50', color: 'text-blue-600', ring: 'border-blue-100' },
  };

  return styles[type] || { icon: 'notifications', bg: 'bg-slate-50', color: 'text-slate-500', ring: 'border-slate-200' };
}

async function openNotification(notification) {
  if (!notification.is_read) {
    await markExpertNotificationRead(notification._id);
  }

  if (notification.type === 'new_pending_case') {
    window.location.href = '/frontend/expert/expertPendingcases.html';
    return;
  }

  if (notification.type === 'unread_chat_message') {
    const chatId = notification.relatedConversationId || notification.related_conversation_id || notification.related_id;
    window.location.href = `/frontend/expert/expertChat.html?chatId=${encodeURIComponent(chatId)}`;
  }
}

async function markExpertNotificationRead(notificationId) {
  try {
    await api.patch(`/notifications/${notificationId}/read`, {});
    const target = expertNotifications.find((item) => item._id === notificationId);
    if (target) target.is_read = true;
    renderNotifications();
    updateNotificationBadge();
  } catch (error) {
    console.error('[ExpertDashboard] markExpertNotificationRead failed:', error);
  }
}

async function markAllExpertNotificationsRead() {
  try {
    const expertId = await getExpertProfileId();
    if (!expertId) return;
    await api.patch(`/notifications/expert/${expertId}/read-all`, {});
    expertNotifications.forEach((item) => { item.is_read = true; });
    renderNotifications();
    updateNotificationBadge();
  } catch (error) {
    console.error('[ExpertDashboard] markAllExpertNotificationsRead failed:', error);
  }
}

function updateNotificationBadge() {
  const unreadCount = expertNotifications.filter((item) => !item.is_read).length;
  document.querySelectorAll('[data-notif-count]').forEach((element) => {
    element.textContent = unreadCount;
    element.classList.toggle('hidden', unreadCount === 0);
  });

  const unreadChatCount = expertNotifications.filter((item) => !item.is_read && item.type === 'unread_chat_message').length;
  const unreadPendingCount = expertNotifications.filter((item) => !item.is_read && item.type === 'new_pending_case').length;
  if (typeof renderExpertSidebarBadge === 'function') {
    renderExpertSidebarBadge('[data-chat-badge]', unreadChatCount);
    renderExpertSidebarBadge('[data-pending-badge]', unreadPendingCount);
  }
}

function connectExpertDashboardSocket() {
  if (typeof io === 'undefined') {
    console.warn('[ExpertDashboard] Socket.IO not loaded');
    return;
  }

  expertDashboardSocket = io('http://localhost:5000', { auth: { token: Auth.getToken() } });
  setupLogout(expertDashboardSocket);

  expertDashboardSocket.on('notification:new', (notification) => {
    const normalized = {
      ...notification,
      _id: notification._id || notification.id,
      is_read: notification.is_read ?? notification.isRead ?? false,
      related_conversation_id: notification.relatedConversationId || notification.related_conversation_id || null,
      related_case_id: notification.relatedCaseId || notification.related_case_id || null,
    };
    if (expertNotifications.some((item) => item._id === normalized._id)) {
      return;
    }
    expertNotifications.unshift(normalized);
    expertNotifications = dedupeNotifications(expertNotifications);
    if (typeof playNotificationTone === 'function') playNotificationTone();
    renderNotifications();
    updateNotificationBadge();
  });

  expertDashboardSocket.on('error', ({ message }) => {
    console.error('[ExpertDashboard][Socket]', message);
  });
}

async function getExpertProfileId() {
  const cachedProfile = Auth.getProfile();
  if (cachedProfile?.id) return cachedProfile.id;

  try {
    const profile = (await api.get('/expert/profile')).data;
    localStorage.setItem('plantdoc_profile', JSON.stringify(profile));
    return profile.id;
  } catch (_) {
    return null;
  }
}

const setText = (sel, val) => document.querySelectorAll(sel).forEach((el) => { el.textContent = val ?? ''; });

function placeholderImageHtml() {
  return `<div class="w-14 h-14 rounded-xl bg-surface-container flex items-center justify-center text-on-surface-variant border border-surface-variant"><span class="material-symbols-outlined text-xl">image</span></div>`;
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

function validationBadge(status) {
  const map = {
    validated: 'bg-primary-fixed/30 text-primary',
    rejected: 'bg-error-container text-on-error-container',
    pending: 'bg-surface-container text-on-surface-variant',
    in_review: 'bg-secondary-container text-on-secondary-container',
  };

  const label = (status || 'pending').replace(/_/g, ' ');
  return badge(label.replace(/\b\w/g, (c) => c.toUpperCase()), map[status] || map.pending);
}
