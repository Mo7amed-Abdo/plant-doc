// deliverydashboard.js
document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth('delivery')) return;
  populateSidebarUser(); setupLogout();
  await Promise.all([loadStats(), loadRecentDeliveries()]);
});

async function loadStats() {
  try {
    const stats=(await api.get('/delivery/stats')).data||{};
    setText('[data-stat="active-deliveries"]',  stats.active||0);
    setText('[data-stat="completed-today"]',    stats.completed||0);
    setText('[data-stat="pending-orders"]',     stats.pending||0);
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
  return `<tr class="hover:bg-surface-container-low/50 transition-colors cursor-pointer group" data-view-del="${d._id}">
    <td class="px-6 py-4 font-semibold text-primary">${o.order_code||d._id?.slice(-8)}</td>
    <td class="px-6 py-4 text-on-surface-variant">${formatDate(o.placed_at||d.created_at)}</td>
    <td class="px-6 py-4">$${(o.total||0).toFixed(2)}</td>
    <td class="px-6 py-4">${deliveryStatusBadge(d.status)}</td>
    <td class="px-6 py-4 text-right opacity-0 group-hover:opacity-100"><span class="material-symbols-outlined text-on-surface-variant">chevron_right</span></td>
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
