// companyorders.js
// Table cols: Order ID | Farmer | Date | Total | Status
// Clicking a row opens a full detail modal.
// Only action available: "Mark as Shipped" (visible when status === 'processing')

const DEFAULT_FILTERS = Object.freeze({
  status: '',
  dateRange: 'all',
});

let _allOrders = [];
let _deliveryCompanies = null;
let _state = {
  search: '',
  filters: { ...DEFAULT_FILTERS },
};

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth('company')) return;
  populateSidebarUser();
  setupLogout();
  setupSearch();
  setupFilters();
  await loadOrders();
});

// ─── Safe escaper (works whether or not global escapeHtml exists) ─────────────
function _esc(str) {
  if (typeof escapeHtml === 'function') return escapeHtml(str);
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Load & render table ──────────────────────────────────────────────────────

async function loadOrders() {
  const tbody = document.querySelector('table tbody');
  if (!tbody) { console.warn('[orders] tbody not found'); return; }

  tbody.innerHTML = `<tr><td colspan="6"
    class="px-6 py-8 text-center text-on-surface-variant text-sm animate-pulse">
    Loading orders…
  </td></tr>`;

  try {
    const params = new URLSearchParams({ limit: 100, exclude_pending: 'true' }).toString();
    const res    = await api.get(`/company/orders?${params}`);
    _allOrders = Array.isArray(res.data) ? res.data : [];
    renderOrders();
  } catch (e) {
    console.error('[orders] loadOrders:', e);
    tbody.innerHTML = `<tr><td colspan="6"
      class="px-6 py-6 text-center text-error text-sm">${_esc(e?.message || 'Failed to load orders')}</td></tr>`;
  }
}

function renderOrders() {
  const tbody = document.querySelector('table tbody');
  if (!tbody) return;

  const orders = getFilteredOrders();
  if (!orders.length) {
    const hasActiveFilters = Boolean(_state.search || _state.filters.status || _state.filters.dateRange !== 'all');
    tbody.innerHTML = `<tr><td colspan="6"
      class="px-6 py-12 text-center text-on-surface-variant text-sm">
      <div class="flex flex-col items-center gap-2">
        <span class="material-symbols-outlined text-3xl opacity-30">inbox</span>
        <span>${hasActiveFilters ? 'No orders match your filters' : 'No orders yet'}</span>
      </div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = orders.map(orderRow).join('');
  tbody.querySelectorAll('tr[data-order-id]').forEach((row) => {
    row.addEventListener('click', () => openModal(row.dataset.orderId));
  });
}

function getFilteredOrders() {
  const searchTerm = _state.search.trim().toLowerCase();
  const now = Date.now();

  return _allOrders.filter((order) => {
    if (_state.filters.status) {
      const orderStatusKey = _normalizeOrderStatusKey(order.status);
      if (orderStatusKey !== _state.filters.status) return false;
    }

    if (_state.filters.dateRange !== 'all') {
      const placedAtMs = new Date(order.placed_at).getTime();
      if (!Number.isFinite(placedAtMs)) return false;

      const maxAgeByRange = {
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000,
        '365d': 365 * 24 * 60 * 60 * 1000,
      };
      const maxAge = maxAgeByRange[_state.filters.dateRange];
      if (maxAge && now - placedAtMs > maxAge) {
        return false;
      }
    }

    if (!searchTerm) return true;

    const farmer = order.farmer_id || {};
    const farmerName = farmer.user_id?.full_name || farmer.location || '';
    const haystack = [
      order.order_code,
      order._id,
      farmerName,
      farmer.location,
      order.status,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(searchTerm);
  });
}

// ─── Table row (5 data cols + chevron) ───────────────────────────────────────

function orderRow(o) {
  const farmer     = o.farmer_id || {};
  const farmerName = farmer.user_id?.full_name || farmer.location || 'Farmer';
  const initials   = farmerName.substring(0, 2).toUpperCase();
  const farmerAvatar = farmer.user_id?.avatar || farmer.avatar || '';

  return `
    <tr data-order-id="${o._id}"
        class="hover:bg-surface-container-low/60 transition-colors cursor-pointer group">

      <!-- Order ID -->
      <td class="px-6 py-4">
        <span class="font-semibold text-primary tracking-wide">${_esc(o.order_code)}</span>
      </td>

      <!-- Farmer -->
      <td class="px-6 py-4">
        <div class="flex items-center gap-3">
          ${farmerAvatar
            ? `<img src="${_esc(farmerAvatar)}" alt="${_esc(farmerName)}" class="w-8 h-8 rounded-full object-cover border border-primary/15 shadow-sm shrink-0" />`
            : `<div class="w-8 h-8 rounded-full bg-primary-fixed/20 text-primary flex items-center justify-center font-bold text-xs shrink-0">${initials}</div>`}
          <div class="min-w-0">
            <p class="font-medium text-on-surface truncate">${_esc(farmerName)}</p>
            ${farmer.location
              ? `<p class="text-xs text-on-surface-variant truncate">${_esc(farmer.location)}</p>`
              : ''}
          </div>
        </div>
      </td>

      <!-- Date -->
      <td class="px-6 py-4 text-on-surface-variant text-sm">
        ${formatDate(o.placed_at)}
      </td>

      <!-- Total -->
      <td class="px-6 py-4 font-semibold text-on-surface">
        $${(o.total || 0).toFixed(2)}
      </td>

      <!-- Status -->
      <td class="px-6 py-4">
        ${orderStatusBadgeForOrdersPage(o.status)}
      </td>

      <!-- Chevron -->
      <td class="px-6 py-4 text-right">
        <span class="material-symbols-outlined text-on-surface-variant text-[20px]
                     opacity-0 group-hover:opacity-100 transition-opacity">
          chevron_right
        </span>
      </td>
    </tr>`;
}

function _normalizeOrderStatusKey(status) {
  const raw = (status ?? '').toString().trim().toLowerCase();
  if (raw === 'shiped') return 'shipped';
  return raw;
}

function orderStatusBadgeForOrdersPage(status) {
  const key = _normalizeOrderStatusKey(status);
  if (key === 'shipped') {
    const cls = (typeof ORDER_STATUS_CLS !== 'undefined' && ORDER_STATUS_CLS.shipped)
      ? ORDER_STATUS_CLS.shipped
      : 'bg-secondary-container text-on-secondary-container';
    return `
      <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${cls}">
        <span class="material-symbols-outlined text-[14px]">local_shipping</span>
        Shipped for delivery
      </span>`;
  }

  // Use the shared badge renderer for all other statuses to preserve styling.
  return (typeof orderStatusBadge === 'function')
    ? orderStatusBadge(key || status)
    : `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-surface-container text-on-surface-variant">${_esc(status || 'Unknown')}</span>`;
}

// ─── Detail modal ─────────────────────────────────────────────────────────────

async function openModal(orderId) {
  // Show a loading backdrop immediately so there's no lag perception
  const backdrop = document.createElement('div');
  backdrop.id        = 'order-detail-modal';
  backdrop.className = 'fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 overflow-y-auto';
  backdrop.innerHTML = `<div class="bg-surface rounded-2xl w-full max-w-2xl shadow-xl my-auto p-8
                                    flex items-center justify-center min-h-[200px]">
    <span class="material-symbols-outlined animate-spin text-primary text-3xl">progress_activity</span>
  </div>`;
  document.body.appendChild(backdrop);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.remove(); });

  try {
    const { order: o, items } = (await api.get(`/company/orders/${orderId}`)).data;

    const farmer     = o.farmer_id || {};
    const farmerName = farmer.user_id?.full_name || farmer.location || 'Farmer';
    const farmerPhone = farmer.user_id?.phone || o.contact_phone || null;
    const addr       = o.shipping_address || {};
    const addrLine   = [addr.street, addr.city, addr.state, addr.country].filter(Boolean).join(', ');

    const canShip = o.status === 'processing' || o.status === 'delivery_failed';

    backdrop.innerHTML = `
      <div class="bg-surface rounded-2xl w-full max-w-2xl shadow-xl my-auto overflow-hidden">

        <!-- ── Modal header ── -->
        <div class="px-6 py-5 border-b border-surface-variant flex items-start justify-between
                    bg-surface-bright">
          <div>
            <div class="flex items-center gap-2 mb-0.5">
              <span class="text-xs font-bold text-on-surface-variant uppercase tracking-widest">
                Order
              </span>
              <span class="text-xs font-bold text-primary tracking-widest">
                ${_esc(o.order_code)}
              </span>
            </div>
            <h2 class="text-xl font-bold text-on-surface">${_esc(farmerName)}</h2>
            <p class="text-sm text-on-surface-variant mt-0.5">
              Placed on ${formatDate(o.placed_at)}
            </p>
          </div>
          <div class="flex items-center gap-3 shrink-0">
            ${orderStatusBadgeForOrdersPage(o.status)}
            <button onclick="document.getElementById('order-detail-modal').remove()"
                    class="text-on-surface-variant hover:text-on-surface p-1 rounded-lg
                           hover:bg-surface-container transition-colors">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>

        <!-- ── Scrollable body ── -->
        <div class="max-h-[72vh] overflow-y-auto">

          <!-- Farmer & shipping row -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 px-6 pt-5">

            <!-- Farmer info card -->
            <div class="bg-surface-container rounded-xl p-4 flex items-center gap-3">
              <div class="w-11 h-11 rounded-full bg-primary-fixed/20 text-primary font-bold text-sm
                          flex items-center justify-center shrink-0">
                ${farmerName.substring(0, 2).toUpperCase()}
              </div>
              <div class="min-w-0">
                <p class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-0.5">
                  Farmer
                </p>
                <p class="text-sm font-semibold text-on-surface truncate">${_esc(farmerName)}</p>
                ${farmer.location
                  ? `<p class="text-xs text-on-surface-variant truncate">${_esc(farmer.location)}</p>`
                  : ''}
                ${farmerPhone
                  ? `<p class="text-xs text-on-surface-variant">${_esc(farmerPhone)}</p>`
                  : ''}
              </div>
            </div>

            <!-- Shipping address card -->
            <div class="bg-surface-container rounded-xl p-4">
              <p class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2 flex items-center gap-1">
                <span class="material-symbols-outlined text-[14px]">location_on</span>
                Shipping Address
              </p>
              ${addrLine
                ? `<p class="text-sm text-on-surface">${_esc(addrLine)}</p>`
                : `<p class="text-sm text-on-surface-variant italic">No address provided</p>`}
            </div>
          </div>

          <!-- ── Products in order ── -->
          <div class="px-6 pt-5">
            <p class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[15px]">shopping_basket</span>
              Products (${items?.length || 0})
            </p>

            <!-- Product list header -->
            <div class="grid grid-cols-12 text-xs font-semibold text-on-surface-variant
                        uppercase tracking-wider px-3 pb-2 border-b border-surface-variant mb-1">
              <span class="col-span-5">Product</span>
              <span class="col-span-2 text-center">Qty</span>
              <span class="col-span-2 text-right">Unit Price</span>
              <span class="col-span-3 text-right">Subtotal</span>
            </div>

            <!-- Product rows -->
            <div class="divide-y divide-surface-variant/60">
              ${(items || []).map(i => `
                <div class="grid grid-cols-12 items-center py-3 px-3 hover:bg-surface-container/50
                            rounded-lg transition-colors">
                  <!-- Name + category -->
                  <div class="col-span-5 flex items-center gap-3 min-w-0">
                    <div class="w-9 h-9 rounded-lg bg-primary-fixed/20 flex items-center
                                justify-center shrink-0">
                      <span class="material-symbols-outlined text-primary text-[18px]">science</span>
                    </div>
                    <div class="min-w-0">
                      <p class="text-sm font-semibold text-on-surface truncate">
                        ${_esc(i.product_name_snapshot || i.product_id?.name || '—')}
                      </p>
                      ${i.product_id?.category
                        ? `<p class="text-xs text-on-surface-variant capitalize">${_esc(i.product_id.category)}</p>`
                        : ''}
                    </div>
                  </div>
                  <!-- Qty -->
                  <div class="col-span-2 text-center">
                    <span class="text-sm font-semibold text-on-surface">${i.quantity}</span>
                    ${i.product_id?.unit
                      ? `<span class="text-xs text-on-surface-variant ml-0.5">${_esc(i.product_id.unit)}</span>`
                      : ''}
                  </div>
                  <!-- Unit price -->
                  <div class="col-span-2 text-right">
                    <span class="text-sm text-on-surface-variant">$${(i.unit_price || 0).toFixed(2)}</span>
                  </div>
                  <!-- Subtotal -->
                  <div class="col-span-3 text-right">
                    <span class="text-sm font-bold text-on-surface">$${(i.subtotal || 0).toFixed(2)}</span>
                  </div>
                </div>`).join('')}
            </div>
          </div>

          <!-- ── Totals ── -->
          <div class="px-6 pt-4 pb-2">
            <div class="bg-surface-container rounded-xl p-4 space-y-2">
              <div class="flex justify-between text-sm">
                <span class="text-on-surface-variant">Subtotal</span>
                <span class="text-on-surface">$${(o.subtotal || 0).toFixed(2)}</span>
              </div>
              ${o.shipping_cost
                ? `<div class="flex justify-between text-sm">
                     <span class="text-on-surface-variant">Shipping</span>
                     <span class="text-on-surface">$${(o.shipping_cost).toFixed(2)}</span>
                   </div>` : ''}
              <div class="flex justify-between text-base font-bold text-on-surface
                          border-t border-surface-variant pt-2 mt-1">
                <span>Total</span>
                <span class="text-primary">$${(o.total || 0).toFixed(2)}</span>
              </div>
            </div>
          </div>

          <!-- ── Notes ── -->
          ${o.notes ? `
          <div class="px-6 pt-3 pb-2">
            <div class="bg-surface-container rounded-xl p-4">
              <p class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <span class="material-symbols-outlined text-[14px]">notes</span>Notes
              </p>
              <p class="text-sm text-on-surface italic">"${_esc(o.notes)}"</p>
            </div>
          </div>` : ''}

          <!-- ── Action footer ── -->
          <div class="px-6 py-5">
            ${canShip
              ? `<!-- Mark as Shipped: the only action this company can take -->
                 <button id="btn-ship" onclick="markShipped('${o._id}', this, '${o.status}')"
                         class="w-full py-3 bg-primary text-on-primary rounded-xl text-sm font-bold
                                hover:opacity-90 active:scale-[0.98] transition-all flex items-center
                                justify-center gap-2 shadow-sm">
                   <span class="material-symbols-outlined text-[20px]">local_shipping</span>
                   ${o.status === 'delivery_failed' ? 'Reassign Delivery' : 'Mark as Shipped'}
                 </button>`
              : `<div class="w-full py-3 bg-surface-container rounded-xl text-sm text-center
                             text-on-surface-variant font-medium flex items-center justify-center gap-2">
                   <span class="material-symbols-outlined text-[18px]">info</span>
                   ${statusActionNote(o.status)}
                 </div>`}
          </div>

        </div><!-- /scrollable body -->
      </div>`;

  } catch (e) {
    console.error('[orders] openModal:', e);
    backdrop.remove();
    showToast('Failed to load order details', 'error');
  }
}

