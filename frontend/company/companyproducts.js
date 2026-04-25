// companyproducts.js
document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth('company')) return;
  populateSidebarUser(); setupLogout();
  await loadListings();
  setupAddProduct();
});

async function loadListings() {
  const tbody=document.querySelector('table tbody,[data-products-table] tbody');
  const grid=document.querySelector('[data-products-grid]');
  const con=tbody||grid;
  if(!con) return;
  if(tbody) tbody.innerHTML=skeletonRows(4,6);
  else grid.innerHTML=skeletonCards(6);
  try {
    const items=(await api.get('/company/listings?limit=100')).data||[];
    updateStats(items);
    if(tbody) renderTable(items,tbody);
    else renderGrid(items,grid);
  }catch(e){if(tbody)tbody.innerHTML=`<tr><td colspan="6" class="px-6 py-8 text-center text-error text-sm">${e.message}</td></tr>`;else grid.innerHTML=`<div class="col-span-full py-8 text-center text-error text-sm">${e.message}</div>`;}
}

function updateStats(items) {
  setText('[data-stat="active-products"]',items.filter(i=>i.is_active).length);
  setText('[data-stat="low-stock"]',items.filter(i=>i.stock_status==='low_stock').length);
  setText('[data-stat="out-of-stock"]',items.filter(i=>i.stock_status==='out_of_stock').length);
}

function renderTable(items,tbody) {
  if(!items.length){tbody.innerHTML=`<tr><td colspan="6" class="px-6 py-8 text-center text-on-surface-variant text-sm">No products yet. Add your first product!</td></tr>`;return;}
  tbody.innerHTML=items.map(l=>{
    const p=l.product_id||{};
    const stockCls={in_stock:'bg-primary-fixed/30 text-primary',low_stock:'bg-error-container text-on-error-container',out_of_stock:'bg-surface-variant text-on-surface-variant'}[l.stock_status]||'';
    return `<tr class="hover:bg-surface-container-low/50 transition-colors group">
      <td class="px-6 py-4"><div class="flex items-center gap-3"><div class="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-on-surface-variant text-[18px]">science</span></div><span class="font-semibold text-on-surface">${p.name||'Product'}</span></div></td>
      <td class="px-6 py-4 capitalize text-on-surface-variant">${p.category||'—'}</td>
      <td class="px-6 py-4 font-bold text-on-surface">$${(l.price||0).toFixed(2)}</td>
      <td class="px-6 py-4">${l.stock_quantity}</td>
      <td class="px-6 py-4"><span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${stockCls}">${(l.stock_status||'').replace(/_/g,' ')}</span></td>
      <td class="px-6 py-4"><span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${l.is_active?'bg-primary-fixed/30 text-primary':'bg-surface-variant text-on-surface-variant'}">${l.is_active?'Active':'Paused'}</span></td>
      <td class="px-6 py-4 text-right opacity-0 group-hover:opacity-100 flex items-center gap-2 justify-end">
        <button data-edit-listing="${l._id}" class="text-on-surface-variant hover:text-primary transition-colors"><span class="material-symbols-outlined text-[18px]">edit</span></button>
        <button data-toggle-listing="${l._id}" data-active="${l.is_active}" class="text-on-surface-variant hover:text-primary transition-colors"><span class="material-symbols-outlined text-[18px]">${l.is_active?'pause_circle':'play_circle'}</span></button>
      </td>
    </tr>`;
  }).join('');
  tbody.querySelectorAll('[data-edit-listing]').forEach(btn=>btn.addEventListener('click',()=>editListing(btn.dataset.editListing)));
  tbody.querySelectorAll('[data-toggle-listing]').forEach(btn=>btn.addEventListener('click',()=>toggleListing(btn.dataset.toggleListing,btn.dataset.active==='true')));
}

