// ordertracking.js
document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth('farmer')) return;
  populateSidebarUser(); setupLogout();
  await loadOrders();
});

async function loadOrders() {
  const con = document.querySelector('[data-orders-container], main .flex.flex-col, main');
  if (!con) return;
  con.innerHTML = skeletonCards(3);
  try {
    const orders = (await api.get('/orders?limit=50')).data || [];
    if (!orders.length) { con.innerHTML=`<div class="py-16 text-center"><span class="material-symbols-outlined text-5xl text-on-surface-variant/40 block mb-3">shopping_basket</span><p class="text-on-surface-variant font-medium">No orders yet</p><a href="treatmentsolutions.html" class="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-primary text-on-primary rounded-xl text-sm font-semibold">Browse Products</a></div>`; return; }
    con.innerHTML = orders.map(orderCard).join('');
    con.querySelectorAll('[data-view-order]').forEach(el => el.addEventListener('click', () => openOrderModal(el.dataset.viewOrder)));
  } catch(e) { con.innerHTML=`<div class="py-8 text-center text-error text-sm">${e.message}</div>`; }
}

function orderCard(o) {
  const co = o.company_id||{};
  const steps = ['pending','processing','shipped','on_the_way','arriving','delivered'];
  const ci = steps.indexOf(o.status);
  return `<div class="bg-surface-container-lowest rounded-[16px] border border-surface-variant shadow-sm p-5 hover:shadow-md transition-all cursor-pointer group" data-view-order="${o._id}">
    <div class="flex items-start justify-between gap-4">
      <div class="flex items-center gap-4">
        <div class="w-12 h-12 rounded-xl bg-primary-fixed/20 text-primary flex items-center justify-center shrink-0"><span class="material-symbols-outlined fill">shopping_basket</span></div>
        <div><p class="font-bold text-on-surface">${o.order_code}</p><p class="text-sm text-on-surface-variant mt-0.5">${co.name||'Company'} · ${formatDate(o.placed_at)}</p></div>
      </div>
      <div class="flex items-center gap-3">${orderStatusBadge(o.status)}<span class="font-bold text-on-surface">$${(o.total||0).toFixed(2)}</span><span class="material-symbols-outlined text-on-surface-variant group-hover:text-primary transition-colors">chevron_right</span></div>
    </div>
    <div class="mt-4 flex items-center gap-1">${steps.map((_,i)=>`<div class="flex-1 h-1.5 rounded-full ${i<=ci?'bg-primary':'bg-surface-variant'} transition-all"></div>`).join('')}</div>
    <div class="flex justify-between mt-1"><span class="text-[10px] text-on-surface-variant">Order Placed</span><span class="text-[10px] text-on-surface-variant">Delivered</span></div>
  </div>`;
}

async function openOrderModal(id) {
  try {
    const [oRes, dRes] = await Promise.allSettled([api.get(`/orders/${id}`), api.get(`/orders/${id}/delivery`)]);
    //////////console.log('Order:', oRes); console.log('Delivery:', dRes);
    const data = oRes.value?.data || {};
const order = data.order || data;
let items = data.items || order.items || [];
console.log("FULL RESPONSE:", oRes.value?.data);
console.log("ORDER DATA:", data);
console.log("ITEMS:", items);
    const delivery = dRes.status==='fulfilled'?dRes.value?.data:null;
    if (!order) { showToast('Failed to load order','error'); return; }
    const co=order.company_id||{}, addr=order.shipping_address||{};
    const m = document.createElement('div');
    m.className = 'fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 overflow-y-auto';
    m.innerHTML = `<div class="bg-surface rounded-2xl w-full max-w-2xl shadow-xl my-auto">
      <div class="p-5 border-b border-surface-variant flex items-start justify-between bg-surface-bright rounded-t-2xl">
        <div><p class="text-xs text-on-surface-variant mb-1">Order ID</p><h3 class="text-lg font-bold text-on-surface">${order.order_code}</h3><p class="text-sm text-on-surface-variant mt-0.5">${co.name||''} · ${formatDate(order.placed_at)}</p></div>
        <div class="flex items-center gap-2">${orderStatusBadge(order.status)}<button onclick="this.closest('.fixed').remove()" class="text-on-surface-variant hover:text-on-surface ml-2"><span class="material-symbols-outlined">close</span></button></div>
      </div>
      <div class="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
        ${delivery?deliveryTimeline(delivery):`<div class="bg-surface-container rounded-xl p-4 text-center"><p class="text-sm text-on-surface-variant">Delivery tracking not yet available</p></div>`}
        <div><p class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3">Items</p>
        
<div class="space-y-2">
  ${items && items.length ? items.map(i => {
    
    const price = i.unit_price || i.price || 0;
    const qty = i.quantity || 1;
    const total = i.subtotal || (price * qty);

    return `
    <div class="flex items-center gap-3 bg-surface-container rounded-xl p-3">

      <div class="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center shrink-0">
        <span class="material-symbols-outlined text-on-surface-variant text-[20px]">science</span>
      </div>

      <div class="flex-1">
        <p class="text-sm font-semibold text-on-surface">
          ${i.product_name_snapshot || i.name || 'Product'}
        </p>
        <p class="text-xs text-on-surface-variant">
          Qty: ${qty} × $${price.toFixed(2)}
        </p>
      </div>

      <span class="font-bold text-sm text-on-surface">
        $${total.toFixed(2)}
      </span>

    </div>
    `;
    
  }).join('') : `
    <div class="text-center py-6 text-slate-400">
      No item details available
    </div>
  `}
</div>        </div>
        <div class="bg-surface-container rounded-xl p-4 space-y-1"><p class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Shipping</p><p class="text-sm text-on-surface">${addr.street||'—'}</p><p class="text-sm text-on-surface-variant">${[addr.city,addr.state,addr.country].filter(Boolean).join(', ')}</p>${order.contact_phone?`<p class="text-sm text-on-surface-variant">${order.contact_phone}</p>`:''}</div>
        <div class="bg-surface-container rounded-xl p-4 space-y-2"><div class="flex justify-between"><span class="text-sm text-on-surface-variant">Subtotal</span><span class="text-sm font-semibold text-on-surface">$${(order.subtotal||0).toFixed(2)}</span></div><div class="flex justify-between border-t border-surface-variant pt-2"><span class="text-sm font-bold text-on-surface">Total</span><span class="text-sm font-bold text-on-surface">$${(order.total||0).toFixed(2)}</span></div></div>
        ${order.status==='delivered'?`<button onclick="openRating('${order._id}','${order.company_id?._id||order.company_id}');this.closest('.fixed').remove();" class="w-full py-2.5 border border-outline-variant rounded-xl text-sm font-medium text-on-surface hover:bg-surface-container flex items-center justify-center gap-2"><span class="material-symbols-outlined text-[18px]">star</span>Rate this order</button>`:''}
      </div>
    </div>`;
    document.body.appendChild(m);
    m.addEventListener('click', e=>{if(e.target===m)m.remove();});
  } catch(e) { showToast('Failed to load order','error'); }
}

