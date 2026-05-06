// companytreatmentrequests.js
//
// Treatment Requests = pending orders waiting for company acceptance.
// Flow:
//   Farmer checks out â†’ order.status = 'pending' â†’ appears here
//   Company ACCEPTS  â†’ PUT /orders/:id/status { status: 'processing' } â†’ moves to Orders page
//   Company REJECTS  â†’ PUT /orders/:id/reject  { rejection_reason }    â†’ cancelled + farmer notified

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth('company')) return;
  populateSidebarUser();
  setupLogout();
  setupFilterUI();
  setupTreatmentRequestNotifications();
  await loadRequests();
});

let _activeFilters = { statuses: [], priorityBands: [] };

async function loadRequests() {
  const container = _findContainer();
  if (!container) return;
  container.innerHTML = skeletonCards(4);

  try {
    const statusParam = (_activeFilters.statuses && _activeFilters.statuses.length)
      ? `&status=${encodeURIComponent(_activeFilters.statuses.join(','))}`
      : '';
    const res   = await api.get(`/company/treatment-requests?limit=50${statusParam}`);
    const raw   = res.data || [];
    const total = res.meta?.total ?? raw.length;

    setText('[data-stat="pending-count"]',  total);
    setText('[data-stat="total-requests"]', total);

    const reqs = applyClientFilters(raw, _activeFilters);

    if (!reqs.length) {
      container.innerHTML = `
        <div class="col-span-full py-20 flex flex-col items-center gap-3 text-center">
          <div class="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center">
            <span class="material-symbols-outlined text-3xl text-on-surface-variant/40">inbox</span>
          </div>
          <p class="text-base font-semibold text-on-surface-variant">${
            (_activeFilters.statuses?.length || _activeFilters.priorityBands?.length)
              ? 'No treatment requests match your filters.'
              : 'No pending requests'
          }</p>
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

// â”€â”€â”€ Card rendering â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function reqCard(o) {
  const farmer      = o.farmer_id || {};
  const farmerUser  = farmer.user_id || {};
  const farmerName  = farmerUser.full_name || farmer.location || 'Farmer';
  const farmerLoc   = farmer.location || '';
  const farmerAvatar = extractAvatarUrl(farmerUser.avatar);
  const farmerInitials = getInitials(farmerName);
  const items       = o.items || [];
  const addr        = o.shipping_address || {};

  const itemNames   = items.slice(0, 2).map(i => i.product_name_snapshot).filter(Boolean);
  const itemPreview = itemNames.length
    ? escapeHtml(itemNames.join(', ') + (items.length > 2 ? ` +${items.length - 2} more` : ''))
    : 'â€”';
  const addrLine = [addr.city, addr.state, addr.country].filter(Boolean).join(', ');

  const status = o.status || 'pending';
  const statusBadge = (typeof orderStatusBadge === 'function')
    ? orderStatusBadge(status)
    : `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-surface-container text-on-surface-variant">${escapeHtml(status)}</span>`;

  return `
    <div class="group bg-white rounded-2xl border border-slate-100 shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all duration-300 overflow-hidden flex flex-col">
      <div class="h-1 bg-gradient-to-r from-emerald-400 via-green-500 to-teal-500 rounded-t-2xl"></div>
      <div class="px-5 pt-4 pb-4 flex items-start justify-between gap-3 border-b border-surface-variant/50">
        <div class="flex items-center gap-3 min-w-0">
          ${isRenderableAvatar(farmerAvatar)
            ? `<img src="${escapeHtml(farmerAvatar)}" alt="${escapeHtml(farmerName)}" class="w-11 h-11 rounded-full object-cover border-2 border-white shadow-md shrink-0">`
            : avatarFallbackMarkup(farmerInitials, farmerName)}
          <div class="min-w-0">
            <p class="text-sm font-bold text-on-surface truncate">${escapeHtml(farmerName)}</p>
            ${farmerLoc
              ? `<p class="text-xs text-on-surface-variant truncate">${escapeHtml(farmerLoc)}</p>`
              : ''}
          </div>
        </div>
        <div class="flex flex-col items-end gap-2 shrink-0">
          <span class="text-xs font-semibold text-on-surface-variant bg-surface-container px-2.5 py-1 rounded-full">
            ${escapeHtml(o.order_code)}
          </span>
          ${statusBadge}
        </div>
      </div>
      <div class="p-5 space-y-3.5 flex-1">
        <div class="bg-surface-container rounded-2xl p-4">
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
          ? `<div class="flex items-center gap-2 text-xs text-on-surface-variant">
               <span class="w-7 h-7 rounded-lg bg-rose-50 inline-flex items-center justify-center shrink-0">
                 <span class="material-symbols-outlined text-rose-400 text-[14px]">location_on</span>
               </span>
               <span class="truncate">${escapeHtml(addrLine)}</span>
             </div>`
          : ''}
      </div>
       <div class="px-5 pb-5 flex gap-2">
         <button data-view-req="${o._id}"
                 class="flex-1 py-2.5 border border-outline-variant rounded-xl text-sm font-medium
                        text-on-surface hover:bg-surface-container flex items-center
                        justify-center gap-1 transition-colors">
           <span class="material-symbols-outlined text-[16px]">visibility</span>Details
         </button>
        ${
          status === 'pending'
            ? `
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
            `
            : ''
        }
       </div>
     </div>`;
}

// â”€â”€â”€ Details modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function viewDetails(orderId) {
  try {
    const { order: o, items } = (await api.get(`/company/orders/${orderId}`)).data;
    const farmer     = o.farmer_id || {};
    const farmerUser = farmer.user_id || {};
    const farmerName = farmerUser.full_name || farmer.location || 'Farmer';
    const farmerAvatar = extractAvatarUrl(farmerUser.avatar);
    const farmerInitials = getInitials(farmerName);
    const addr       = o.shipping_address || {};

    const status = o.status || 'pending';
    const statusBadge = (typeof orderStatusBadge === 'function')
      ? orderStatusBadge(status)
      : `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-surface-container text-on-surface-variant">${escapeHtml(status)}</span>`;

    const m = document.createElement('div');
    m.className = 'fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 overflow-y-auto';
    m.innerHTML = `
      <div class="bg-surface rounded-2xl w-full max-w-lg shadow-xl my-auto">
        <div class="p-5 border-b border-surface-variant flex justify-between items-start
                    bg-surface-bright rounded-t-2xl">
           <div>
             <h3 class="text-lg font-bold text-on-surface">${o.order_code}</h3>
             <div class="flex items-center gap-2 mt-0.5">
               <p class="text-sm text-on-surface-variant">${formatDate(o.placed_at)}</p>
               ${statusBadge}
             </div>
           </div>
          <button onclick="this.closest('.fixed').remove()"
                  class="text-on-surface-variant hover:text-on-surface">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <!-- Farmer info -->
          <div class="bg-surface-container rounded-xl p-4 flex items-center gap-3">
            ${isRenderableAvatar(farmerAvatar)
              ? `<img src="${escapeHtml(farmerAvatar)}" alt="${escapeHtml(farmerName)}" class="w-10 h-10 rounded-full object-cover border-2 border-white shadow-md shrink-0">`
              : `<div class="w-10 h-10 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-bold shrink-0">${escapeHtml(farmerInitials)}</div>`}
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
              ${(items || []).map(i => {
                const productImage = extractProductImageUrl(i);
                const productName = i.product_name_snapshot || i.product_id?.name || 'Product';
                return `
                <div class="flex items-center gap-3 bg-surface-container rounded-xl p-3">
                  ${
                    isRenderableAvatar(productImage)
                      ? `<img src="${escapeHtml(productImage)}" alt="${escapeHtml(productName)}" class="w-9 h-9 rounded-lg object-cover border border-surface-variant/50 bg-surface-container-high shrink-0">`
                      : `<div class="w-9 h-9 rounded-lg bg-surface-container-high flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-on-surface-variant text-[18px]">science</span></div>`
                  }
                  <div class="flex-1">
                    <p class="text-sm font-semibold text-on-surface">
                      ${escapeHtml(productName)}
                    </p>
                    <p class="text-xs text-on-surface-variant">
                      ${i.quantity} × $${(i.unit_price || 0).toFixed(2)}
                      ${i.product_id?.unit ? `(${i.product_id.unit})` : ''}
                    </p>
                  </div>
                  <span class="font-bold text-sm text-on-surface">$${(i.subtotal || 0).toFixed(2)}</span>
                </div>
              `;
            }).join('')}
            </div>
          </div>
          <!-- Shipping address -->
          <div class="bg-surface-container rounded-xl p-4">
            <p class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
              Shipping Address
            </p>
            <p class="text-sm text-on-surface">${addr.street || 'â€”'}</p>
            <p class="text-sm text-on-surface-variant">
              ${[addr.city, addr.state, addr.country].filter(Boolean).join(', ') || 'â€”'}
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
          ${
            status === 'pending'
              ? `
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
              `
              : ''
          }
        </div>
      </div>`;

    document.body.appendChild(m);
    m.addEventListener('click', e => { if (e.target === m) m.remove(); });
  } catch (e) {
    showToast('Failed to load details', 'error');
  }
}

// â”€â”€â”€ Accept â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function acceptRequest(orderId, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Acceptingâ€¦'; }
  try {
    await api.put(`/company/orders/${orderId}/status`, { status: 'processing' });
    showToast('Order accepted! Now processing.', 'success');
    await loadRequests();
  } catch (err) {
    showToast(err.message || 'Failed to accept', 'error');
    if (btn) { btn.disabled = false; }
  }
}

