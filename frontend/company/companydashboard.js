// companydashboard.js
document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth('company')) return;
  populateSidebarUser();
  setupLogout();
  await loadDashboard();
  setupNotifBell();
});

async function loadDashboard() {
  try {
    const d = (await api.get('/company/dashboard')).data;

    // Stat cards
    setText('[data-stat="active-products"]',      d.active_listings      ?? 0);
    setText('[data-stat="low-stock"]',            d.low_stock_count      ?? 0);
    setText('[data-stat="out-of-stock"]',         d.out_of_stock_count   ?? 0);
    setText('[data-stat="pending-orders"]',       d.pending_orders       ?? 0); // = treatment requests
    setText('[data-stat="active-orders"]',        d.active_orders        ?? 0);
    setText('[data-stat="completed-orders"]',     d.delivered_orders     ?? 0);
    setText('[data-stat="revenue"]',              `$${(d.revenue ?? 0).toFixed(2)}`);
    setText('[data-stat="unread-notifications"]', d.unread_notifications ?? 0);

    if ((d.unread_notifications ?? 0) > 0) {
      document.querySelectorAll('[data-notif-dot]').forEach(el => el.classList.remove('hidden'));
    }

    renderRecentOrders(d.recent_orders || []);
  } catch (e) {
    console.error('Dashboard load failed', e);
    showToast('Failed to load dashboard data', 'error');
  }
}

function renderRecentOrders(orders) {
  const tbody = document.querySelector('table tbody, [data-orders-table] tbody');
  if (!tbody) return;

  if (!orders.length) {
    tbody.innerHTML = `<tr>
      <td colspan="6" class="px-6 py-10 text-center text-on-surface-variant text-sm">No orders yet</td>
    </tr>`;
    return;
  }

  tbody.innerHTML = orders.map(o => {
    const farmer     = o.farmer_id || {};
    const farmerName = farmer.user_id?.full_name || farmer.location || 'Farmer';
    return `<tr class="hover:bg-surface-container-low/50 transition-colors cursor-pointer group"
                onclick="window.location.href='orders.html'">
      <td class="px-6 py-4 font-semibold text-primary">${o.order_code}</td>
      <td class="px-6 py-4 font-medium text-on-surface">${escapeHtml(farmerName)}</td>
      <td class="px-6 py-4 text-on-surface">$${(o.total || 0).toFixed(2)}</td>
      <td class="px-6 py-4 text-on-surface-variant">${formatDate(o.placed_at)}</td>
      <td class="px-6 py-4">${orderStatusBadge(o.status)}</td>
      <td class="px-6 py-4 text-right opacity-0 group-hover:opacity-100">
        <span class="material-symbols-outlined text-on-surface-variant">chevron_right</span>
      </td>
    </tr>`;
  }).join('');
}

async function setupNotifBell() {
  try {
    const res = await api.get('/notifications?is_read=false&limit=1');
    if ((res.meta?.total || 0) > 0) {
      document.querySelectorAll('[data-notif-dot]').forEach(el => el.classList.remove('hidden'));
    }
  } catch (_) {}
}

const setText = (sel, val) =>
  document.querySelectorAll(sel).forEach(el => (el.textContent = val ?? ''));