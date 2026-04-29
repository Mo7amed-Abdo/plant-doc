// treatmentsolutions.js
let _cart = [], _cartOpen = false;

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth('farmer')) return;

  populateSidebarUser(); 
  setupLogout();

  await Promise.all([loadListings(), syncCart()]);

  setupSearch(); 
  setupCartPanel();

  // 👇 الفلتر — client-side only, no API reload
  document.getElementById('apply-filters').addEventListener('click', () => {
    if (typeof applyFilters === 'function') applyFilters();
  });
});

// ── Listings ──────────────────────────────────────────────────────────────────
async function loadListings(query = {}) {
  const grid = document.querySelector('[data-products-grid]');
  grid.innerHTML = skeletonCards(6);

  try {
    // ── CRITICAL FIX ─────────────────────────────────────────────────────────
    // Must use /product-listings, NOT /products.
    // The cart endpoint requires a ProductListing._id as product_listing_id.
    // Using a Product._id causes ProductListing.findById() to return null → 404.
    // /product-listings returns objects where:
    //   l._id        = ProductListing ID  ← what /cart/items needs
    //   l.product_id = populated Product  ← name, image, category, diseases
    //   l.price      = the real listing price
    // ─────────────────────────────────────────────────────────────────────────
    const res = await api.get('/product-listings');
    let items = res.data || [];

    // Filter by disease
    if (query.disease) {
      const d = query.disease.toLowerCase();
      items = items.filter(l => {
        const p = l.product_id || {};
        return (p.diseases || []).some(dis => dis.toLowerCase().includes(d))
            || (p.name        || '').toLowerCase().includes(d)
            || (p.category    || '').toLowerCase().includes(d)
            || (p.description || '').toLowerCase().includes(d);
      });
    }

    // Generic search
    if (query.search) {
      const q = query.search.toLowerCase();
      items = items.filter(l => {
        const p = l.product_id || {};
        return (p.name        || '').toLowerCase().includes(q)
            || (p.category    || '').toLowerCase().includes(q)
            || (p.description || '').toLowerCase().includes(q);
      });
    }

    if (!items.length) {
      grid.innerHTML = `<div class="col-span-full py-16 text-center"><span class="material-symbols-outlined text-5xl text-on-surface-variant/40 block mb-3">inventory_2</span><p class="text-on-surface-variant font-medium">No products found</p></div>`;
      return;
    }

    // Pass listing objects directly — listingCard already expects this shape
    grid.innerHTML = items.map(l => listingCard(l)).join('');

    grid.querySelectorAll('[data-add-cart]').forEach(btn => {
      btn.addEventListener('click', () =>
        addToCart(btn.dataset.addCart, btn.dataset.name, parseFloat(btn.dataset.price), btn.dataset.badge)
      );
    });

  } catch (e) {
    grid.innerHTML = `<div class="text-error col-span-full text-center py-8">${e.message}</div>`;
  }
}