// â”€â”€â”€ Reject modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
                  placeholder="e.g. Product out of stock, unable to fulfil at this timeâ€¦"
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
    btn.textContent = 'Rejectingâ€¦';
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

// â”€â”€â”€ Private helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

function getInitials(name) {
  return String(name || 'FA')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'FA';
}

function avatarFallbackMarkup(initials, farmerName) {
  return `<div class="w-11 h-11 rounded-full bg-gradient-to-br from-primary to-primary-container flex items-center justify-center text-on-primary text-sm font-bold border-2 border-white shadow-md shrink-0" aria-label="${escapeHtml(farmerName)}">${escapeHtml(initials)}</div>`;
}

function isRenderableAvatar(value) {
  const s = String(value || '').trim();
  if (!s) return false;
  return s.startsWith('data:image/') || s.startsWith('http://') || s.startsWith('https://') || s.startsWith('/');
}

function extractAvatarUrl(avatar) {
  if (!avatar) return '';
  if (typeof avatar === 'string') return resolveAssetUrl(avatar);

  // Handle Mongo image object on frontend if backend sends raw object.
  const contentType = avatar.content_type || avatar.contentType || 'image/jpeg';
  const raw = avatar.data;
  if (!raw) return '';

  try {
    if (Array.isArray(raw)) {
      return toDataUriFromBytes(raw, contentType);
    }
    if (raw && raw.type === 'Buffer' && Array.isArray(raw.data)) {
      return toDataUriFromBytes(raw.data, contentType);
    }
    if (raw && typeof raw === 'object') {
      const values = Object.values(raw).filter(v => Number.isFinite(Number(v))).map(v => Number(v));
      if (values.length) return toDataUriFromBytes(values, contentType);
    }
  } catch (_) {
    return '';
  }

  return '';
}

