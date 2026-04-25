// deliverycompletedorders.js
document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth('delivery')) return;
  populateSidebarUser(); setupLogout();
  await loadCompletedOrders();
  setupSearch();
});

async function loadCompletedOrders(query = {}) {
  const con = document.querySelector('[data-completed-grid], main .grid, main .flex.flex-col.gap');
  if (!con) return;
  con.innerHTML = skeletonCards(4);
  try {
    const params = new URLSearchParams({ limit: 50, ...query }).toString();
    const items = (await api.get(`/delivery/orders/completed?${params}`)).data || [];
    updateStats(items);
    if (!items.length) {
      con.innerHTML = `<div class="col-span-full py-16 text-center"><span class="material-symbols-outlined text-5xl text-on-surface-variant/40 block mb-3">task_alt</span><p class="text-on-surface-variant font-medium">No completed deliveries yet</p></div>`;
      return;
    }
    renderCompleted(items, con);
  } catch (e) {
    con.innerHTML = `<div class="col-span-full py-8 text-center text-error text-sm">${e.message}</div>`;
  }
}

function updateStats(items) {
  document.querySelectorAll('[data-stat="completed-count"]').forEach(el => el.textContent = items.length);
  const now = new Date();
  const thisMonth = items.filter(d => {
    const t = new Date(d.delivered_at || d.updated_at);
    return t.getMonth() === now.getMonth() && t.getFullYear() === now.getFullYear();
  }).length;
  document.querySelectorAll('[data-stat="completed-month"]').forEach(el => el.textContent = thisMonth);
}

function renderCompleted(items, con) {
  con.innerHTML = items.map(completedCard).join('');
  con.querySelectorAll('[data-view-completed]').forEach(el =>
    el.addEventListener('click', () => openCompletedModal(el.dataset.viewCompleted))
  );
}

function completedCard(d) {
  const o = d.order_id || {};
  const addr = o.shipping_address || {};
  return `<div class="order-card bg-surface-container-lowest rounded-[16px] border border-surface-variant shadow-sm overflow-hidden hover:shadow-md transition-shadow group">
    <div class="bg-primary/5 border-b border-surface-variant px-5 py-3 flex items-center justify-between">
      <p class="text-sm font-bold text-on-surface">${o.order_code || d._id?.slice(-8)}</p>
      <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary text-on-primary"><span class="material-symbols-outlined text-[12px]">check_circle</span>Delivered</span>
    </div>
    <div class="p-5 space-y-3">
      <div class="flex items-center gap-2 text-sm text-on-surface-variant">
        <span class="material-symbols-outlined text-[16px]">location_on</span>
        <span>${addr.city || 'Unknown city'}${addr.country ? ', ' + addr.country : ''}</span>
      </div>
      <div class="flex items-center justify-between text-sm">
        <span class="text-on-surface-variant">Delivered</span>
        <span class="font-semibold text-on-surface">${formatDate(d.delivered_at || d.updated_at)}</span>
      </div>
      <div class="flex items-center justify-between text-sm">
        <span class="text-on-surface-variant">Order Value</span>
        <span class="font-bold text-on-surface">$${(o.total || 0).toFixed(2)}</span>
      </div>
      ${d.proof_of_delivery ? `<div class="flex items-center gap-2 text-xs text-primary"><span class="material-symbols-outlined text-[14px]">photo_camera</span>Proof attached</div>` : ''}
    </div>
    <div class="px-5 pb-5">
      <button data-view-completed="${d._id}" class="w-full py-2.5 border border-outline-variant rounded-xl text-sm font-medium text-on-surface hover:bg-surface-container transition-colors flex items-center justify-center gap-1 group-hover:border-primary group-hover:text-primary">
        <span class="material-symbols-outlined text-[16px]">visibility</span>View Details
      </button>
    </div>
  </div>`;
}