function deliveryTimeline(d) {
  const steps = [{key:'order_received',label:'Order Received'},{key:'picked_up',label:'Picked Up'},{key:'in_transit',label:'In Transit'},{key:'arrived',label:'Arrived'},{key:'delivered',label:'Delivered'}];
  const done = new Set((d.status_timeline||[]).map(t=>t.step));
  return `<div><p class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-4">Delivery Tracking</p>
    <div class="relative pl-8 space-y-4"><div class="absolute left-3 top-2 bottom-2 w-0.5 bg-surface-variant"></div>
    ${steps.map(s=>{const ev=(d.status_timeline||[]).find(t=>t.step===s.key);const isDone=done.has(s.key);return `<div class="relative flex items-start gap-3"><div class="absolute -left-5 w-4 h-4 rounded-full flex items-center justify-center ${isDone?'bg-primary':'bg-surface-variant border-2 border-surface-container-lowest'} shrink-0 mt-0.5 z-10">${isDone?`<span class="material-symbols-outlined text-on-primary" style="font-size:10px">check</span>`:''}</div><div><p class="text-sm font-${isDone?'semibold':'normal'} text-${isDone?'on-surface':'on-surface-variant/50'}">${s.label}</p>${ev?`<p class="text-xs text-on-surface-variant">${formatDateTime(ev.occurred_at)}${ev.note?' · '+ev.note:''}</p>`:''}</div></div>`;}).join('')}
    </div></div>`;
}

async function openRating(orderId, companyId) {
  const m = document.createElement('div');
  m.className = 'fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4';
  let stars = 0;
  m.innerHTML = `<div class="bg-surface rounded-2xl p-6 w-full max-w-sm shadow-xl">
    <h3 class="text-lg font-bold text-on-surface mb-4">Rate Your Order</h3>
    <div class="flex gap-2 mb-4" id="rating-stars">${[1,2,3,4,5].map(i=>`<button data-s="${i}" class="star-btn text-3xl text-surface-variant hover:text-primary transition-colors">★</button>`).join('')}</div>
    <textarea id="rating-review" rows="3" placeholder="Optional review…" class="w-full px-4 py-3 border border-outline-variant rounded-xl text-sm focus:ring-1 focus:ring-primary resize-none bg-surface-container-lowest mb-4"></textarea>
    <div class="flex gap-3"><button onclick="this.closest('.fixed').remove()" class="flex-1 py-2.5 border border-outline-variant rounded-xl text-sm font-medium text-on-surface-variant">Cancel</button><button id="rate-btn" class="flex-1 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-semibold">Submit</button></div>
  </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e=>{if(e.target===m)m.remove();});
  m.querySelectorAll('.star-btn').forEach(btn => btn.addEventListener('click', () => {
    stars = parseInt(btn.dataset.s);
    m.querySelectorAll('.star-btn').forEach((b,i) => b.style.color = i<stars?'#006a39':'');
  }));
  m.querySelector('#rate-btn').addEventListener('click', async () => {
    if (!stars) { showToast('Select a star rating','error'); return; }
    try {
      await api.post(`/orders/${orderId}/ratings`,{target_type:'company',target_id:companyId,stars,review:m.querySelector('#rating-review').value.trim()||null});
      m.remove(); showToast('Rating submitted!','success');
    } catch(err) { showToast(err.message||'Failed','error'); }
  });
}