function extractProductImageUrl(item) {
  if (!item || !item.product_id) return '';
  const image = item.product_id.default_image;
  if (!image) return '';
  if (typeof image === 'string') return resolveAssetUrl(image);

  const contentType = image.content_type || image.contentType || 'image/jpeg';
  const raw = image.data;
  if (!raw) return '';

  try {
    if (Array.isArray(raw)) {
      return toDataUriFromBytes(raw, contentType);
    }
    if (raw && raw.type === 'Buffer' && Array.isArray(raw.data)) {
      return toDataUriFromBytes(raw.data, contentType);
    }
    if (raw && typeof raw === 'object') {
      const values = Object.values(raw).filter(v => Number.isFinite(Number(v))).map(v => Number(v));
      if (values.length) return toDataUriFromBytes(values, contentType);
    }
  } catch (_) {
    return '';
  }

  return '';
}

function toDataUriFromBytes(bytes, contentType) {
  const uint8 = new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < uint8.length; i += 1) {
    binary += String.fromCharCode(uint8[i]);
  }
  const base64 = btoa(binary);
  return `data:${contentType};base64,${base64}`;
}

function setupFilterUI() {
  const filterBtn = document.querySelector('button[data-filter]');
  const modal = document.getElementById('filter-modal');
  const closeBtn = document.getElementById('close-filter');
  const clearBtn = document.getElementById('clear-filters');
  const applyBtn = document.getElementById('apply-filters');
  if (!filterBtn || !modal) return;

  const positionModal = () => {
    const btnRect = filterBtn.getBoundingClientRect();
    const modalWidth = 320;
    let left = btnRect.left;
    let top = btnRect.bottom + 8;
    if (left + modalWidth > window.innerWidth - 16) {
      left = btnRect.right - modalWidth;
    }
    modal.style.top = `${top}px`;
    modal.style.left = `${left}px`;
  };

  filterBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    positionModal();
    modal.classList.toggle('hidden');
  });

  closeBtn?.addEventListener('click', () => modal.classList.add('hidden'));

  document.addEventListener('click', (e) => {
    if (!modal.classList.contains('hidden') && !modal.contains(e.target) && e.target !== filterBtn) {
      modal.classList.add('hidden');
    }
  });

  clearBtn?.addEventListener('click', () => {
    modal.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = false; });
    _activeFilters = { statuses: [], priorityBands: [] };
    loadRequests();
  });

  applyBtn?.addEventListener('click', () => {
    _activeFilters = readFilters(modal);
    modal.classList.add('hidden');
    loadRequests();
  });
}

