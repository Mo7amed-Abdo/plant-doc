// deliverydashboard.js
document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth('delivery')) return;
  populateSidebarUser(); setupLogout();
  await Promise.all([loadStats(), loadRecentDeliveries(), loadRecentAlerts()]);
});

async function loadStats() {
  try {
    const stats=(await api.get('/delivery/stats')).data||{};
    setText('[data-stat="active-deliveries"]',  stats.active||0);
    setText('[data-stat="completed-today"]',    stats.completed||0);
    setText('[data-stat="pending-orders"]',     stats.failed||0);
    setText('[data-stat="total-weekly"]',       stats.weekly||0);
  }catch(e){console.error(e);}
}

async function loadRecentDeliveries() {
  const tbody=document.querySelector('table tbody,[data-deliveries-table] tbody');
  const con=document.querySelector('[data-deliveries-list]');
  if(!tbody&&!con) return;
  if(tbody) tbody.innerHTML=skeletonRows(4,5);
  try {
    const items=(await api.get('/delivery/orders?limit=10')).data||[];
    if(!items.length){
      const empty=`<tr><td colspan="5" class="px-6 py-8 text-center text-on-surface-variant text-sm">No deliveries yet</td></tr>`;
      if(tbody)tbody.innerHTML=empty; return;
    }
    if(tbody) {
      tbody.innerHTML=items.map(delRow).join('');
      tbody.querySelectorAll('[data-view-del]').forEach(btn=>btn.addEventListener('click',()=>window.location.href='activedelivery.html'));
    }
    if(con) { con.innerHTML=items.slice(0,5).map(delCard).join(''); }
  }catch(e){if(tbody)tbody.innerHTML=`<tr><td colspan="5" class="px-6 py-6 text-center text-error text-sm">${e.message}</td></tr>`;}
}

function delRow(d) {
  const o=d.order_id||{};
  const farmer = o.farmer_id || {};
  const farmerName = farmer.user_id?.full_name || farmer.location || 'Farmer';
  const addr = o.shipping_address || {};
  return `<tr class="hover:bg-surface-container-low/50 transition-colors cursor-pointer group" data-view-del="${d._id}">
    <td class="px-6 py-4 font-semibold text-primary">${o.order_code||d._id?.slice(-8)}</td>
    <td class="px-6 py-4 text-on-surface-variant">${farmerName}</td>
    <td class="px-6 py-4 text-on-surface-variant hidden sm:table-cell">${[addr.city, addr.country].filter(Boolean).join(', ') || '—'}</td>
    <td class="px-6 py-4 text-on-surface-variant hidden md:table-cell">${formatDate(d.eta || o.estimated_delivery_at || d.created_at)}</td>
    <td class="px-6 py-4 text-right">${deliveryStatusBadge(d.status)}</td>
  </tr>`;
}

function delCard(d) {
  const o=d.order_id||{};
  return `<div class="flex items-center justify-between p-4 bg-surface-container-lowest rounded-xl border border-surface-variant hover:shadow-sm transition-all cursor-pointer" onclick="window.location.href='activedelivery.html'">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-xl bg-primary-fixed/20 text-primary flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-[18px]">local_shipping</span></div>
      <div><p class="font-semibold text-on-surface text-sm">${o.order_code||'Delivery'}</p><p class="text-xs text-on-surface-variant">${formatDate(o.placed_at||d.created_at)}</p></div>
    </div>
    ${deliveryStatusBadge(d.status)}
  </div>`;
}

const setText=(sel,val)=>document.querySelectorAll(sel).forEach(el=>el.textContent=val??'');

async function loadRecentAlerts() {
  const grid = document.querySelector('[data-alerts-grid]');
  if (!grid) return;

  grid.innerHTML = `<p class="text-xs text-center text-on-surface-variant">Loading alerts...</p>`;

  try {
    const items = (await api.get('/delivery/notifications?limit=3')).data || [];
    if (!items.length) {
      grid.innerHTML = `<p class="text-xs text-center text-on-surface-variant">No recent alerts</p>`;
      return;
    }

    grid.innerHTML = items.slice(0, 3).map(alertCard).join('');
  } catch (e) {
    console.error(e);
    grid.innerHTML = `<p class="text-xs text-center text-error">Failed to load alerts</p>`;
  }
}

function alertCard(n) {
  const kind = normalizeAlertType(n?.type);
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

  const icon = iconMap[kind] || iconMap.system;
  const tone = toneMap[kind] || toneMap.system;
  const title = escapeHtml(n?.title || 'Alert');
  const body = escapeHtml(n?.body || '');
  const when = timeAgo(n?.created_at);

  return `<div class="flex items-start gap-3 p-3 rounded-xl border border-surface-variant bg-surface-container-lowest hover:bg-surface-container-low/50 transition-colors">
    <div class="w-8 h-8 rounded-full ${tone} flex items-center justify-center shrink-0">
      <span class="material-symbols-outlined fill text-[18px]">${icon}</span>
    </div>
    <div class="min-w-0 flex-1">
      <div class="flex items-start justify-between gap-2 mb-0.5">
        <p class="text-xs font-semibold text-on-surface truncate">${title}</p>
        <span class="text-[10px] text-on-surface-variant whitespace-nowrap">${when}</span>
      </div>
      <p class="text-xs text-on-surface-variant leading-relaxed" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${body}</p>
    </div>
  </div>`;
}

function normalizeAlertType(type) {
  if (!type) return 'system';
  if (type === 'new_order') return 'delivery_assigned';
  if (type === 'order_update') return 'delivery_update';
  return type;
}
