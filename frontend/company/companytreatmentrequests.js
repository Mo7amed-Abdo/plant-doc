// companytreatmentrequests.js
// The company sees treatment requests where farmers need products.
// These are farmers who went through expert review and the expert approved a treatment.
// Company sees them to know what products are being requested/needed.

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth('company')) return;
  populateSidebarUser(); setupLogout();
  await loadRequests();
});

async function loadRequests() {
  const grid=document.querySelector('[data-request-grid], main .grid');
  if(!grid) return;
  grid.innerHTML=skeletonCards(4);
  try {
    // Company sees approved treatment requests linked to their orders
    const res=await api.get('/company/orders?limit=50');
    const orders=(res.data||[]).filter(o=>o.related_treatment_request_id);
    // Also get all orders with treatment context
    const allOrders=res.data||[];
    if(!allOrders.length){grid.innerHTML=`<div class="col-span-full py-16 text-center"><span class="material-symbols-outlined text-5xl text-on-surface-variant/40 block mb-3">medical_services</span><p class="text-on-surface-variant">No treatment requests yet</p></div>`;return;}
    grid.innerHTML=allOrders.map(reqCard).join('');
    grid.querySelectorAll('[data-view-req]').forEach(btn=>btn.addEventListener('click',()=>viewReq(btn.dataset.viewReq)));
    grid.querySelectorAll('[data-update-status]').forEach(btn=>btn.addEventListener('click',()=>updateStatus(btn.dataset.updateStatus,btn.dataset.newStatus)));
  }catch(e){grid.innerHTML=`<div class="col-span-full py-8 text-center text-error text-sm">${e.message}</div>`;}
}

function reqCard(o) {
  return `<div class="bg-surface-container-lowest rounded-[16px] border border-surface-variant shadow-sm p-5 hover:shadow-md transition-all">
    <div class="flex items-start justify-between mb-4">
      <div class="flex items-center gap-3">
        <div class="w-12 h-12 rounded-xl bg-primary-fixed/20 text-primary flex items-center justify-center shrink-0"><span class="material-symbols-outlined fill">medical_services</span></div>
        <div><h3 class="font-bold text-on-surface">${o.order_code}</h3><p class="text-sm text-on-surface-variant">${formatDate(o.placed_at)}</p></div>
      </div>
      ${orderStatusBadge(o.status)}
    </div>
    <div class="bg-surface-container rounded-xl p-3 mb-4 flex justify-between">
      <span class="text-sm text-on-surface-variant">Order Total</span>
      <span class="text-sm font-bold text-on-surface">$${(o.total||0).toFixed(2)}</span>
    </div>
    <div class="flex gap-2">
      <button data-view-req="${o._id}" class="flex-1 py-2.5 border border-outline-variant rounded-xl text-sm font-medium text-on-surface hover:bg-surface-container flex items-center justify-center gap-1"><span class="material-symbols-outlined text-[16px]">visibility</span>Details</button>
      ${o.status==='pending'?`<button data-update-status="${o._id}" data-new-status="processing" class="flex-1 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-semibold hover:opacity-90 flex items-center justify-center gap-1"><span class="material-symbols-outlined text-[16px]">play_circle</span>Process</button>`:''}
      ${o.status==='processing'?`<button data-update-status="${o._id}" data-new-status="shipped" class="flex-1 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-semibold hover:opacity-90 flex items-center justify-center gap-1"><span class="material-symbols-outlined text-[16px]">local_shipping</span>Mark Shipped</button>`:''}
    </div>
  </div>`;
}

async function viewReq(orderId) {
  try {
    const {order,items}=(await api.get(`/company/orders/${orderId}`)).data;
    const m=document.createElement('div');
    m.className='fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 overflow-y-auto';
    m.innerHTML=`<div class="bg-surface rounded-2xl w-full max-w-lg shadow-xl my-auto">
      <div class="p-5 border-b border-surface-variant flex justify-between items-start">
        <div><h3 class="text-lg font-bold text-on-surface">${order.order_code}</h3><p class="text-sm text-on-surface-variant">${formatDate(order.placed_at)}</p></div>
        <div class="flex items-center gap-2">${orderStatusBadge(order.status)}<button onclick="this.closest('.fixed').remove()" class="text-on-surface-variant ml-2"><span class="material-symbols-outlined">close</span></button></div>
      </div>
      <div class="p-5 space-y-4">
        <div><p class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3">Items</p>
          <div class="space-y-2">${(items||[]).map(i=>`<div class="flex items-center gap-3 bg-surface-container rounded-xl p-3"><div class="flex-1"><p class="text-sm font-semibold text-on-surface">${i.product_name_snapshot}</p><p class="text-xs text-on-surface-variant">Qty: ${i.quantity}</p></div><span class="font-bold text-sm">$${(i.subtotal||0).toFixed(2)}</span></div>`).join('')}</div>
        </div>
        <div class="bg-surface-container rounded-xl p-4"><div class="flex justify-between"><span class="text-sm text-on-surface-variant">Total</span><span class="text-sm font-bold text-on-surface">$${(order.total||0).toFixed(2)}</span></div></div>
        <div class="flex gap-2">
          ${order.status==='pending'?`<button onclick="updateStatus('${order._id}','processing');this.closest('.fixed').remove();" class="flex-1 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-semibold">Process Order</button>`:''}
          ${order.status==='processing'?`<button onclick="updateStatus('${order._id}','shipped');this.closest('.fixed').remove();" class="flex-1 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-semibold">Mark as Shipped</button>`:''}
        </div>
      </div>
    </div>`;
    document.body.appendChild(m);
    m.addEventListener('click',e=>{if(e.target===m)m.remove();});
  }catch(e){showToast('Failed to load details','error');}
}

async function updateStatus(orderId, status) {
  try{
    await api.put(`/company/orders/${orderId}/status`,{status});
    showToast(`Order marked as ${status}`,'success');
    await loadRequests();
  }catch(err){showToast(err.message||'Failed','error');}
}
