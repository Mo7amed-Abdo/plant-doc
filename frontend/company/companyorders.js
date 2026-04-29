// companyorders.js
// Shows all ACCEPTED orders (processing → delivered / cancelled).
// Pending orders live on the Treatment Requests page.

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth('company')) return;
  populateSidebarUser();
  setupLogout();
  await loadOrders();
  setupFilters();
});

async function loadOrders(query = {}) {
  const tbody = document.querySelector('table tbody');
  if (!tbody) return;
  tbody.innerHTML = skeletonRows(5, 6);
  try {
    // exclude_pending=true tells the backend to skip status:'pending' orders
    const params = new URLSearchParams({ limit: 50, exclude_pending: 'true', ...query }).toString();
    const res    = await api.get(`/company/orders?${params}`);
    const orders = res.data || [];

    updateStats(orders);

    if (!orders.length) {
      tbody.innerHTML = `<tr>
        <td colspan="6" class="px-6 py-8 text-center text-on-surface-variant text-sm">No orders found</td>
      </tr>`;
      return;
    }

    tbody.innerHTML = orders.map(orderRow).join('');
    tbody.querySelectorAll('[data-order-row]').forEach(row => {
      row.addEventListener('click', () => openOrderModal(row.dataset.orderRow));
    });
  } catch (e) {
    tbody.innerHTML = `<tr>
      <td colspan="6" class="px-6 py-6 text-center text-error text-sm">${e.message}</td>
    </tr>`;
  }
}

function updateStats(orders) {
  setText('[data-stat="total-orders"]',      orders.length);
  setText('[data-stat="processing-orders"]', orders.filter(o => o.status === 'processing').length);
  setText('[data-stat="shipped-orders"]',    orders.filter(o => ['shipped', 'on_the_way', 'arriving'].includes(o.status)).length);
  setText('[data-stat="delivered-orders"]',  orders.filter(o => o.status === 'delivered').length);
}

function orderRow(o) {
  const farmer     = o.farmer_id || {};
  const farmerName = farmer.user_id?.full_name || farmer.location || 'Farmer';
  const initials   = farmerName.substring(0, 2).toUpperCase();

  return `<tr data-order-row="${o._id}"
              class="hover:bg-surface-container-low/50 transition-colors cursor-pointer group order-row">
    <td class="px-6 py-4 font-semibold text-primary">${o.order_code}</td>
    <td class="px-6 py-4">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container
                    flex items-center justify-center font-bold text-xs shrink-0">
          ${initials}
        </div>
        <div>
          <span class="font-medium text-on-surface block">${escapeHtml(farmerName)}</span>
          ${farmer.location
            ? `<span class="text-xs text-on-surface-variant">${escapeHtml(farmer.location)}</span>`
            : ''}
        </div>
      </div>
    </td>
    <td class="px-6 py-4 font-semibold text-on-surface">$${(o.total || 0).toFixed(2)}</td>
    <td class="px-6 py-4 text-on-surface-variant">${formatDate(o.placed_at)}</td>
    <td class="px-6 py-4">${orderStatusBadge(o.status)}</td>
    <td class="px-6 py-4 text-right opacity-0 group-hover:opacity-100">
      <span class="material-symbols-outlined text-on-surface-variant">chevron_right</span>
    </td>
  </tr>`;
}

