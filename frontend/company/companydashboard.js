// companydashboard.js
document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth('company')) return;
  populateSidebarUser(); setupLogout();
  await Promise.all([loadStats(), loadRecentOrders()]);
  setupNotifBell();
});

async function loadStats() {
  try {
    const [listRes, ordRes, reqRes] = await Promise.all([
      api.get('/company/listings?limit=200'),
      api.get('/company/orders?limit=200'),
      api.get('/treatment-requests/pool?limit=1').catch(()=>({meta:{total:0},data:[]})),
    ]);
    const listings = listRes.data||[];
    const orders   = ordRes.data||[];
    const activeListings = listings.filter(l=>l.is_active).length;
    const pending   = orders.filter(o=>o.status==='pending').length;
    const completed = orders.filter(o=>o.status==='delivered').length;
    const revenue   = orders.filter(o=>o.status==='delivered').reduce((s,o)=>s+(o.total||0),0);

    setText('[data-stat="active-products"]',  activeListings);
    setText('[data-stat="pending-orders"]',   pending);
    setText('[data-stat="completed-orders"]', completed);
    setText('[data-stat="revenue"]',          `$${revenue.toFixed(2)}`);
    setText('[data-stat="treatment-requests"]', reqRes.meta?.total||0);
  } catch(e){ console.error(e); }
}

async function loadRecentOrders() {
  const tbody=document.querySelector('table tbody, [data-orders-table] tbody');
  if(!tbody) return;
  tbody.innerHTML=skeletonRows(3,5);
  try {
    const orders=(await api.get('/company/orders?limit=10')).data||[];
    if(!orders.length){tbody.innerHTML=`<tr><td colspan="5" class="px-6 py-8 text-center text-on-surface-variant text-sm">No orders yet</td></tr>`;return;}
    tbody.innerHTML=orders.map(o=>{
      const farmer=o.farmer_id||{};
      return `<tr class="hover:bg-surface-container-low/50 transition-colors cursor-pointer group" onclick="window.location.href='orders.html'">
        <td class="px-6 py-4 font-semibold text-primary">${o.order_code}</td>
        <td class="px-6 py-4 font-medium text-on-surface">${farmer.location||'Farmer'}</td>
        <td class="px-6 py-4">$${(o.total||0).toFixed(2)}</td>
        <td class="px-6 py-4">${formatDate(o.placed_at)}</td>
        <td class="px-6 py-4">${orderStatusBadge(o.status)}</td>
        <td class="px-6 py-4 text-right opacity-0 group-hover:opacity-100"><span class="material-symbols-outlined text-on-surface-variant">chevron_right</span></td>
      </tr>`;
    }).join('');
  } catch(e){tbody.innerHTML=`<tr><td colspan="5" class="px-6 py-6 text-center text-error text-sm">Failed to load orders</td></tr>`;}
}

async function setupNotifBell() {
  try {
    const res=await api.get('/notifications?is_read=false&limit=1');
    if((res.meta?.total||0)>0) document.querySelectorAll('[data-notif-dot]').forEach(el=>el.classList.remove('hidden'));
  }catch(_){}
}

const setText=(sel,val)=>document.querySelectorAll(sel).forEach(el=>el.textContent=val??'');