function renderGrid(items,grid) {
  if(!items.length){grid.innerHTML=`<div class="col-span-full py-16 text-center"><span class="material-symbols-outlined text-5xl text-on-surface-variant/40 block mb-3">inventory_2</span><p class="text-on-surface-variant">No products yet</p></div>`;return;}
  grid.innerHTML=items.map(l=>{
    const p=l.product_id||{};
    return `<div class="bg-surface-container-lowest rounded-[16px] border border-surface-variant shadow-sm p-5 hover:shadow-md transition-all">
      <div class="flex items-start justify-between mb-3">
        <div><h3 class="font-bold text-on-surface">${p.name||'Product'}</h3><p class="text-xs text-on-surface-variant capitalize">${p.category||''}</p></div>
        <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${l.stock_status==='in_stock'?'bg-primary-fixed/30 text-primary':l.stock_status==='low_stock'?'bg-error-container text-on-error-container':'bg-surface-variant text-on-surface-variant'}">${(l.stock_status||'').replace(/_/g,' ')}</span>
      </div>
      <div class="flex items-center justify-between mb-4"><span class="text-xl font-bold text-on-surface">$${(l.price||0).toFixed(2)}</span><span class="text-sm text-on-surface-variant">${l.stock_quantity} in stock</span></div>
      <div class="flex gap-2">
        <button data-edit-listing="${l._id}" class="flex-1 py-2 border border-outline-variant rounded-xl text-xs font-medium text-on-surface hover:bg-surface-container flex items-center justify-center gap-1"><span class="material-symbols-outlined text-[14px]">edit</span>Edit</button>
        <button data-toggle-listing="${l._id}" data-active="${l.is_active}" class="flex-1 py-2 border border-outline-variant rounded-xl text-xs font-medium text-on-surface hover:bg-surface-container flex items-center justify-center gap-1"><span class="material-symbols-outlined text-[14px]">${l.is_active?'pause':'play_arrow'}</span>${l.is_active?'Pause':'Resume'}</button>
      </div>
    </div>`;
  }).join('');
  grid.querySelectorAll('[data-edit-listing]').forEach(btn=>btn.addEventListener('click',()=>editListing(btn.dataset.editListing)));
  grid.querySelectorAll('[data-toggle-listing]').forEach(btn=>btn.addEventListener('click',()=>toggleListing(btn.dataset.toggleListing,btn.dataset.active==='true')));
}

function setupAddProduct() {
  document.querySelectorAll('button').forEach(btn=>{
    const txt=btn.textContent?.trim()||'';
    if(txt.includes('Add Product')||txt.includes('New Product')) btn.addEventListener('click',openAddModal);
  });
}

function openAddModal() {
  const m=document.createElement('div');
  m.className='fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 overflow-y-auto';
  m.innerHTML=`<div class="bg-surface rounded-2xl w-full max-w-md shadow-xl my-auto">
    <div class="p-5 border-b border-surface-variant"><h3 class="text-lg font-bold text-on-surface">Add Product Listing</h3></div>
    <div class="p-5 space-y-4">
      <div><label class="block text-sm font-medium text-on-surface mb-1.5">Product Name *</label><input id="ap-name" type="text" placeholder="e.g. Copper Shield Max" class="w-full px-4 py-2.5 border border-outline-variant rounded-xl text-sm focus:ring-1 focus:ring-primary bg-surface-container-lowest"/></div>
      <div><label class="block text-sm font-medium text-on-surface mb-1.5">Category *</label>
        <select id="ap-category" class="w-full px-4 py-2.5 border border-outline-variant rounded-xl text-sm focus:ring-1 focus:ring-primary bg-surface-container-lowest">
          <option value="fungicide">Fungicide</option><option value="pesticide">Pesticide</option><option value="herbicide">Herbicide</option><option value="fertilizer">Fertilizer</option><option value="nutrient_booster">Nutrient Booster</option><option value="other">Other</option>
        </select>
      </div>
      <div><label class="block text-sm font-medium text-on-surface mb-1.5">Description</label><textarea id="ap-desc" rows="3" placeholder="Product description…" class="w-full px-4 py-3 border border-outline-variant rounded-xl text-sm focus:ring-1 focus:ring-primary resize-none bg-surface-container-lowest"></textarea></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="block text-sm font-medium text-on-surface mb-1.5">Price (USD) *</label><input id="ap-price" type="number" min="0" step="0.01" placeholder="0.00" class="w-full px-4 py-2.5 border border-outline-variant rounded-xl text-sm focus:ring-1 focus:ring-primary bg-surface-container-lowest"/></div>
        <div><label class="block text-sm font-medium text-on-surface mb-1.5">Stock Qty *</label><input id="ap-stock" type="number" min="0" placeholder="0" class="w-full px-4 py-2.5 border border-outline-variant rounded-xl text-sm focus:ring-1 focus:ring-primary bg-surface-container-lowest"/></div>
      </div>
      <div><label class="block text-sm font-medium text-on-surface mb-1.5">Unit</label><input id="ap-unit" type="text" placeholder="e.g. L, kg, ml" class="w-full px-4 py-2.5 border border-outline-variant rounded-xl text-sm focus:ring-1 focus:ring-primary bg-surface-container-lowest"/></div>
      <div><label class="block text-sm font-medium text-on-surface mb-1.5">Treats Diseases (comma separated)</label><input id="ap-diseases" type="text" placeholder="e.g. Early Blight, Downy Mildew" class="w-full px-4 py-2.5 border border-outline-variant rounded-xl text-sm focus:ring-1 focus:ring-primary bg-surface-container-lowest"/></div>
    </div>
    <div class="p-5 pt-0 flex gap-3">
      <button onclick="this.closest('.fixed').remove()" class="flex-1 py-2.5 border border-outline-variant rounded-xl text-sm font-medium text-on-surface-variant">Cancel</button>
      <button id="add-product-btn" class="flex-1 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-semibold">Add Product</button>
    </div>
  </div>`;
  document.body.appendChild(m);
  m.addEventListener('click',e=>{if(e.target===m)m.remove();});
  m.querySelector('#add-product-btn').addEventListener('click',async()=>{
    const name=m.querySelector('#ap-name').value.trim(), category=m.querySelector('#ap-category').value;
    const price=parseFloat(m.querySelector('#ap-price').value), stock=parseInt(m.querySelector('#ap-stock').value);
    if(!name||!price||isNaN(stock)){showToast('Fill required fields','error');return;}
    const btn=m.querySelector('#add-product-btn'); btn.disabled=true; btn.textContent='Adding…';
    try{
      // 1. Create product in master catalog
      const pFd=new FormData(); pFd.append('name',name); pFd.append('category',category);
      const desc=m.querySelector('#ap-desc').value.trim(); if(desc)pFd.append('description',desc);
      const unit=m.querySelector('#ap-unit').value.trim(); if(unit)pFd.append('unit',unit);
      const diseases=m.querySelector('#ap-diseases').value.trim(); if(diseases)pFd.append('treats_diseases',diseases);
      const prodRes=await api.post('/products',pFd);
      // 2. Create listing
      await api.post('/company/listings',{product_id:prodRes.data._id,price,stock_quantity:stock});
      m.remove(); showToast('Product added!','success'); await loadListings();
    }catch(err){showToast(err.message||'Failed','error');btn.disabled=false;btn.textContent='Add Product';}
  });
}

