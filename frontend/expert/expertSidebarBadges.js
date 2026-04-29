let expertSidebarBadgesTimer = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.isLoggedIn() || Auth.getRole() !== 'expert') return;
  await refreshExpertSidebarBadges();
  expertSidebarBadgesTimer = window.setInterval(refreshExpertSidebarBadges, 15000);
});

window.addEventListener('beforeunload', () => {
  if (expertSidebarBadgesTimer) window.clearInterval(expertSidebarBadgesTimer);
});

async function refreshExpertSidebarBadges() {
  try {
    const expertId = await getExpertSidebarProfileId();
    if (!expertId) return;

    const res = await api.get(`/notifications/expert/${expertId}`);
    const notifications = Array.isArray(res.data) ? res.data : [];
    const chatCount = notifications.filter((item) => !item.is_read && item.type === 'unread_chat_message').length;
    const pendingCount = notifications.filter((item) => !item.is_read && item.type === 'new_pending_case').length;

    renderExpertSidebarBadge('[data-chat-badge]', chatCount);
    renderExpertSidebarBadge('[data-pending-badge]', pendingCount);
  } catch (error) {
    console.error('[ExpertSidebarBadges] failed:', error);
  }
}

function renderExpertSidebarBadge(selector, count) {
  document.querySelectorAll(selector).forEach((element) => {
    element.textContent = count;
    element.classList.toggle('hidden', count === 0);
  });
}

async function getExpertSidebarProfileId() {
  const cachedProfile = Auth.getProfile();
  if (cachedProfile?.id) return cachedProfile.id;

  try {
    const profile = (await api.get('/expert/profile')).data;
    if (profile) localStorage.setItem('plantdoc_profile', JSON.stringify(profile));
    return profile?.id || null;
  } catch (_) {
    return null;
  }
}
