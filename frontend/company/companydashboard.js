// companydashboard.js

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth('company')) return;
  populateSidebarUser();
  setupLogout();
  setupDashboardNotifications();
  setupExportReport();
  await loadDashboard();
  await loadDashboardNotifications({ initial: true });
  connectDashboardNotificationSocket();
  startDashboardNotificationPolling();
});

let _lastDashboardData = null;

// Notifications (copied from Products page behavior)
const DASHBOARD_NOTIFICATION_POLL_MS = 30000;
let _dashboardNotifications = [];
let _dashboardNotificationSocket = null;
let _dashboardNotificationPollHandle = null;
let _dashboardNotificationSeenIds = new Set();
let _hasPromptedForBrowserNotifications = false;

// ─── Main loader ──────────────────────────────────────────────────────────────

async function loadDashboard() {
  try {
    // Single endpoint returns everything in one round-trip
    const d = (await api.get('/company/dashboard')).data;
    _lastDashboardData = d;

    renderStatCards(d);
    renderRecentOrders(d.recent_orders || []);
    renderInventoryAlerts(d.low_stock_listings || [], d.out_of_stock_listings || []);
    renderMonthlyRates(d);

  } catch (e) {
    console.error('[dashboard] load failed:', e);
    showToast('Failed to load dashboard data', 'error');

    // Show error state in the table
    const tbody = document.querySelector('[data-activity-table]');
    if (tbody) {
      tbody.innerHTML = `<tr>
        <td colspan="5" class="px-6 py-8 text-center text-error text-sm">
          ${e?.message || 'Failed to load recent orders'}
        </td>
      </tr>`;
    }
    const alertsGrid = document.querySelector('[data-alerts-grid]');
    if (alertsGrid) alertsGrid.innerHTML = `<p class="text-xs text-error text-center py-2">Failed to load alerts</p>`;
  }
}

// ─── Stat cards ───────────────────────────────────────────────────────────────

function setupExportReport() {
  const btn = document.querySelector('[data-export-report]');
  if (!btn || btn.dataset.bound === '1') return;
  btn.dataset.bound = '1';

  btn.addEventListener('click', async () => {
    setBtnLoading(btn, true, 'Exporting...');
    try {
      if (!_lastDashboardData) {
        const d = (await api.get('/company/dashboard')).data;
        _lastDashboardData = d;
      }

      const csv = buildDashboardCsv(_lastDashboardData);
      const date = new Date().toISOString().slice(0, 10);
      downloadTextFile(`plantdoc-dashboard-report-${date}.csv`, csv, 'text/csv;charset=utf-8');
      showToast('Report downloaded', 'success');
    } catch (err) {
      console.error('[dashboard.export] failed:', err);
      showToast(err.message || 'Failed to export report', 'error');
    } finally {
      setBtnLoading(btn, false, 'Export Report');
    }
  });
}

function buildDashboardCsv(d) {
  const user = (typeof Auth !== 'undefined' && Auth.getUser) ? Auth.getUser() : null;
  const profile = (typeof Auth !== 'undefined' && Auth.getProfile) ? Auth.getProfile() : null;
  const companyName = profile?.company_name || user?.full_name || 'Company';
  const nowIso = new Date().toISOString();

  const rows = [];
  const pushRow = (...cols) => rows.push(cols.map(csvCell).join(','));

  pushRow('PlantDoc Dashboard Report');
  pushRow('Generated At', nowIso);
  pushRow('Role', 'company');
  pushRow('Company', companyName);
  pushRow('');

  pushRow('Stats');
  pushRow('Active Products', d.active_listings ?? 0);
  pushRow('Pending Orders', d.pending_orders ?? 0);
  pushRow('Delivered Orders', d.delivered_orders ?? 0);
  pushRow('Revenue', (typeof d.revenue === 'number') ? `$${d.revenue.toFixed(2)}` : (d.revenue ?? 0));
  pushRow('');

  const rates = computeRates(d);
  pushRow('This Month Rates');
  pushRow('Acceptance Rate', rates.acceptancePct == null ? '' : `${rates.acceptancePct}%`);
  pushRow('Fulfillment Rate', rates.fulfillmentPct == null ? '' : `${rates.fulfillmentPct}%`);
  pushRow('Cancellation Rate', rates.cancellationPct == null ? '' : `${rates.cancellationPct}%`);
  pushRow('');

  pushRow('Recent Orders');
  pushRow('Order Code', 'Farmer', 'Total', 'Date', 'Status');
  (d.recent_orders || []).forEach((o) => {
    const farmer = o.farmer_id || {};
    const farmerName = farmer.user_id?.full_name || farmer.location || 'Farmer';
    const total = o.total_amount != null ? o.total_amount : (o.total ?? '');
    pushRow(o.order_code || '', farmerName, total, o.created_at || o.date || '', o.status || '');
  });
  pushRow('');

  pushRow('Inventory Alerts');
  pushRow('Level', 'Product', 'Stock Quantity');
  (d.out_of_stock_listings || []).forEach((l) => {
    pushRow('out_of_stock', l.product_id?.name || 'Product', l.stock_quantity ?? 0);
  });
  (d.low_stock_listings || []).forEach((l) => {
    pushRow('low_stock', l.product_id?.name || 'Product', l.stock_quantity ?? 0);
  });

  return rows.join('\n');
}