async function editListing(id) {
  const m=document.createElement('div');
  m.className='fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4';
  m.innerHTML=`<div class="bg-surface rounded-2xl p-6 w-full max-w-sm shadow-xl">
    <h3 class="text-lg font-bold text-on-surface mb-4">Edit Listing</h3>
    <div class="space-y-3">
      <div><label class="block text-sm font-medium text-on-surface mb-1.5">Price (USD)</label><input id="el-price" type="number" min="0" step="0.01" class="w-full px-4 py-2.5 border border-outline-variant rounded-xl text-sm focus:ring-1 focus:ring-primary bg-surface-container-lowest"/></div>
      <div><label class="block text-sm font-medium text-on-surface mb-1.5">Stock Quantity</label><input id="el-stock" type="number" min="0" class="w-full px-4 py-2.5 border border-outline-variant rounded-xl text-sm focus:ring-1 focus:ring-primary bg-surface-container-lowest"/></div>
    </div>
    <div class="flex gap-3 mt-5">
      <button onclick="this.closest('.fixed').remove()" class="flex-1 py-2.5 border border-outline-variant rounded-xl text-sm font-medium text-on-surface-variant">Cancel</button>
      <button id="el-save" class="flex-1 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-semibold">Save</button>
    </div>
  </div>`;
  document.body.appendChild(m);
  m.addEventListener('click',e=>{if(e.target===m)m.remove();});
  m.querySelector('#el-save').addEventListener('click',async()=>{
    const price=parseFloat(m.querySelector('#el-price').value), stock=parseInt(m.querySelector('#el-stock').value);
    const body={};
    if(!isNaN(price)&&price>=0)body.price=price;
    if(!isNaN(stock)&&stock>=0)body.stock_quantity=stock;
    if(!Object.keys(body).length){m.remove();return;}
    try{await api.put(`/company/listings/${id}`,body);m.remove();showToast('Updated!','success');await loadListings();}
    catch(err){showToast(err.message||'Failed','error');}
  });
}

async function toggleListing(id, isActive) {
  try{await api.put(`/company/listings/${id}`,{is_active:!isActive});showToast(isActive?'Listing paused':'Listing resumed','success');await loadListings();}
  catch(err){showToast(err.message||'Failed','error');}
}

const setText=(sel,val)=>document.querySelectorAll(sel).forEach(el=>el.textContent=val??'');
