// companytreatmentrequests.js
//
// Treatment Requests = pending orders waiting for company acceptance.
// Flow:
//   Farmer checks out → order.status = 'pending' → appears here
//   Company ACCEPTS  → PUT /orders/:id/status { status: 'processing' } → moves to Orders page
//   Company REJECTS  → PUT /orders/:id/reject  { rejection_reason }    → cancelled + farmer notified

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth('company')) return;
  populateSidebarUser();
  setupLogout();
  await loadRequests();
});

async function loadRequests() {
  const container = _findContainer();
  if (!container) return;
  container.innerHTML = skeletonCards(4);

  try {
    const res   = await api.get('/company/treatment-requests?limit=50');
    const reqs  = res.data || [];
    const total = res.meta?.total ?? reqs.length;

    setText('[data-stat="pending-count"]',  total);
    setText('[data-stat="total-requests"]', total);

    if (!reqs.length) {
      container.innerHTML = `
        <div class="col-span-full py-20 flex flex-col items-center gap-3 text-center">
          <div class="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center">
            <span class="material-symbols-outlined text-3xl text-on-surface-variant/40">inbox</span>
          </div>
          <p class="text-base font-semibold text-on-surface-variant">No pending requests</p>
          <p class="text-sm text-on-surface-variant/70">
            New orders from farmers will appear here for your review
          </p>
        </div>`;
      return;
    }

    container.innerHTML = reqs.map(reqCard).join('');
    _wireButtons(container);
  } catch (e) {
    container.innerHTML = `
      <div class="col-span-full py-10 text-center text-error text-sm">${e.message}</div>`;
  }
}

// ─── Card rendering ───────────────────────────────────────────────────────────

function reqCard(o) {
  const farmer      = o.farmer_id || {};
  const farmerName  = farmer.user_id?.full_name || farmer.location || 'Farmer';
  const farmerLoc   = farmer.location || '';
  const items       = o.items || [];
  const addr        = o.shipping_address || {};

  const itemNames   = items.slice(0, 2).map(i => i.product_name_snapshot).filter(Boolean);
  const itemPreview = itemNames.length
    ? escapeHtml(itemNames.join(', ') + (items.length > 2 ? ` +${items.length - 2} more` : ''))
    : '—';
  const addrLine = [addr.city, addr.state, addr.country].filter(Boolean).join(', ');

  return `
    <div class="bg-surface-container-lowest rounded-[16px] border border-surface-variant
                shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col">
      <!-- Header -->
      <div class="p-5 border-b border-surface-variant/50 flex items-start justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-11 h-11 rounded-xl bg-primary-fixed/20 text-primary font-bold text-sm
                      flex items-center justify-center shrink-0">
            ${farmerName.substring(0, 2).toUpperCase()}
          </div>
          <div class="min-w-0">
            <p class="font-bold text-on-surface truncate">${escapeHtml(farmerName)}</p>
            ${farmerLoc
              ? `<p class="text-xs text-on-surface-variant truncate">${escapeHtml(farmerLoc)}</p>`
              : ''}
          </div>
        </div>
        <span class="text-xs font-semibold text-on-surface-variant bg-surface-container
                     px-2.5 py-1 rounded-full shrink-0">
          ${o.order_code}
        </span>
      </div>
      <!-- Body -->
      <div class="p-5 space-y-3 flex-1">
        <div class="bg-surface-container rounded-xl p-3">
          <p class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">
            Requested Products (${items.length})
          </p>
          <p class="text-sm text-on-surface truncate">${itemPreview}</p>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-sm text-on-surface-variant">${formatDate(o.placed_at)}</span>
          <span class="text-base font-bold text-on-surface">$${(o.total || 0).toFixed(2)}</span>
        </div>
        ${addrLine
          ? `<div class="flex items-center gap-1.5 text-xs text-on-surface-variant">
               <span class="material-symbols-outlined text-[14px]">location_on</span>
               <span class="truncate">${escapeHtml(addrLine)}</span>
             </div>`
          : ''}
      </div>
      <!-- Actions -->
      <div class="px-5 pb-5 flex gap-2">
        <button data-view-req="${o._id}"
                class="flex-1 py-2.5 border border-outline-variant rounded-xl text-sm font-medium
                       text-on-surface hover:bg-surface-container flex items-center
                       justify-center gap-1 transition-colors">
          <span class="material-symbols-outlined text-[16px]">visibility</span>Details
        </button>
        <button data-reject-req="${o._id}"
                class="py-2.5 px-3.5 border border-error/40 text-error rounded-xl text-sm
                       font-medium hover:bg-error-container flex items-center
                       justify-center gap-1 transition-colors">
          <span class="material-symbols-outlined text-[16px]">close</span>Reject
        </button>
        <button data-accept-req="${o._id}"
                class="flex-1 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-semibold
                       hover:opacity-90 flex items-center justify-center gap-1 transition-colors">
          <span class="material-symbols-outlined text-[16px]">check_circle</span>Accept
        </button>
      </div>
    </div>`;
}