function readFilters(modal) {
  const statuses = Array.from(modal.querySelectorAll('input[data-filter-status]'))
    .filter((el) => el.checked)
    .map((el) => el.value)
    .filter(Boolean);

  const priorityBands = Array.from(modal.querySelectorAll('input[data-filter-priority]'))
    .filter((el) => el.checked)
    .map((el) => el.value)
    .filter(Boolean);

  return { statuses, priorityBands };
}

function applyClientFilters(items, filters) {
  let out = items.slice();

  // "Priority" for this page is derived from order totals (orders don't have an explicit priority field).
  if (filters?.priorityBands?.length) {
    const totals = out.map(o => Number(o.total ?? o.total_amount ?? 0)).filter(Number.isFinite);
    totals.sort((a,b) => a-b);
    const p25 = totals.length ? totals[Math.floor(totals.length * 0.25)] : 0;
    const p75 = totals.length ? totals[Math.floor(totals.length * 0.75)] : 0;

    out = out.filter(o => {
      const t = Number(o.total ?? o.total_amount ?? 0);
      if (!Number.isFinite(t)) return false;
      const isLow = t <= p25;
      const isHigh = t >= p75;
      return (filters.priorityBands.includes('low') && isLow) ||
             (filters.priorityBands.includes('high') && isHigh);
    });
  }

  return out;
}

function setupTreatmentRequestNotifications() {
  refreshUnreadDot();

  // Poll unread notifications; new_order notifications are created when a farmer checks out.
  const pollMs = 20000;
  setInterval(async () => {
    try {
      const unread = await api.get('/notifications?is_read=false&limit=5');
      const items = unread.data || [];
      if (!items.length) return;

      const seenKey = 'plantdoc_seen_company_notifications';
      const seen = new Set(JSON.parse(sessionStorage.getItem(seenKey) || '[]'));

      let hasNewOrder = false;
      items.forEach((n) => {
        const id = String(n._id || n.id);
        if (!id || seen.has(id)) return;
        seen.add(id);

        if ((n.type || '').toLowerCase() === 'new_order') {
          hasNewOrder = true;
          showToast(n.title || 'New treatment request', 'info');
          if (n.body) showToast(n.body, 'info');
        }
      });

      sessionStorage.setItem(seenKey, JSON.stringify(Array.from(seen).slice(0, 200)));
      if (hasNewOrder) {
        showNotifDot(true);
        await loadRequests();
      }
    } catch (_) {
      // ignore polling errors
    }
  }, pollMs);

  // Clicking the bell clears the dot (no dropdown UI on this page yet)
  document.querySelectorAll('button').forEach(btn => {
    const icon = btn.querySelector('.material-symbols-outlined');
    if (icon && icon.textContent.trim() === 'notifications') {
      btn.addEventListener('click', () => showNotifDot(false));
    }
  });
}

async function refreshUnreadDot() {
  try {
    const unread = await api.get('/notifications?is_read=false&limit=1');
    showNotifDot(Boolean((unread.data || []).length));
  } catch (_) {}
}

function showNotifDot(on) {
  document.querySelectorAll('[data-notif-dot]').forEach(el => {
    el.classList.toggle('hidden', !on);
  });
}