// ─── Mark as Shipped ──────────────────────────────────────────────────────────

async function markShipped(orderId, btn, currentStatus = 'processing') {
  btn.disabled = true;
  btn.innerHTML = `<span class="material-symbols-outlined text-[18px] animate-spin">progress_activity</span> Loading…`;
  try {
    const companies = await getDeliveryCompanies();
    btn.disabled = false;
    btn.innerHTML = `<span class="material-symbols-outlined text-[20px]">local_shipping</span> ${currentStatus === 'delivery_failed' ? 'Reassign Delivery' : 'Mark as Shipped'}`;

    if (!companies.length) {
      showToast('No delivery companies are available right now', 'error');
      return;
    }

    const selected = await openShipModal(companies, currentStatus === 'delivery_failed');
    if (!selected) return;

    btn.disabled = true;
    btn.innerHTML = `<span class="material-symbols-outlined text-[18px] animate-spin">progress_activity</span> Updating…`;
    await api.post(`/company/orders/${orderId}/delivery`, selected);
    showToast(currentStatus === 'delivery_failed' ? 'Delivery reassigned successfully!' : 'Order marked as shipped and assigned!', 'success');
    document.getElementById('order-detail-modal')?.remove();
    await loadOrders();
  } catch (err) {
    console.error('[orders] markShipped:', err);
    showToast(err?.message || 'Failed to update status', 'error');
    btn.disabled = false;
    btn.innerHTML = `<span class="material-symbols-outlined text-[20px]">local_shipping</span> ${currentStatus === 'delivery_failed' ? 'Reassign Delivery' : 'Mark as Shipped'}`;
  }
}