// ─── Details modal ────────────────────────────────────────────────────────────

async function viewDetails(orderId) {
  try {
    const { order: o, items } = (await api.get(`/company/orders/${orderId}`)).data;
    const farmer     = o.farmer_id || {};
    const farmerName = farmer.user_id?.full_name || farmer.location || 'Farmer';
    const addr       = o.shipping_address || {};

    const m = document.createElement('div');
    m.className = 'fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 overflow-y-auto';
    m.innerHTML = `
      <div class="bg-surface rounded-2xl w-full max-w-lg shadow-xl my-auto">
        <div class="p-5 border-b border-surface-variant flex justify-between items-start
                    bg-surface-bright rounded-t-2xl">
          <div>
            <h3 class="text-lg font-bold text-on-surface">${o.order_code}</h3>
            <p class="text-sm text-on-surface-variant">${formatDate(o.placed_at)}</p>
          </div>
          <button onclick="this.closest('.fixed').remove()"
                  class="text-on-surface-variant hover:text-on-surface">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <!-- Farmer info -->
          <div class="bg-surface-container rounded-xl p-4 flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-secondary-container text-on-secondary-container
                        flex items-center justify-center font-bold shrink-0">
              ${farmerName.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <p class="text-sm font-semibold text-on-surface">${escapeHtml(farmerName)}</p>
              ${farmer.location
                ? `<p class="text-xs text-on-surface-variant">${escapeHtml(farmer.location)}</p>`
                : ''}
              ${o.contact_phone
                ? `<p class="text-xs text-on-surface-variant">${o.contact_phone}</p>`
                : ''}
            </div>
          </div>
          <!-- Items -->
          <div>
            <p class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3">
              Requested Products (${items?.length || 0})
            </p>
            <div class="space-y-2">
              ${(items || []).map(i => `
                <div class="flex items-center gap-3 bg-surface-container rounded-xl p-3">
                  <div class="w-9 h-9 rounded-lg bg-surface-container-high flex items-center
                              justify-center shrink-0">
                    <span class="material-symbols-outlined text-on-surface-variant text-[18px]">science</span>
                  </div>
                  <div class="flex-1">
                    <p class="text-sm font-semibold text-on-surface">
                      ${escapeHtml(i.product_name_snapshot)}
                    </p>
                    <p class="text-xs text-on-surface-variant">
                      ${i.quantity} × $${(i.unit_price || 0).toFixed(2)}
                      ${i.product_id?.unit ? `(${i.product_id.unit})` : ''}
                    </p>
                  </div>
                  <span class="font-bold text-sm text-on-surface">$${(i.subtotal || 0).toFixed(2)}</span>
                </div>
              `).join('')}
            </div>
          </div>
          <!-- Shipping address -->
          <div class="bg-surface-container rounded-xl p-4">
            <p class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
              Shipping Address
            </p>
            <p class="text-sm text-on-surface">${addr.street || '—'}</p>
            <p class="text-sm text-on-surface-variant">
              ${[addr.city, addr.state, addr.country].filter(Boolean).join(', ') || '—'}
            </p>
          </div>
          <!-- Totals -->
          <div class="bg-surface-container rounded-xl p-4">
            <div class="flex justify-between mb-1">
              <span class="text-sm text-on-surface-variant">Subtotal</span>
              <span class="text-sm text-on-surface">$${(o.subtotal || 0).toFixed(2)}</span>
            </div>
            <div class="flex justify-between border-t border-surface-variant pt-2 mt-1">
              <span class="text-sm font-bold text-on-surface">Total</span>
              <span class="text-base font-bold text-on-surface">$${(o.total || 0).toFixed(2)}</span>
            </div>
          </div>
          ${o.notes
            ? `<div class="bg-surface-container rounded-xl p-4">
                 <p class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">Notes</p>
                 <p class="text-sm text-on-surface italic">"${escapeHtml(o.notes)}"</p>
               </div>`
            : ''}
          <!-- Modal actions -->
          <div class="flex gap-3 pt-1">
            <button onclick="openRejectModal('${o._id}'); this.closest('.fixed').remove();"
                    class="flex-1 py-2.5 border border-error/40 text-error rounded-xl text-sm
                           font-medium hover:bg-error-container flex items-center
                           justify-center gap-1 transition-colors">
              <span class="material-symbols-outlined text-[16px]">close</span>Reject
            </button>
            <button onclick="acceptRequest('${o._id}', this); this.closest('.fixed').remove();"
                    class="flex-1 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-semibold
                           hover:opacity-90 flex items-center justify-center gap-1 transition-colors">
              <span class="material-symbols-outlined text-[16px]">check_circle</span>Accept Order
            </button>
          </div>
        </div>
      </div>`;

    document.body.appendChild(m);
    m.addEventListener('click', e => { if (e.target === m) m.remove(); });
  } catch (e) {
    showToast('Failed to load details', 'error');
  }
}

