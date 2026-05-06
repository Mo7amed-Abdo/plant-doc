// activedelivery.js
document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth('delivery')) return;
  populateSidebarUser(); setupLogout();
  await loadActiveOrders();
});

async function loadActiveOrders() {
  const con = document.querySelector('[data-deliveries-grid]');
  if (!con) return;
  con.innerHTML = skeletonCards(4);
  try {
    const items = (await api.get('/delivery/orders/active?limit=50')).data || [];
    if (!items.length) {
      con.innerHTML = `<div class="col-span-full py-16 text-center"><span class="material-symbols-outlined text-5xl text-on-surface-variant/40 block mb-3">local_shipping</span><p class="text-on-surface-variant font-medium">No active deliveries right now</p><p class="text-xs text-on-surface-variant/70 mt-1">New deliveries appear here once sellers mark orders as shipped</p></div>`;
      return;
    }
    renderCards(items, con);
  } catch (e) {
    con.innerHTML = `<div class="col-span-full py-8 text-center text-error text-sm">${e.message}</div>`;
  }
}

function renderCards(items, con) {
  con.innerHTML = items.map(deliveryCard).join('');
  con.querySelectorAll('.order-card[data-delivery-id]').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      const id = card.dataset.deliveryId;
      if (id) openDeliveryModal(id);
    });
  });
  con.querySelectorAll('[data-update-status]').forEach(btn =>
    btn.addEventListener('click', e => { e.stopPropagation(); quickUpdateStatus(btn.dataset.updateStatus, btn.dataset.newStatus, btn); })
  );
}

function deliveryCard(d) {
  const o = d.order_id || {};
  const addr = o.shipping_address || {};
  const NEXT = { picked_up: 'on_the_way', on_the_way: 'arriving', arriving: 'delivered' };
  const NEXT_LABEL = { picked_up: 'Mark In Transit', on_the_way: 'Mark Arriving', arriving: 'Mark Delivered' };
  const NEXT_CFG = {
    picked_up: { cls: 'from-primary to-emerald-700', icon: 'route' },
    on_the_way: { cls: 'from-sky-600 to-cyan-600', icon: 'pin_drop' },
    arriving: { cls: 'from-violet-600 to-fuchsia-600', icon: 'task_alt' },
  };
  const next = NEXT[d.status];
  const steps = ['picked_up', 'on_the_way', 'arriving', 'delivered'];
  const ci = steps.indexOf(d.status);
  const farmer = o.farmer_id || {};
  const ownerName = farmer.user_id?.full_name || farmer.full_name || 'Farmer';
  const nextCfg = NEXT_CFG[d.status] || NEXT_CFG.picked_up;

  return `<div class="order-card bg-surface-container-lowest/95 backdrop-blur-sm rounded-[18px] border border-surface-variant shadow-sm p-5 cursor-pointer" data-delivery-id="${d._id}">
    <div class="flex items-start justify-between mb-4">
      <div class="flex items-center gap-3">
        <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-100 to-green-50 text-primary flex items-center justify-center shrink-0 border border-emerald-200/80 shadow-sm">
          <span class="material-symbols-outlined fill">local_shipping</span>
        </div>
        <div>
          <p class="font-extrabold text-on-surface tracking-tight text-[1.06rem]">${o.order_code || d._id?.slice(-8)}</p>
          <p class="text-sm text-on-surface-variant font-medium">${formatDate(o.placed_at || d.created_at)}</p>
          <p class="text-xs text-on-surface-variant mt-0.5">Owner: <span class="font-semibold text-on-surface">${escapeHtml(ownerName)}</span></p>
        </div>
      </div>
      ${deliveryStatusBadge(d.status)}
    </div>
    ${addr.street ? `<div class="flex items-start gap-2.5 bg-surface-container/80 rounded-2xl p-3.5 mb-3 border border-surface-variant/70">
      <span class="w-8 h-8 rounded-xl bg-rose-50 border border-rose-100 inline-flex items-center justify-center shrink-0">
        <span class="material-symbols-outlined text-rose-500 text-[17px]">location_on</span>
      </span>
      <div><p class="text-sm font-semibold text-on-surface">${addr.street}</p><p class="text-xs text-on-surface-variant">${[addr.city, addr.country].filter(Boolean).join(', ')}</p></div>
    </div>` : ''}
    <div class="status-track flex items-center gap-1.5 mb-4">
      ${steps.map((_, i) => `<div class="flex-1 h-1.5 rounded-full ${i <= ci ? 'bg-primary' : 'bg-surface-variant'} transition-all"></div>`).join('')}
    </div>
    <div class="flex gap-2.5">
      <button type="button" onclick="openDeliveryModal('${d._id}')" class="flex-1 py-2.5 border border-outline-variant rounded-xl text-sm font-semibold text-on-surface hover:bg-surface-container flex items-center justify-center gap-1 transition-colors">
        <span class="material-symbols-outlined text-[16px]">visibility</span>Details
      </button>
      ${next ? `<button type="button" data-update-status="${d._id}" data-new-status="${next}" class="flex-1 py-2.5 bg-gradient-to-r ${nextCfg.cls} text-on-primary rounded-xl text-sm font-bold hover:opacity-90 flex items-center justify-center gap-1 active:scale-[0.98] shadow-sm">
        <span class="material-symbols-outlined text-[16px]">${nextCfg.icon}</span>${NEXT_LABEL[d.status]}
      </button>` : `<span class="flex-1 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-semibold text-center flex items-center justify-center gap-1">
        <span class="material-symbols-outlined text-[16px]">check_circle</span>Delivered
      </span>`}
    </div>
  </div>`;
}