// ─── Filter wiring ────────────────────────────────────────────────────────────

function setupSearch() {
  const input = document.querySelector('input[placeholder*="Search"], input[placeholder*="search"]');
  if (!input) return;

  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      _state.search = input.value.trim();
      renderOrders();
    }, 250);
  });
}

function setupFilters() {
  const filterBtn = document.querySelector('[data-filter]');
  const modal = document.getElementById('filter-modal');
  const closeBtn = document.getElementById('close-filter');
  const clearBtn = document.getElementById('clear-filters');
  const applyBtn = document.getElementById('apply-filters');
  if (!filterBtn || !modal) return;

  const positionModal = () => {
    const btnRect = filterBtn.getBoundingClientRect();
    const modalWidth = 320;
    let left = btnRect.left;
    const top = btnRect.bottom + 8;
    if (left + modalWidth > window.innerWidth - 16) {
      left = Math.max(16, btnRect.right - modalWidth);
    }
    modal.style.top = `${top}px`;
    modal.style.left = `${left}px`;
  };

  const syncChipStates = () => {
    modal.querySelectorAll('.filter-chip input').forEach((input) => {
      const label = input.nextElementSibling;
      if (!label) return;
      if (input.checked) {
        label.style.backgroundColor = '#006a39';
        label.style.color = '#ffffff';
        label.style.borderColor = '#006a39';
      } else {
        label.style.backgroundColor = '';
        label.style.color = '';
        label.style.borderColor = '';
      }
    });
  };

  const syncModalFromState = () => {
    const statusInput = modal.querySelector(`input[name="order-status-filter"][value="${_state.filters.status}"]`)
      || modal.querySelector('input[name="order-status-filter"][value=""]');
    const dateInput = modal.querySelector(`input[name="order-date-filter"][value="${_state.filters.dateRange}"]`)
      || modal.querySelector('input[name="order-date-filter"][value="all"]');

    if (statusInput) statusInput.checked = true;
    if (dateInput) dateInput.checked = true;
    syncChipStates();
  };

  const closeModal = () => modal.classList.add('hidden');
  const openModal = () => {
    syncModalFromState();
    positionModal();
    modal.classList.remove('hidden');
  };

  filterBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    if (modal.classList.contains('hidden')) {
      openModal();
      return;
    }
    closeModal();
  });

  closeBtn?.addEventListener('click', closeModal);

  modal.querySelectorAll('.filter-chip input').forEach((input) => {
    input.addEventListener('change', syncChipStates);
  });

  clearBtn?.addEventListener('click', () => {
    _state.filters = { ...DEFAULT_FILTERS };
    syncModalFromState();
    renderOrders();
    closeModal();
  });

  applyBtn?.addEventListener('click', () => {
    const statusValue = modal.querySelector('input[name="order-status-filter"]:checked')?.value || '';
    const dateValue = modal.querySelector('input[name="order-date-filter"]:checked')?.value || 'all';
    _state.filters = {
      status: statusValue,
      dateRange: dateValue,
    };
    renderOrders();
    closeModal();
  });

  document.addEventListener('click', (event) => {
    if (!modal.contains(event.target) && !filterBtn.contains(event.target)) {
      closeModal();
    }
  });

  window.addEventListener('resize', () => {
    if (!modal.classList.contains('hidden')) positionModal();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeModal();
  });

  syncModalFromState();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns a human-readable note about why there's no action button */