// ─── Accept ───────────────────────────────────────────────────────────────────

async function acceptRequest(orderId, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Accepting…'; }
  try {
    await api.put(`/company/orders/${orderId}/status`, { status: 'processing' });
    showToast('Order accepted! Now processing.', 'success');
    await loadRequests();
  } catch (err) {
    showToast(err.message || 'Failed to accept', 'error');
    if (btn) { btn.disabled = false; }
  }
}

// ─── Reject modal ─────────────────────────────────────────────────────────────

function openRejectModal(orderId) {
  const m = document.createElement('div');
  m.className = 'fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4';
  m.innerHTML = `
    <div class="bg-surface rounded-2xl w-full max-w-sm shadow-xl">
      <div class="p-5 border-b border-surface-variant">
        <h3 class="text-lg font-bold text-on-surface">Reject Order</h3>
        <p class="text-sm text-on-surface-variant mt-0.5">
          The farmer will be notified with your reason.
        </p>
      </div>
      <div class="p-5">
        <label class="block text-sm font-medium text-on-surface mb-2">
          Reason for rejection
          <span class="text-on-surface-variant font-normal ml-1">(optional)</span>
        </label>
        <textarea id="reject-reason" rows="3"
                  placeholder="e.g. Product out of stock, unable to fulfil at this time…"
                  class="w-full px-4 py-3 border border-outline-variant rounded-xl text-sm
                         focus:ring-1 focus:ring-primary resize-none bg-surface-container-lowest">
        </textarea>
      </div>
      <div class="px-5 pb-5 flex gap-3">
        <button onclick="this.closest('.fixed').remove()"
                class="flex-1 py-2.5 border border-outline-variant rounded-xl text-sm font-medium
                       text-on-surface-variant hover:bg-surface-container transition-colors">
          Cancel
        </button>
        <button id="confirm-reject"
                class="flex-1 py-2.5 bg-error text-on-error rounded-xl text-sm font-semibold
                       hover:opacity-90 transition-colors">
          Reject Order
        </button>
      </div>
    </div>`;

  document.body.appendChild(m);
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });

  m.querySelector('#confirm-reject').addEventListener('click', async () => {
    const reason = m.querySelector('#reject-reason').value.trim();
    const btn    = m.querySelector('#confirm-reject');
    btn.disabled    = true;
    btn.textContent = 'Rejecting…';
    try {
      await api.put(`/company/orders/${orderId}/reject`, {
        rejection_reason: reason || undefined,
      });
      m.remove();
      showToast('Order rejected. Farmer has been notified.', 'success');
      await loadRequests();
    } catch (err) {
      showToast(err.message || 'Failed to reject', 'error');
      btn.disabled    = false;
      btn.textContent = 'Reject Order';
    }
  });
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function _findContainer() {
  return (
    document.querySelector('[data-request-grid]')      ||
    document.querySelector('[data-requests-container]') ||
    document.querySelector('main .grid')               ||
    document.querySelector('main [class*="grid"]')
  );
}

function _wireButtons(container) {
  container.querySelectorAll('[data-view-req]').forEach(btn =>
    btn.addEventListener('click', () => viewDetails(btn.dataset.viewReq))
  );
  container.querySelectorAll('[data-accept-req]').forEach(btn =>
    btn.addEventListener('click', () => acceptRequest(btn.dataset.acceptReq, btn))
  );
  container.querySelectorAll('[data-reject-req]').forEach(btn =>
    btn.addEventListener('click', () => openRejectModal(btn.dataset.rejectReq))
  );
}

const setText = (sel, val) =>
  document.querySelectorAll(sel).forEach(el => (el.textContent = val ?? ''));