async function openDeliveryModal(id) {
  // Find from DOM or re-fetch
  try {
    const d = (await api.get(`/delivery/deliveries/${id}`)).data;
    const o = d.order_id || {};
    const addr = o.shipping_address || {};
    const steps = ['picked_up', 'on_the_way', 'arriving', 'delivered'];
    const ci = steps.indexOf(d.status);
    const NEXT = { picked_up: 'on_the_way', on_the_way: 'arriving', arriving: 'delivered' };
    const NEXT_LABEL = { picked_up: 'Mark In Transit', on_the_way: 'Mark Arriving', arriving: 'Mark Delivered' };
    const next = NEXT[d.status];

    const m = document.createElement('div');
    m.id = 'order-modal-backdrop';
    m.className = 'fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 overflow-y-auto';
    m.innerHTML = `<div id="order-modal" class="bg-surface rounded-2xl w-full max-w-xl shadow-xl my-auto flex flex-col">
      <!-- Header -->
      <div class="flex items-start justify-between p-5 border-b border-surface-variant bg-surface-bright rounded-t-2xl shrink-0">
        <div>
          <p class="text-xs text-on-surface-variant mb-0.5">Delivery ID</p>
          <h3 class="text-lg font-bold text-on-surface">${o.order_code || d._id?.slice(-8)}</h3>
          <p class="text-sm text-on-surface-variant mt-0.5">${formatDate(o.placed_at || d.created_at)}</p>
        </div>
        <div class="flex items-center gap-2">
          ${deliveryStatusBadge(d.status)}
          <button onclick="this.closest('#order-modal-backdrop').remove()" class="text-on-surface-variant hover:text-on-surface ml-1 p-1">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
      </div>
      <!-- Body -->
      <div class="flex-1 overflow-y-auto p-5 space-y-4 max-h-[65vh]">
        <!-- Progress -->
        <div class="bg-surface-container rounded-xl p-4">
          <div class="flex items-center gap-1 mb-2">
            ${steps.map((s, i) => `<div class="flex-1 h-2 rounded-full ${i <= ci ? 'bg-primary' : 'bg-surface-variant'} transition-all"></div>`).join('')}
          </div>
          <div class="flex justify-between mt-1 text-[10px] text-on-surface-variant">
            <span>Picked Up</span><span>In Transit</span><span>Arriving</span><span>Delivered</span>
          </div>
        </div>
        <!-- Destination -->
        <div class="bg-surface-container rounded-xl p-4">
          <p class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Destination</p>
          <p class="text-sm font-medium text-on-surface">${addr.street || '—'}</p>
          <p class="text-sm text-on-surface-variant">${[addr.city, addr.state, addr.country].filter(Boolean).join(', ')}</p>
          ${o.contact_phone ? `<p class="text-sm text-on-surface-variant mt-1 flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">phone</span>${o.contact_phone}</p>` : ''}
        </div>
        <!-- Order info -->
        <div class="bg-surface-container rounded-xl p-4">
          <p class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Order</p>
          <div class="flex justify-between"><span class="text-sm text-on-surface-variant">Value</span><span class="text-sm font-bold text-on-surface">$${(o.total || 0).toFixed(2)}</span></div>
          ${o.notes ? `<p class="text-xs text-on-surface-variant mt-2 italic">"${escapeHtml(o.notes)}"</p>` : ''}
        </div>
        <!-- Timeline -->
        ${(d.status_timeline || []).length ? `<div class="bg-surface-container rounded-xl p-4">
          <p class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3">Timeline</p>
          <div class="relative pl-6 border-l-2 border-surface-variant space-y-4">
            ${(d.status_timeline || []).map(t => `<div class="relative"><div class="absolute -left-[17px] w-3 h-3 rounded-full bg-primary border-2 border-surface"></div><p class="text-sm font-semibold text-on-surface capitalize">${(t.step || '').replace(/_/g, ' ')}</p><p class="text-xs text-on-surface-variant">${formatDateTime(t.occurred_at)}${t.note ? ' · ' + t.note : ''}</p></div>`).join('')}
          </div>
        </div>` : ''}
      </div>
      <!-- Footer actions -->
      <div class="flex items-center justify-end gap-3 px-5 py-4 border-t border-surface-variant bg-surface-bright shrink-0 rounded-b-2xl">
        <button onclick="this.closest('#order-modal-backdrop').remove()" class="px-4 py-2.5 border border-outline-variant rounded-xl text-sm font-medium text-on-surface hover:bg-surface-container transition-colors">Close</button>
        ${next ? `<button onclick="quickUpdateStatus('${d._id}','${next}',this);this.closest('#order-modal-backdrop').remove();" class="px-4 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-semibold hover:opacity-90 flex items-center gap-1">
          <span class="material-symbols-outlined text-[16px]">update</span>${NEXT_LABEL[d.status]}
        </button>` : ''}
        ${d.status === 'delivered' ? `<button onclick="openProofModal('${d._id}');this.closest('#order-modal-backdrop').remove();" class="px-4 py-2.5 border border-outline-variant rounded-xl text-sm font-medium text-on-surface hover:bg-surface-container flex items-center gap-1">
          <span class="material-symbols-outlined text-[16px]">photo_camera</span>Upload Proof
        </button>` : ''}
      </div>
    </div>`;
    document.body.appendChild(m);
    m.addEventListener('click', e => { if (e.target === m) m.remove(); });
  } catch (e) {
    showToast('Failed to load delivery details', 'error');
  }
}

async function quickUpdateStatus(deliveryId, status, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Updating…'; }
  try {
    await api.put(`/delivery/deliveries/${deliveryId}/status`, { status });
    showToast(`Status updated to ${status.replace(/_/g, ' ')}`, 'success');
    await loadActiveOrders();
  } catch (err) {
    showToast(err.message || 'Update failed', 'error');
    if (btn) { btn.disabled = false; }
  }
}

function openProofModal(deliveryId) {
  const fi = document.createElement('input'); fi.type = 'file'; fi.accept = 'image/*';
  fi.addEventListener('change', async () => {
    if (!fi.files[0]) return;
    showToast('Uploading proof…', 'info');
    const fd = new FormData(); fd.append('proof', fi.files[0]);
    try {
      await api.put(`/delivery/deliveries/${deliveryId}/proof`, fd);
      showToast('Proof of delivery uploaded!', 'success');
      await loadActiveOrders();
    } catch (err) { showToast(err.message || 'Upload failed', 'error'); }
  });
  fi.click();
}
