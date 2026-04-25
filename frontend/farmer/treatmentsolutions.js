// treatmentsolutions.js
let _cart = [], _cartOpen = false;

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth('farmer')) return;
  populateSidebarUser(); setupLogout();
  await Promise.all([loadListings(), syncCart()]);
  setupSearch(); setupCartPanel();
});

// ── Listings ──────────────────────────────────────────────────────────────────
async function loadListings(query={}) {
  const grid = document.querySelector('[data-products-grid], main .grid');
  if (!grid) return;
  grid.innerHTML = skeletonCards(6);
  try {
    const params = new URLSearchParams({limit:20,...query}).toString();
    const items  = (await api.get(`/product-listings?${params}`)).data || [];
    if (!items.length) { grid.innerHTML=`<div class="col-span-full py-16 text-center"><span class="material-symbols-outlined text-5xl text-on-surface-variant/40 block mb-3">inventory_2</span><p class="text-on-surface-variant">No products found</p></div>`; return; }
    grid.innerHTML = items.map(listingCard).join('');
    grid.querySelectorAll('[data-add-cart]').forEach(btn => btn.addEventListener('click', () => addToCart(btn.dataset.addCart, btn.dataset.name, parseFloat(btn.dataset.price))));
  } catch(e) { grid.innerHTML=`<div class="col-span-full py-8 text-center text-error text-sm">${e.message}</div>`; }
}

function listingCard(l) {
  const p=l.product_id||{}, c=l.company_id||{}, ok=l.stock_status!=='out_of_stock';
  return `<article class="group bg-surface-container-lowest rounded-[16px] border border-surface-variant overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col">
    <div class="relative h-48 overflow-hidden bg-surface-container flex items-center justify-center">
      ${p.default_image?`<img src="${p.default_image}" alt="${p.name}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"/>`:`<span class="material-symbols-outlined text-5xl text-on-surface-variant/30">science</span>`}
      <div class="absolute top-3 left-3"><span class="text-xs font-semibold px-2 py-1 rounded-full bg-surface/90 text-on-surface capitalize">${p.category||'Product'}</span></div>
      ${l.stock_status==='low_stock'?`<div class="absolute top-3 right-3"><span class="text-xs font-semibold px-2 py-1 rounded-full bg-error-container text-on-error-container">Low Stock</span></div>`:''}
      ${!ok?`<div class="absolute inset-0 bg-surface/70 flex items-center justify-center"><span class="font-bold text-on-surface-variant">Out of Stock</span></div>`:''}
    </div>
    <div class="p-4 flex flex-col flex-1 gap-2">
      <div><h3 class="font-bold text-on-surface leading-tight">${p.name||'Product'}</h3><p class="text-xs text-on-surface-variant mt-0.5">${c.name||''}</p></div>
      ${p.description?`<p class="text-xs text-on-surface-variant line-clamp-2">${p.description}</p>`:''}
      <div class="flex items-center justify-between mt-auto pt-2"><span class="text-lg font-bold text-on-surface">$${(l.price||0).toFixed(2)}</span><span class="text-xs text-on-surface-variant">${l.currency||'USD'}/${p.unit||'unit'}</span></div>
      <button data-add-cart="${l._id}" data-name="${escapeHtml(p.name||'Product')}" data-price="${l.price}" ${!ok?'disabled':''}
        class="w-full bg-primary text-on-primary py-2.5 rounded-xl text-sm font-medium hover:opacity-90 flex items-center justify-center gap-1.5 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed">
        <span class="material-symbols-outlined text-[16px]">shopping_cart</span>Add to Cart
      </button>
    </div></article>`;
}

// ── Cart ──────────────────────────────────────────────────────────────────────
async function syncCart() {
  try { _cart = (await api.get('/cart')).data?.items || []; updateBadge(); }
  catch(_) {}
}

async function addToCart(listingId, name, price) {
  const ex = _cart.find(i=>i.product_listing_id===listingId);
  if (ex) ex.quantity+=1; else _cart.push({product_listing_id:listingId,quantity:1,price_snapshot:price,_name:name});
  updateBadge(); showToast(`${name} added to cart`,'success');
  try { await api.post('/cart/items',{product_listing_id:listingId,quantity:ex?.quantity||1}); }
  catch(err) { showToast(err.message||'Cart error','error'); await syncCart(); }
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
  if (!document.getElementById('cart-panel')) {
    const p = document.createElement('div');
    p.id = 'cart-panel';
    p.className = 'fixed top-0 right-0 h-full w-full max-w-sm bg-surface shadow-2xl z-[9997] transform translate-x-full transition-transform duration-300 flex flex-col';
    p.innerHTML = `
      <div class="p-5 border-b border-surface-variant flex items-center justify-between bg-surface-bright">
        <h2 class="text-lg font-bold text-on-surface flex items-center gap-2"><span class="material-symbols-outlined fill text-primary">shopping_cart</span>Your Cart</h2>
        <button id="close-cart" class="text-on-surface-variant hover:text-on-surface"><span class="material-symbols-outlined">close</span></button>
      </div>
      <div id="cart-body" class="flex-1 overflow-y-auto p-4 space-y-3"></div>
      <div class="p-5 border-t border-surface-variant bg-surface-bright">
        <div class="flex justify-between items-center mb-4"><span class="font-semibold text-on-surface">Total</span><span id="cart-total" class="text-xl font-bold text-on-surface">$0.00</span></div>
        <button id="checkout-btn" class="w-full py-3 bg-primary text-on-primary rounded-xl font-semibold hover:opacity-90 active:scale-[0.98]">Proceed to Checkout</button>
      </div>`;
    document.body.appendChild(p);
    document.getElementById('close-cart').addEventListener('click', toggleCart);
    document.getElementById('checkout-btn').addEventListener('click', startCheckout);
  }
  // Wire cart button(s)
  document.querySelectorAll('button').forEach(btn => {
    const icon = btn.querySelector('.material-symbols-outlined');
    if (icon && (icon.textContent.trim()==='shopping_cart'||icon.textContent.trim()==='shopping_basket')) {
      if (!btn.querySelector('[data-cart-count]')) {
        const b=document.createElement('span'); b.setAttribute('data-cart-count','');
        b.className='absolute -top-1 -right-1 w-5 h-5 bg-error text-white text-[10px] font-bold rounded-full flex items-center justify-center hidden';
        btn.style.position='relative'; btn.appendChild(b);
      }
      btn.addEventListener('click', toggleCart);
    }
  });
}

function toggleCart() {
  _cartOpen = !_cartOpen;
  document.getElementById('cart-panel')?.classList.toggle('translate-x-full', !_cartOpen);
  renderCart();
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
function startCheckout() {
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