function computeRates(d) {
  const pending   = d.pending_orders   || 0;
  const active    = d.active_orders    || 0;
  const delivered = d.delivered_orders || 0;
  const cancelled = d.cancelled_orders || 0;
  const decided   = active + delivered + cancelled;
  const total     = pending + decided;

  const acceptancePct = total > 0 ? Math.round((decided / total) * 100) : null;
  const accepted = active + delivered;
  const fulfillmentPct = accepted > 0 ? Math.round((delivered / accepted) * 100) : null;
  const cancellationPct = decided > 0 ? Math.round((cancelled / decided) * 100) : null;
  return { acceptancePct, fulfillmentPct, cancellationPct };
}

function csvCell(value) {
  const v = value == null ? '' : String(value);
  if (/[\",\\n]/.test(v)) return `\"${v.replace(/\"/g, '\"\"')}\"`;
  return v;
}

function downloadTextFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function setBtnLoading(btn, on, label) {
  if (!btn) return;
  btn.disabled = on;
  btn.innerHTML = on
    ? `<span class="material-symbols-outlined text-[18px] animate-spin">autorenew</span> ${label || 'Working...'}`
    : `<span class="material-symbols-outlined text-[18px]">download</span> ${label || 'Export Report'}`;
}

function setupDashboardNotifications() {
  const toggle = document.querySelector('[data-notif-toggle]');
  const dropdown = document.querySelector('[data-notif-dropdown]');
  const markAllBtn = document.querySelector('[data-mark-all-read]');
  const retryBtn = document.querySelector('[data-notif-retry]');
  if (!toggle || !dropdown) return;

  const positionDropdown = () => {
    const rect = toggle.getBoundingClientRect();
    const width = 360;
    let left = rect.right - width;
    left = Math.max(16, Math.min(left, window.innerWidth - width - 16));
    dropdown.style.top = `${rect.bottom + 10}px`;
    dropdown.style.left = `${left}px`;
  };

  toggle.addEventListener('click', async (event) => {
    event.stopPropagation();
    positionDropdown();
    dropdown.classList.toggle('hidden');
    if (!dropdown.classList.contains('hidden')) {
      await maybePromptForBrowserNotifications();
      if (!_dashboardNotifications.length) await loadDashboardNotifications();
    }
  });

  markAllBtn?.addEventListener('click', async (event) => {
    event.stopPropagation();
    await markAllDashboardNotificationsRead();
  });

  retryBtn?.addEventListener('click', async (event) => {
    event.stopPropagation();
    await loadDashboardNotifications();
  });

  document.addEventListener('click', (event) => {
    if (dropdown.contains(event.target) || toggle.contains(event.target)) return;
    dropdown.classList.add('hidden');
  });

  window.addEventListener('resize', () => {
    if (!dropdown.classList.contains('hidden')) positionDropdown();
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      loadDashboardNotifications({ silent: true }).catch(() => null);
    }
  });
}

async function loadDashboardNotifications(options = {}) {
  const { initial = false, silent = false } = options;
  const list = document.querySelector('[data-notif-list]');
  const errorWrap = document.querySelector('[data-notif-error-wrap]');
  const errorText = document.querySelector('[data-notif-error]');

  if (!silent && list) {
    list.innerHTML = '<div class="py-10 text-center text-sm text-on-surface-variant">Loading notifications...</div>';
  }
  if (errorWrap) errorWrap.classList.add('hidden');

  try {
    const res = await api.get('/notifications?limit=20');
    const items = dedupeById((res.data || []).map(normalizeDashboardNotification));
    const previousIds = new Set(_dashboardNotificationSeenIds);
    _dashboardNotifications = items;

    if (initial) {
      _dashboardNotificationSeenIds = new Set(items.map((item) => item._id));
    } else {
      items.forEach((item) => {
        if (!previousIds.has(item._id)) notifyAboutIncomingDashboardNotification(item);
        _dashboardNotificationSeenIds.add(item._id);
      });
    }

    renderDashboardNotifications();
    updateDashboardNotificationBadge();
  } catch (error) {
    if (errorWrap && errorText) {
      errorText.textContent = error?.message || 'Failed to load notifications.';
      errorWrap.classList.remove('hidden');
    }
    if (!_dashboardNotifications.length && list) {
      list.innerHTML = '<div class="py-10 text-center text-sm text-error">Failed to load notifications.</div>';
    }
  }
}

function renderDashboardNotifications() {
  const list = document.querySelector('[data-notif-list]');
  const status = document.querySelector('[data-notif-status]');
  if (!list) return;

  if (status) {
    const live = !!(_dashboardNotificationSocket && _dashboardNotificationSocket.connected);
    status.className = 'px-5 py-3 border-b border-surface-variant text-xs';
    status.innerHTML = live
      ? '<span class="font-semibold text-primary">Live updates connected</span>'
      : '<span class="font-semibold text-on-surface-variant">Using automatic refresh</span>';
    status.classList.remove('hidden');
  }

  if (!_dashboardNotifications.length) {
    list.innerHTML = `
      <div class="flex flex-col items-center justify-center py-12 text-center gap-3">
        <div class="w-16 h-16 rounded-full bg-surface-container border border-surface-variant flex items-center justify-center">
          <span class="material-symbols-outlined text-[30px] text-on-surface-variant/40">notifications_off</span>
        </div>
        <div>
          <p class="font-semibold text-slate-600 text-sm">No notifications</p>
          <p class="text-xs text-slate-400 mt-1">You are all caught up.</p>
        </div>
      </div>`;
    return;
  }

  list.innerHTML = _dashboardNotifications.map(dashboardNotificationCard).join('');
  list.querySelectorAll('[data-dashboard-notification-id]').forEach((element) => {
    element.addEventListener('click', async () => {
      const notification = _dashboardNotifications.find((item) => item._id === element.dataset.dashboardNotificationId);
      if (!notification) return;
      await openDashboardNotification(notification);
    });
  });
}

function dashboardNotificationCard(notification) {
  const unread = !notification.is_read;
  const style = getDashboardNotificationStyle(notification.type);
  return `<button type="button" data-dashboard-notification-id="${notification._id}"
    class="w-full text-left relative flex items-start gap-4 px-4 py-4 bg-white rounded-2xl border ${unread ? 'border-green-100 bg-green-50/30' : 'border-slate-100'} shadow-sm hover:bg-slate-50 transition-colors">
    ${unread ? '<div class="absolute left-0 top-0 bottom-0 w-[3px] bg-primary rounded-l-2xl"></div>' : ''}
    <div class="w-11 h-11 rounded-full ${style.bg} border ${style.ring} flex items-center justify-center shrink-0">
      <span class="material-symbols-outlined fill ${style.color} text-[20px]">${style.icon}</span>
    </div>
    <div class="flex-1 min-w-0">
      <div class="flex items-start justify-between gap-3">
        <p class="text-sm font-bold text-on-surface leading-snug">${_esc(notification.title || 'Notification')}</p>
        <div class="flex items-center gap-2 shrink-0">
          <span class="text-[11px] font-medium text-slate-400 whitespace-nowrap">${timeAgo(notification.created_at)}</span>
          ${unread ? '<div class="w-2 h-2 bg-primary rounded-full shrink-0 mt-0.5"></div>' : ''}
        </div>
      </div>
      <p class="text-sm text-slate-500 mt-0.5 leading-relaxed">${_esc(notification.body || notification.message || '')}</p>
    </div>
  </button>`;
}

function getDashboardNotificationStyle(type) {
  const styles = {
    new_order: { icon: 'shopping_basket', bg: 'bg-blue-50', color: 'text-blue-600', ring: 'border-blue-100' },
    low_stock: { icon: 'inventory_2', bg: 'bg-amber-50', color: 'text-amber-600', ring: 'border-amber-100' },
    order_status: { icon: 'local_shipping', bg: 'bg-violet-50', color: 'text-violet-600', ring: 'border-violet-100' },
  };
  return styles[type] || { icon: 'notifications', bg: 'bg-slate-50', color: 'text-slate-500', ring: 'border-slate-200' };
}

function updateDashboardNotificationBadge() {
  const unreadCount = _dashboardNotifications.filter((item) => !item.is_read).length;
  document.querySelectorAll('[data-notif-count]').forEach((element) => {
    element.textContent = unreadCount > 99 ? '99+' : unreadCount;
    element.classList.toggle('hidden', unreadCount === 0);
  });
}

async function openDashboardNotification(notification) {
  if (!notification.is_read) await markDashboardNotificationRead(notification._id);
  const link = dashboardNotificationLink(notification);
  if (link) window.location.href = link;
}

function dashboardNotificationLink(notification) {
  if (notification.related_type === 'order') return '/frontend/company/orders.html';
  if (notification.related_type === 'product_listing') return '/frontend/company/products.html';
  return '';
}

async function markDashboardNotificationRead(notificationId) {
  try {
    await api.patch(`/notifications/${notificationId}/read`, {});
    const target = _dashboardNotifications.find((item) => item._id === notificationId);
    if (target) target.is_read = true;
    renderDashboardNotifications();
    updateDashboardNotificationBadge();
  } catch (error) {
    console.error('[dashboard] mark notification failed:', error);
  }
}

async function markAllDashboardNotificationsRead() {
  try {
    await api.put('/notifications/read-all');
    _dashboardNotifications.forEach((item) => { item.is_read = true; });
    renderDashboardNotifications();
    updateDashboardNotificationBadge();
    showToast('All notifications marked as read', 'success');
  } catch (error) {
    showToast(error?.message || 'Failed to mark notifications as read', 'error');
  }
}

function connectDashboardNotificationSocket() {
  if (typeof io === 'undefined') return;
  _dashboardNotificationSocket = io('http://localhost:5000', { auth: { token: Auth.getToken() } });
  _dashboardNotificationSocket.on('connect', () => renderDashboardNotifications());
  _dashboardNotificationSocket.on('disconnect', () => renderDashboardNotifications());
  _dashboardNotificationSocket.on('notification:new', (notification) => {
    const normalized = normalizeDashboardNotification(notification);
    if (_dashboardNotifications.some((item) => item._id === normalized._id)) return;
    _dashboardNotifications.unshift(normalized);
    _dashboardNotifications = dedupeById(_dashboardNotifications);
    _dashboardNotificationSeenIds.add(normalized._id);
    renderDashboardNotifications();
    updateDashboardNotificationBadge();
    notifyAboutIncomingDashboardNotification(normalized);
  });
  _dashboardNotificationSocket.on('error', ({ message }) => {
    console.error('[dashboard][socket]', message);
  });
}

function startDashboardNotificationPolling() {
  clearInterval(_dashboardNotificationPollHandle);
  _dashboardNotificationPollHandle = setInterval(() => {
    loadDashboardNotifications({ silent: true }).catch(() => null);
  }, DASHBOARD_NOTIFICATION_POLL_MS);
}

function normalizeDashboardNotification(notification) {
  return {
    ...notification,
    _id: notification._id || notification.id,
    is_read: notification.is_read ?? notification.isRead ?? false,
    created_at: notification.created_at || notification.createdAt || new Date().toISOString(),
  };
}

function dedupeById(items) {
  const seen = new Set();
  return (items || []).filter((item) => {
    const id = item?._id || item?.id;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function notifyAboutIncomingDashboardNotification(notification) {
  if (typeof playNotificationTone === 'function') playNotificationTone();
  showToast(notification.title || 'New notification', 'info');
  showBrowserNotification(notification);
}

async function maybePromptForBrowserNotifications() {
  if (_hasPromptedForBrowserNotifications) return;
  _hasPromptedForBrowserNotifications = true;
  if (typeof Notification === 'undefined' || Notification.permission !== 'default') return;
  try {
    await Notification.requestPermission();
  } catch (_) {
    // Ignore permission errors
  }
}

function showBrowserNotification(notification) {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  if (!document.hidden) return;
  try {
    const browserNotification = new Notification(notification.title || 'PlantDoc notification', {
      body: notification.body || notification.message || '',
      tag: `plantdoc-${notification._id}`,
    });
    browserNotification.onclick = () => {
      window.focus();
      const link = dashboardNotificationLink(notification);
      if (link) window.location.href = link;
      browserNotification.close();
    };
  } catch (_) {
    // Ignore browser notification failures
  }
}

function _esc(str) {
  if (typeof escapeHtml === 'function') return escapeHtml(str);
  return String(str ?? '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/\"/g,'&quot;');
}

function renderStatCards(d) {
  setText('[data-stat="active-products"]',   d.active_listings      ?? 0);
  // HTML uses data-stat="pending-orders" (fixed from "treatment-requests")
  setText('[data-stat="pending-orders"]',    d.pending_orders       ?? 0);
  setText('[data-stat="completed-orders"]',  d.delivered_orders     ?? 0);
  setText('[data-stat="revenue"]',           `$${(d.revenue ?? 0).toFixed(2)}`);
}

// ─── Recent orders table ──────────────────────────────────────────────────────
// Columns: Order ID | Farmer | Total | Date | Status  (matches HTML headers)

function renderRecentOrders(orders) {
  // Fix: HTML uses data-activity-table on <tbody>, not data-orders-table
  const tbody = document.querySelector('[data-activity-table]');
  if (!tbody) return;

  if (!orders.length) {
    tbody.innerHTML = `<tr>
      <td colspan="5" class="px-6 py-10 text-center text-on-surface-variant text-sm">
        <div class="flex flex-col items-center gap-2">
          <span class="material-symbols-outlined text-3xl opacity-30">receipt_long</span>
          <span>No orders yet</span>
        </div>
      </td>
    </tr>`;
    return;
  }

  tbody.innerHTML = orders.map(o => {
    const farmer     = o.farmer_id || {};
    const farmerName = farmer.user_id?.full_name || farmer.location || 'Farmer';
    const initials   = farmerName.substring(0, 2).toUpperCase();

    return `
      <tr class="hover:bg-surface-container-low/50 transition-colors cursor-pointer group"
          onclick="window.location.href='orders.html'">

        <!-- Order ID -->
        <td class="px-6 py-4">
          <span class="font-semibold text-primary tracking-wide text-sm">${_esc(o.order_code)}</span>
        </td>

        <!-- Farmer -->
        <td class="px-6 py-4">
          <div class="flex items-center gap-2.5">
            <div class="w-7 h-7 rounded-full bg-primary-fixed/20 text-primary font-bold text-xs
                        flex items-center justify-center shrink-0">
              ${initials}
            </div>
            <span class="font-medium text-on-surface text-sm truncate max-w-[130px]">
              ${_esc(farmerName)}
            </span>
          </div>
        </td>

        <!-- Total (hidden on small screens) -->
        <td class="px-6 py-4 hidden sm:table-cell font-semibold text-on-surface text-sm">
          $${(o.total || 0).toFixed(2)}
        </td>

        <!-- Date (hidden on small screens) -->
        <td class="px-6 py-4 hidden md:table-cell text-on-surface-variant text-sm">
          ${formatDate(o.placed_at)}
        </td>

        <!-- Status -->
        <td class="px-6 py-4">
          ${orderStatusBadge(o.status)}
        </td>
      </tr>`;
  }).join('');
}

// ─── Inventory alerts ─────────────────────────────────────────────────────────

function renderInventoryAlerts(lowStock, outOfStock) {
  const grid = document.querySelector('[data-alerts-grid]');
  if (!grid) return;

  // The dashboard endpoint returns stats counts; for the alerts panel we
  // need the actual listing names. If the backend doesn't return them yet,
  // we fall back to a summary alert using the counts.
  const alerts = [];

  // Build from enriched arrays if provided by backend
  [...(outOfStock || [])].forEach(l => {
    const name = l.product_id?.name || 'Product';
    alerts.push({ level: 'error', icon: 'remove_shopping_cart', label: _esc(name), note: 'Out of stock' });
  });
  [...(lowStock || [])].forEach(l => {
    const name = l.product_id?.name || 'Product';
    alerts.push({ level: 'warning', icon: 'warning', label: _esc(name), note: `${l.stock_quantity} remaining` });
  });

  if (!alerts.length) {
    grid.innerHTML = `
      <div class="flex flex-col items-center gap-2 py-6 text-center">
        <span class="material-symbols-outlined text-3xl text-primary/40">inventory</span>
        <p class="text-sm text-on-surface-variant">All products are well-stocked</p>
      </div>`;
    return;
  }

  const colorMap = {
    error:   { bg: 'bg-error-container',   text: 'text-on-error-container',   icon: 'text-error' },
    warning: { bg: 'bg-tertiary-fixed/30', text: 'text-on-surface',            icon: 'text-tertiary' },
  };

  grid.innerHTML = alerts.slice(0, 5).map(a => {
    const c = colorMap[a.level] || colorMap.warning;
    return `
      <div class="flex items-center gap-3 p-3 rounded-xl ${c.bg}">
        <span class="material-symbols-outlined text-[20px] shrink-0 ${c.icon}">${a.icon}</span>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-semibold ${c.text} truncate">${a.label}</p>
          <p class="text-xs ${c.text} opacity-70">${a.note}</p>
        </div>
      </div>`;
  }).join('');

  if (alerts.length > 5) {
    grid.innerHTML += `
      <p class="text-xs text-center text-on-surface-variant pt-1">
        +${alerts.length - 5} more — <a href="products.html" class="text-primary underline">view all</a>
      </p>`;
  }
}

// ─── This Month dynamic rates ─────────────────────────────────────────────────

function renderMonthlyRates(d) {
  const pending   = d.pending_orders      || 0;
  const active    = d.active_orders       || 0;   // processing/shipped/on_the_way
  const delivered = d.delivered_orders    || 0;
  const cancelled = d.cancelled_orders    || 0;   // backend should include this

  // Total orders ever touched (excluding still-pending)
  const decided   = active + delivered + cancelled;
  const total     = pending + decided;

  // Acceptance rate = orders that got accepted (past pending) / all orders received
  const acceptancePct = total > 0
    ? Math.round(((decided) / total) * 100)
    : null;

  // Fulfillment rate = delivered / accepted (non-pending, non-cancelled)
  const accepted      = active + delivered;
  const fulfillmentPct = accepted > 0
    ? Math.round((delivered / accepted) * 100)
    : null;

  // Cancellation rate = cancelled / decided
  const cancellationPct = decided > 0
    ? Math.round((cancelled / decided) * 100)
    : null;

  setRate('acceptance-rate',   acceptancePct);
  setRate('fulfillment-rate',  fulfillmentPct);
  setRate('cancellation-rate', cancellationPct);
}

function setRate(key, pct) {
  const label = document.querySelector(`[data-stat="${key}"]`);
  const bar   = document.querySelector(`[data-bar="${key}"]`);
  const display = pct === null ? '—' : `${pct}%`;
  if (label) label.textContent = display;
  if (bar)   bar.style.width   = pct === null ? '0%' : `${Math.min(pct, 100)}%`;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function _esc(str) {
  if (typeof escapeHtml === 'function') return escapeHtml(str);
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const setText = (sel, val) =>
  document.querySelectorAll(sel).forEach(el => (el.textContent = val ?? ''));