function statusActionNote(status) {
  const notes = {
    shipped:   'Order has been shipped — no further action needed',
    on_the_way:'Order is on the way',
    arriving:  'Order is arriving',
    delivered: 'Order has been delivered',
    delivery_failed: 'Delivery failed — reassign it or cancel the order',
    cancelled: 'Order was cancelled',
  };
  return notes[status] || `Status: ${(status || '').replace(/_/g, ' ')}`;
}

async function getDeliveryCompanies() {
  if (_deliveryCompanies) return _deliveryCompanies;
  const res = await api.get('/company/delivery-companies');
  _deliveryCompanies = Array.isArray(res.data) ? res.data : [];
  return _deliveryCompanies;
}

function openShipModal(companies, isReassign = false) {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-4';
    modal.innerHTML = `
      <div class="bg-surface rounded-2xl w-full max-w-lg shadow-xl border border-surface-variant">
        <div class="px-5 py-4 border-b border-surface-variant bg-surface-bright rounded-t-2xl">
          <h3 class="text-lg font-bold text-on-surface">${isReassign ? 'Reassign Delivery Company' : 'Ship With Delivery Company'}</h3>
          <p class="text-sm text-on-surface-variant mt-1">Choose which delivery company should manage this order from here.</p>
        </div>
        <div class="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label class="block text-sm font-medium text-on-surface mb-2">Delivery Company</label>
            <select id="ship-delivery-company" class="w-full px-4 py-3 border border-outline-variant rounded-xl text-sm bg-surface-container-lowest">
              <option value="">Select a delivery company</option>
              ${companies.map((company) => `<option value="${company.id}">${_esc(company.name)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-on-surface mb-2">Estimated Delivery</label>
            <input id="ship-eta" type="datetime-local" class="w-full px-4 py-3 border border-outline-variant rounded-xl text-sm bg-surface-container-lowest" />
          </div>
          <div>
            <label class="block text-sm font-medium text-on-surface mb-2">Delivery Notes</label>
            <textarea id="ship-notes" rows="3" placeholder="Any notes for the delivery company..." class="w-full px-4 py-3 border border-outline-variant rounded-xl text-sm bg-surface-container-lowest resize-none"></textarea>
          </div>
        </div>
        <div class="px-5 py-4 border-t border-surface-variant bg-surface-bright rounded-b-2xl flex gap-3">
          <button id="ship-cancel" class="flex-1 py-2.5 border border-outline-variant rounded-xl text-sm font-medium text-on-surface">Cancel</button>
          <button id="ship-confirm" class="flex-1 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-semibold">${isReassign ? 'Reassign' : 'Mark as Shipped'}</button>
        </div>
      </div>`;

    const cleanup = (value = null) => {
      modal.remove();
      resolve(value);
    };

    modal.querySelector('#ship-cancel').addEventListener('click', () => cleanup(null));
    modal.querySelector('#ship-confirm').addEventListener('click', () => {
      const delivery_company_id = modal.querySelector('#ship-delivery-company').value;
      const eta = modal.querySelector('#ship-eta').value;
      const delivery_notes = modal.querySelector('#ship-notes').value.trim();
      if (!delivery_company_id) {
        showToast('Please choose a delivery company', 'error');
        return;
      }
      cleanup({
        delivery_company_id,
        eta: eta || null,
        delivery_notes: delivery_notes || null,
      });
    });
    modal.addEventListener('click', (event) => {
      if (event.target === modal) cleanup(null);
    });

    document.body.appendChild(modal);
  });
}

const setText = (sel, val) =>
  document.querySelectorAll(sel).forEach(el => (el.textContent = val ?? ''));