async function openOrderModal(orderId) {
  try {
    // Fixed: Promise.allSettled returns {status, value} objects — destructure correctly
    const [orderRes, deliveryRes] = await Promise.allSettled([
      api.get(`/company/orders/${orderId}`).then(r => r.data),
      api.get('/company/deliveries').then(r =>
        (r.data || []).find(d =>
          d.order_id === orderId || d.order_id?._id?.toString() === orderId
        )
      ),
    ]);

    if (orderRes.status !== 'fulfilled') throw new Error('Failed to load order');
    const { order: o, items } = orderRes.value;
    const del = deliveryRes.status === 'fulfilled' ? deliveryRes.value : null;

    // Fixed: was incorrectly using o.company_id — use o.farmer_id
    const farmer     = o.farmer_id || {};
    const farmerName = farmer.user_id?.full_name || farmer.location || 'Farmer';
    const addr       = o.shipping_address || {};

    const m = document.createElement('div');
    m.className = 'fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 overflow-y-auto';
    m.innerHTML = `<div class="bg-surface rounded-2xl w-full max-w-2xl shadow-xl my-auto">
      <!-- Header -->
      <div class="p-5 border-b border-surface-variant flex items-start justify-between bg-surface-bright rounded-t-2xl">
        <div>
          <h3 class="text-lg font-bold text-on-surface">${o.order_code}</h3>
          <p class="text-sm text-on-surface-variant">${formatDate(o.placed_at)}</p>
        </div>
        <div class="flex items-center gap-2">
          ${orderStatusBadge(o.status)}
          <button onclick="this.closest('.fixed').remove()"
                  class="text-on-surface-variant hover:text-on-surface ml-2">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
      </div>

      <div class="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
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

        <!-- Status action buttons -->
        <div class="flex flex-wrap gap-2">
          ${o.status === 'processing'
            ? `<button onclick="changeStatus('${o._id}','shipped',this)"
                       class="px-4 py-2 bg-primary text-on-primary rounded-xl text-sm font-semibold
                              hover:opacity-90 flex items-center gap-1">
                 <span class="material-symbols-outlined text-[16px]">local_shipping</span>Mark Shipped
               </button>`
            : ''}
          ${o.status === 'shipped' && !del
            ? `<button onclick="createDelivery('${o._id}',this)"
                       class="px-4 py-2 bg-primary text-on-primary rounded-xl text-sm font-semibold
                              hover:opacity-90 flex items-center gap-1">
                 <span class="material-symbols-outlined text-[16px]">add_road</span>Create Delivery Record
               </button>`
            : ''}
        </div>

        <!-- Items -->
        <div>
          <p class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3">
            Items (${items?.length || 0})
          </p>
          <div class="space-y-2">
            ${(items || []).map(i => `
              <div class="flex items-center gap-3 bg-surface-container rounded-xl p-3">
                <div class="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center shrink-0">
                  <span class="material-symbols-outlined text-on-surface-variant text-[20px]">science</span>
                </div>
                <div class="flex-1">
                  <p class="text-sm font-semibold text-on-surface">${escapeHtml(i.product_name_snapshot)}</p>
                  <p class="text-xs text-on-surface-variant">
                    Qty: ${i.quantity} × $${(i.unit_price || 0).toFixed(2)}
                    ${i.product_id?.unit ? `(${i.product_id.unit})` : ''}
                  </p>
                </div>
                <span class="font-bold text-sm text-on-surface">$${(i.subtotal || 0).toFixed(2)}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Shipping + total -->
        <div class="grid grid-cols-2 gap-4">
          <div class="bg-surface-container rounded-xl p-4">
            <p class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
              Shipping Address
            </p>
            <p class="text-sm text-on-surface">${addr.street || '—'}</p>
            <p class="text-sm text-on-surface-variant">
              ${[addr.city, addr.state, addr.country].filter(Boolean).join(', ') || '—'}
            </p>
          </div>
          <div class="bg-surface-container rounded-xl p-4">
            <p class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
              Order Total
            </p>
            <div class="space-y-1">
              <div class="flex justify-between">
                <span class="text-sm text-on-surface-variant">Subtotal</span>
                <span class="text-sm text-on-surface">$${(o.subtotal || 0).toFixed(2)}</span>
              </div>
              <div class="flex justify-between border-t border-surface-variant pt-1 mt-1">
                <span class="text-sm font-bold text-on-surface">Total</span>
                <span class="text-sm font-bold text-on-surface">$${(o.total || 0).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        ${o.notes
          ? `<div class="bg-surface-container rounded-xl p-4">
               <p class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">Notes</p>
               <p class="text-sm text-on-surface italic">"${escapeHtml(o.notes)}"</p>
             </div>`
          : ''}

        ${del
          ? `<div class="bg-primary-fixed/20 rounded-xl p-4">
               <p class="text-xs font-semibold text-primary uppercase tracking-wider mb-2">Delivery</p>
               <div class="flex justify-between">
                 <span class="text-sm text-on-surface-variant">Status</span>
                 ${deliveryStatusBadge(del.status)}
               </div>
             </div>`
          : ''}
      </div>
    </div>`;

    document.body.appendChild(m);
    m.addEventListener('click', e => { if (e.target === m) m.remove(); });
  } catch (e) {
    showToast('Failed to load order details', 'error');
  }
}

async function changeStatus(orderId, status, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Updating…'; }
  try {
    await api.put(`/company/orders/${orderId}/status`, { status });
    showToast(`Order marked as ${status}`, 'success');
    document.querySelector('.fixed')?.remove();
    await loadOrders();
  } catch (err) {
    showToast(err.message || 'Failed', 'error');
    if (btn) { btn.disabled = false; }
  }
}

async function createDelivery(orderId, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }
  try {
    await api.post(`/company/orders/${orderId}/delivery`, {});
    showToast('Delivery record created!', 'success');
    document.querySelector('.fixed')?.remove();
    await loadOrders();
  } catch (err) {
    showToast(err.message || 'Failed', 'error');
    if (btn) { btn.disabled = false; }
  }
}

function setupFilters() {
  document.querySelectorAll('[data-filter-status]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-filter-status]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const s = btn.dataset.filterStatus;
      // Pass specific status OR fall back to exclude_pending for 'all'
      loadOrders(s && s !== 'all' ? { status: s } : {});
    });
  });

  const search = document.querySelector(
    'input[type="search"], input[placeholder*="Search"], input[placeholder*="search"]'
  );
  if (search) {
    let t;
    search.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => loadOrders({}), 400);
    });
  }
}

const setText = (sel, val) =>
  document.querySelectorAll(sel).forEach(el => (el.textContent = val ?? ''));