async function openCompletedModal(id) {
  try {
    const d = (await api.get(`/delivery/deliveries/${id}`)).data;
    const o = d.order_id || {};
    const addr = o.shipping_address || {};
    const m = document.createElement('div');
    m.className = 'fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 overflow-y-auto';
    m.innerHTML = `<div class="bg-surface rounded-2xl w-full max-w-lg shadow-xl my-auto">
      <div class="p-5 border-b border-surface-variant flex justify-between items-start bg-surface-bright rounded-t-2xl">
        <div>
          <h3 class="text-lg font-bold text-on-surface">${o.order_code || d._id?.slice(-8)}</h3>
          <p class="text-sm text-on-surface-variant">Delivered ${formatDate(d.delivered_at || d.updated_at)}</p>
        </div>
        <div class="flex items-center gap-2">
          <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary text-on-primary"><span class="material-symbols-outlined text-[12px]">check_circle</span>Delivered</span>
          <button onclick="this.closest('.fixed').remove()" class="text-on-surface-variant hover:text-on-surface ml-1 p-1"><span class="material-symbols-outlined">close</span></button>
        </div>
      </div>
      <div class="p-5 space-y-4 max-h-[65vh] overflow-y-auto">
        <div class="bg-surface-container rounded-xl p-4">
          <p class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Destination</p>
          <p class="text-sm font-medium text-on-surface">${addr.street || '—'}</p>
          <p class="text-sm text-on-surface-variant">${[addr.city, addr.state, addr.country].filter(Boolean).join(', ')}</p>
          ${o.contact_phone ? `<p class="text-sm text-on-surface-variant mt-1">${o.contact_phone}</p>` : ''}
        </div>
        <div class="bg-surface-container rounded-xl p-4 flex justify-between">
          <span class="text-sm text-on-surface-variant">Order Value</span>
          <span class="text-sm font-bold text-on-surface">$${(o.total || 0).toFixed(2)}</span>
        </div>
        ${(d.status_timeline || []).length ? `<div class="bg-surface-container rounded-xl p-4">
          <p class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3">Timeline</p>
          <div class="relative pl-6 border-l-2 border-surface-variant space-y-4">
            ${(d.status_timeline || []).map(t => `<div class="relative"><div class="absolute -left-[17px] w-3 h-3 rounded-full bg-primary border-2 border-surface"></div><p class="text-sm font-semibold text-on-surface capitalize">${(t.step || '').replace(/_/g, ' ')}</p><p class="text-xs text-on-surface-variant">${formatDateTime(t.occurred_at)}${t.note ? ' · ' + t.note : ''}</p></div>`).join('')}
          </div>
        </div>` : ''}
        ${d.proof_of_delivery
          ? `<div class="bg-surface-container rounded-xl p-4"><p class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Proof of Delivery</p><img src="${d.proof_of_delivery}" class="rounded-xl w-full max-h-48 object-cover border border-surface-variant" alt="Proof"/></div>`
          : `<div class="bg-surface-container rounded-xl p-4 flex items-center justify-between"><p class="text-sm text-on-surface-variant">No proof uploaded</p><button onclick="uploadProof('${d._id}',this)" class="px-3 py-1.5 border border-outline-variant rounded-xl text-xs font-medium text-on-surface hover:bg-surface-container-high flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">upload</span>Upload</button></div>`}
      </div>
      <div class="px-5 py-4 border-t border-surface-variant bg-surface-bright rounded-b-2xl flex justify-end">
        <button onclick="this.closest('.fixed').remove()" class="px-4 py-2.5 border border-outline-variant rounded-xl text-sm font-medium text-on-surface hover:bg-surface-container transition-colors">Close</button>
      </div>
    </div>`;
    document.body.appendChild(m);
    m.addEventListener('click', e => { if (e.target === m) m.remove(); });
  } catch (e) {
    showToast('Failed to load details', 'error');
  }
}

function uploadProof(deliveryId, btn) {
  const fi = document.createElement('input'); fi.type = 'file'; fi.accept = 'image/*';
  fi.addEventListener('change', async () => {
    if (!fi.files[0]) return;
    if (btn) { btn.disabled = true; btn.textContent = 'Uploading…'; }
    const fd = new FormData(); fd.append('proof', fi.files[0]);
    try {
      await api.put(`/delivery/deliveries/${deliveryId}/proof`, fd);
      showToast('Proof uploaded!', 'success');
      document.querySelector('.fixed')?.remove();
      await loadCompletedOrders();
    } catch (err) {
      showToast(err.message || 'Upload failed', 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Upload'; }
    }
  });
  fi.click();
}

function setupSearch() {
  const inp = document.querySelector('input[type="search"], input[placeholder*="Search"], input[placeholder*="search"]');
  if (!inp) return;
  let t;
  inp.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => loadCompletedOrders(inp.value.trim() ? { search: inp.value.trim() } : {}), 400);
  });
}