function listingCard(l) {
  const p = l.product_id || {}, c = l.company_id || {};
  const ok = l.stock_status !== 'out_of_stock';
  const isLow = l.stock_status === 'low_stock';

  // l.price is the real ProductListing price — no guessing needed
  const price = parseFloat(l.price) || 0;

  // Disease badge (first disease or fallback to category)
  const disease = (p.diseases && p.diseases.length) ? p.diseases[0] : (p.category || 'Treatment');

  // Is it organic?
  const organic = (p.tags || []).some(t => /organic/i.test(t)) ||
                  /organic/i.test(p.description || '') ||
                  /organic/i.test(p.category || '');

  // Card gradient by category
  const gradMap = {
    fungicide:   'from-green-50 to-emerald-100',
    fertilizer:  'from-lime-50 to-green-100',
    pesticide:   'from-blue-50 to-cyan-100',
    herbicide:   'from-amber-50 to-yellow-100',
    insecticide: 'from-orange-50 to-amber-100',
  };
  const grad = gradMap[(p.category || '').toLowerCase()] || 'from-teal-50 to-emerald-100';

  const badgeLabel = `Treats: ${disease}`;
  // company_id may be a populated object or just an id string
  const companyName = c && typeof c === 'object' ? (c.name || c.company_name || '') : '';

  // data attributes used by client-side applyFilters()
  const diseaseAttr  = (p.diseases || []).join(',').toLowerCase();
  const categoryAttr = (p.category || '').toLowerCase();

  return `
  <div class="product-card bg-surface-container-lowest rounded-2xl border border-surface-variant shadow-sm overflow-hidden flex flex-col group${!ok ? ' opacity-60' : ''}"
       data-diseases="${diseaseAttr}"
       data-category="${categoryAttr}"
       data-price="${price}"
       data-organic="${organic}">
    <div class="relative h-44 overflow-hidden bg-gradient-to-br ${grad}">
      <div class="img-zoom w-full h-full flex items-center justify-center">
        ${p.default_image
          ? `<img src="${p.default_image}" alt="${p.name}" class="w-full h-full object-cover" />`
          : `<span class="material-symbols-outlined text-[72px] text-green-600/40">science</span>`}
      </div>
      <div class="absolute bottom-3 left-3">
        <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-primary/90 text-white backdrop-blur-sm shadow-sm">
          <span class="material-symbols-outlined text-[12px]">bug_report</span> ${escapeHtml(disease)}
        </span>
      </div>
      ${organic ? `
      <div class="absolute top-3 right-3">
        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-surface-container-lowest/90 text-primary border border-primary/20 shadow-sm">
          <span class="material-symbols-outlined text-[11px] fill">eco</span> Organic
        </span>
      </div>` : isLow ? `
      <div class="absolute top-3 right-3">
        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-error-container text-on-error-container shadow-sm">Low Stock</span>
      </div>` : ''}
      ${!ok ? `<div class="absolute inset-0 bg-surface/60 flex items-center justify-center"><span class="font-bold text-on-surface-variant">Out of Stock</span></div>` : ''}
    </div>
    <div class="flex flex-col flex-1 p-4 gap-3">
      <div>
        <h3 class="font-semibold text-on-surface text-sm leading-tight">${escapeHtml(p.name || 'Product')}</h3>
        <p class="text-xs text-on-surface-variant mt-0.5">${escapeHtml(companyName)}${p.unit ? ' · ' + escapeHtml(p.unit) : ''}</p>
      </div>
      <div class="flex flex-wrap gap-1.5">
        ${p.category ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border border-outline-variant bg-surface-container text-on-surface-variant">${escapeHtml(p.category)}</span>` : ''}
        ${p.description ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border border-outline-variant bg-surface-container text-on-surface-variant">${escapeHtml(p.description.substring(0, 28))}${p.description.length > 28 ? '…' : ''}</span>` : ''}
      </div>
      <div class="mt-auto flex items-center justify-between pt-2 border-t border-surface-variant">
        <span class="text-lg font-bold text-primary">EGP ${price.toFixed(0)}</span>
        <button data-add-cart="${l._id}"
                data-name="${escapeHtml(p.name || 'Product')}"
                data-price="${price}"
                data-badge="${escapeHtml(badgeLabel)}"
                ${!ok ? 'disabled' : ''}
                class="add-to-cart-btn flex items-center gap-1.5 px-3 py-1.5 bg-primary text-on-primary rounded-lg text-xs font-semibold hover:bg-primary/90 active:scale-[0.97] transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
          <span class="material-symbols-outlined text-[14px]">add_shopping_cart</span> Add to Cart
        </button>
      </div>
    </div>
  </div>`;
}

// ── Cart ──────────────────────────────────────────────────────────────────────
async function syncCart() {
  try { _cart = (await api.get('/cart')).data?.items || []; updateBadge(); }
  catch(_) {}
}

async function addToCart(listingId, name, price) {
  const cleanPrice = parseFloat(price) || 0;
  const ex = _cart.find(i => i.product_listing_id === listingId);
  if (ex) ex.quantity += 1;
  else _cart.push({ product_listing_id: listingId, quantity: 1, price_snapshot: cleanPrice, _name: name });

  updateBadge();
  if (typeof showToast === 'function') showToast(`${name} added to cart`, 'success');

  try {
    // ── CRITICAL FIX ─────────────────────────────────────────────────────────
    // price_snapshot is required by the CartItem schema (required: true, min: 0).
    // The original code omitted it → Mongoose validation error → cart never saved.
    // ─────────────────────────────────────────────────────────────────────────
    await api.post('/cart/items', {
      product_listing_id: listingId,
      quantity:           ex ? ex.quantity : 1,
      price_snapshot:     cleanPrice,
    });
  } catch (err) {
    if (typeof showToast === 'function') showToast(err.message || 'Cart error', 'error');
    await syncCart();
  }
  renderCart();
}

async function removeFromCart(id) {
  _cart = _cart.filter(i=>i.product_listing_id!==id); updateBadge(); renderCart();
  try { await api.delete(`/cart/items/${id}`); } catch(_) { await syncCart(); }
}

async function updateQty(id, qty) {
  if (qty<1) { removeFromCart(id); return; }
  const item = _cart.find(i=>i.product_listing_id===id);
  if (item) item.quantity=qty; updateBadge(); renderCart();
  try { await api.put(`/cart/items/${id}`,{quantity:qty}); } catch(_) {}
}

function updateBadge() {
  const n = _cart.reduce((s,i)=>s+i.quantity,0);
  document.querySelectorAll('[data-cart-count]').forEach(el=>{el.textContent=n;el.classList.toggle('hidden',n===0);});
}

function setupCartPanel() {
  // ── DISABLED ─────────────────────────────────────────────────────────────
  // The HTML has its own #cart-drawer with full cart/checkout/order UX.
  // Creating #cart-panel here would open a second drawer and intercept the
  // cart button clicks, breaking the HTML drawer entirely.
  // All cart UI is handled by the inline <script> in treatmentsolutions.html.
  // ─────────────────────────────────────────────────────────────────────────
}

function toggleCart() {
  // Delegate to the HTML drawer's openCart function if available
  if (typeof openCart === 'function') openCart();
}

function renderCart() {
  const body=document.getElementById('cart-body'), tot=document.getElementById('cart-total');
  if (!body) return;
  if (!_cart.length) { body.innerHTML=`<div class="py-12 text-center"><span class="material-symbols-outlined text-4xl text-on-surface-variant/40 block mb-2">shopping_cart</span><p class="text-on-surface-variant text-sm">Your cart is empty</p></div>`; if(tot) tot.textContent='$0.00'; return; }
  const total = _cart.reduce((s,i)=>s+i.price_snapshot*i.quantity,0);
  if (tot) tot.textContent = `$${total.toFixed(2)}`;
  body.innerHTML = _cart.map(i=>`
    <div class="flex items-center gap-3 bg-surface-container rounded-xl p-3">
      <div class="flex-1 min-w-0"><p class="text-sm font-semibold text-on-surface truncate">${i._name||'Product'}</p><p class="text-xs text-on-surface-variant">$${(i.price_snapshot||0).toFixed(2)} each</p></div>
      <div class="flex items-center gap-1">
        <button onclick="updateQty('${i.product_listing_id}',${i.quantity-1})" class="w-7 h-7 rounded-lg border border-outline-variant flex items-center justify-center text-on-surface hover:bg-surface-variant text-lg font-bold">−</button>
        <span class="w-8 text-center text-sm font-bold text-on-surface">${i.quantity}</span>
        <button onclick="updateQty('${i.product_listing_id}',${i.quantity+1})" class="w-7 h-7 rounded-lg border border-outline-variant flex items-center justify-center text-on-surface hover:bg-surface-variant text-lg font-bold">+</button>
      </div>
      <button onclick="removeFromCart('${i.product_listing_id}')" class="text-on-surface-variant hover:text-error transition-colors"><span class="material-symbols-outlined text-[18px]">delete</span></button>
    </div>`).join('');
}

// ── Checkout ──────────────────────────────────────────────────────────────────
async function startCheckout() {
  try { await syncCart(); } catch(_) {}
  if (!_cart.length) { showToast('Your cart is empty','error'); return; }
  const m = document.createElement('div');
  m.className = 'fixed inset-0 bg-black/50 z-[9998] flex items-center justify-center p-4 overflow-y-auto';
  m.innerHTML = `<div class="bg-surface rounded-2xl w-full max-w-md shadow-xl my-auto">
    <div class="p-5 border-b border-surface-variant"><h3 class="text-lg font-bold text-on-surface">Shipping Details</h3></div>
    <div class="p-5 space-y-4">
      <div><label class="block text-sm font-medium text-on-surface mb-1.5">Street Address *</label><input id="sh-street" type="text" placeholder="123 Farm Road" class="w-full px-4 py-2.5 border border-outline-variant rounded-xl text-sm focus:ring-1 focus:ring-primary bg-surface-container-lowest"/></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="block text-sm font-medium text-on-surface mb-1.5">City *</label><input id="sh-city" type="text" placeholder="Cairo" class="w-full px-4 py-2.5 border border-outline-variant rounded-xl text-sm focus:ring-1 focus:ring-primary bg-surface-container-lowest"/></div>
        <div><label class="block text-sm font-medium text-on-surface mb-1.5">Country *</label><input id="sh-country" type="text" placeholder="Egypt" class="w-full px-4 py-2.5 border border-outline-variant rounded-xl text-sm focus:ring-1 focus:ring-primary bg-surface-container-lowest"/></div>
      </div>
      <div><label class="block text-sm font-medium text-on-surface mb-1.5">Phone</label><input id="sh-phone" type="tel" placeholder="+20 100 000 0000" class="w-full px-4 py-2.5 border border-outline-variant rounded-xl text-sm focus:ring-1 focus:ring-primary bg-surface-container-lowest"/></div>
      <div><label class="block text-sm font-medium text-on-surface mb-1.5">Notes</label><input id="sh-notes" type="text" placeholder="Delivery instructions…" class="w-full px-4 py-2.5 border border-outline-variant rounded-xl text-sm focus:ring-1 focus:ring-primary bg-surface-container-lowest"/></div>
      <div class="bg-surface-container rounded-xl p-4"><div class="flex justify-between"><span class="text-sm text-on-surface-variant">${_cart.length} item(s)</span><span class="text-sm font-bold text-on-surface">$${_cart.reduce((s,i)=>s+i.price_snapshot*i.quantity,0).toFixed(2)}</span></div></div>
    </div>
    <div class="p-5 pt-0 flex gap-3">
      <button onclick="this.closest('.fixed').remove()" class="flex-1 py-2.5 border border-outline-variant rounded-xl text-sm font-medium text-on-surface-variant">Cancel</button>
      <button id="place-btn" class="flex-1 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-semibold">Place Order</button>
    </div></div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if(e.target===m) m.remove(); });
  m.querySelector('#place-btn').addEventListener('click', async () => {
    const street=m.querySelector('#sh-street').value.trim(), city=m.querySelector('#sh-city').value.trim(), country=m.querySelector('#sh-country').value.trim();
    if (!street||!city||!country) { showToast('Please fill required fields','error'); return; }
    const btn=m.querySelector('#place-btn'); btn.disabled=true; btn.textContent='Placing…';
    try {
      const res = await api.post('/cart/checkout',{shipping_address:{street,city,country,state:'',zip:''},contact_phone:m.querySelector('#sh-phone').value.trim()||null,notes:m.querySelector('#sh-notes').value.trim()||null});
      m.remove(); _cart=[]; updateBadge(); renderCart(); if(_cartOpen) toggleCart();
      showToast(`${res.data.length} order(s) placed!`,'success');
      setTimeout(()=>window.location.href='ordertracking.html',1200);
    } catch(err) { showToast(err.message||'Checkout failed','error'); btn.disabled=false; btn.textContent='Place Order'; }
  });
}

// ── Search / filter ───────────────────────────────────────────────────────────
function setupSearch() {
  const inp = document.querySelector('input[type="search"], input[placeholder*="Search"], input[placeholder*="search"]');
  if (inp) { let t; inp.addEventListener('input',()=>{ clearTimeout(t); t=setTimeout(()=>loadListings(inp.value.trim()?{search:inp.value.trim()}:{}),400); }); }
  document.querySelectorAll('[data-filter-category]').forEach(chip => {
    chip.addEventListener('click', () => {
      const on = chip.classList.toggle('active');
      loadListings(on?{category:chip.dataset.filterCategory}:{});
    });
  });
}