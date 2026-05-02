// companyproducts.js

const PAGE_SIZE = 12;
const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;
const PRODUCT_NOTIFICATION_POLL_MS = 30000;

let _state = {
  page: 1,
  total: 0,
  search: '',
  category: '',
  stock: '',
  sort: 'newest',
};

let _productNotifications = [];
let _productNotificationSocket = null;
let _notificationPollHandle = null;
let _notificationSeenIds = new Set();
let _hasPromptedForBrowserNotifications = false;

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth('company')) return;
  populateSidebarUser();
  setupLogout();
  setupAddProduct();
  setupFilterPanel();
  setupSearch();
  setupProductNotifications();
  await Promise.all([
    loadListings(),
    loadProductNotifications({ initial: true }),
  ]);
  connectProductNotificationSocket();
  startProductNotificationPolling();
});

async function loadListings(resetPage = false) {
  if (resetPage) _state.page = 1;

  const grid = document.querySelector('[data-product-grid]');
  if (!grid) { console.warn('[products] [data-product-grid] not found'); return; }

  grid.innerHTML = Array(PAGE_SIZE).fill(0).map(() => `
    <div class="bg-surface-container-lowest rounded-[16px] border border-surface-variant
                shadow-sm p-5 animate-pulse">
      <div class="w-full h-32 rounded-xl bg-surface-container mb-4"></div>
      <div class="h-4 bg-surface-container rounded w-3/4 mb-2"></div>
      <div class="h-3 bg-surface-container rounded w-1/2"></div>
    </div>`).join('');

  try {
    const params = new URLSearchParams({
      page: _state.page,
      limit: PAGE_SIZE,
    });
    if (_state.search) params.set('search', _state.search);
    if (_state.category) params.set('category', _state.category);
    if (_state.stock) params.set('stock_status', _state.stock);
    if (_state.sort) params.set('sort', _state.sort);

    const res = await api.get(`/company/listings?${params}`);
    const items = res.data || [];
    const meta = res.meta || {};
    _state.total = meta.total ?? items.length;

    updateStats(items, _state.total);
    renderGrid(items, grid);
    renderPagination(_state.page, _state.total, PAGE_SIZE);
  } catch (e) {
    console.error('[products] loadListings:', e);
    grid.innerHTML = `
      <div class="col-span-full py-10 text-center text-error text-sm">
        ${e?.message || 'Failed to load products'}
      </div>`;
  }
}

function updateStats(pageItems, total) {
  setText('[data-stat="total-products"]', total);
  setText('[data-stat="active-products"]', pageItems.filter((i) => i.is_active).length);
  setText('[data-stat="low-stock"]', pageItems.filter((i) => i.stock_status === 'low_stock').length);
  setText('[data-stat="out-of-stock"]', pageItems.filter((i) => i.stock_status === 'out_of_stock').length);
}

function renderGrid(items, grid) {
  if (!items.length) {
    grid.innerHTML = `
      <div class="col-span-full py-20 flex flex-col items-center gap-3 text-center">
        <span class="material-symbols-outlined text-5xl text-on-surface-variant/30">inventory_2</span>
        <p class="text-base font-semibold text-on-surface-variant">No products found</p>
        <p class="text-sm text-on-surface-variant/60">
          ${_state.search || _state.category || _state.stock
            ? 'Try changing your search or filters'
            : 'Click "Add Product" to create your first listing'}
        </p>
      </div>`;
    return;
  }

  grid.innerHTML = items.map(productCard).join('');

  grid.querySelectorAll('[data-edit-listing]').forEach((btn) =>
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      editListing(btn.dataset.editListing);
    })
  );

  grid.querySelectorAll('[data-toggle-listing]').forEach((btn) =>
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleListing(btn.dataset.toggleListing, btn.dataset.active === 'true');
    })
  );
}

function productCard(listing) {
  const product = listing.product_id || {};
  const imageMarkup = product.default_image
    ? `<img src="${product.default_image}" alt="${_esc(product.name || 'Product image')}"
            class="w-full h-full object-cover product-img"
            onerror="this.style.display='none'; this.nextElementSibling.classList.remove('hidden');" />
       <div class="hidden absolute inset-0">${productImagePlaceholder()}</div>`
    : productImagePlaceholder();

  const stockMeta = {
    in_stock: { cls: 'bg-primary-fixed/30 text-primary', dot: 'bg-primary', label: 'In Stock' },
    low_stock: { cls: 'bg-error-container text-on-error-container', dot: 'bg-error', label: 'Low Stock' },
    out_of_stock: { cls: 'bg-surface-variant text-on-surface-variant', dot: 'bg-outline', label: 'Out of Stock' },
  }[listing.stock_status] || {
    cls: 'bg-surface-variant text-on-surface-variant',
    dot: 'bg-outline',
    label: listing.stock_status || '-',
  };

  const activeBadge = listing.is_active
    ? '<span class="text-xs font-semibold text-primary bg-primary-fixed/30 px-2 py-0.5 rounded-full">Active</span>'
    : '<span class="text-xs font-semibold text-on-surface-variant bg-surface-variant px-2 py-0.5 rounded-full">Paused</span>';

  return `
    <div class="bg-surface-container-lowest rounded-[16px] border border-surface-variant
                shadow-sm hover:shadow-md transition-all flex flex-col group overflow-hidden">
      <div class="relative h-36 bg-surface-container flex items-center justify-center overflow-hidden shrink-0">
        ${imageMarkup}
        <span class="absolute top-3 right-3 w-2.5 h-2.5 rounded-full ${stockMeta.dot}
                     ring-2 ring-surface-container-lowest"></span>
      </div>

      <div class="p-4 flex flex-col flex-1 gap-3">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <h3 class="font-bold text-on-surface text-sm leading-tight truncate">
              ${_esc(product.name || 'Unnamed Product')}
            </h3>
            <p class="text-xs text-on-surface-variant capitalize mt-0.5">
              ${_esc(product.category || '-')}
            </p>
          </div>
          ${activeBadge}
        </div>

        <div class="flex items-center justify-between">
          <span class="text-xl font-bold text-on-surface">$${(listing.price || 0).toFixed(2)}</span>
          <span class="text-sm text-on-surface-variant">${listing.stock_quantity} ${product.unit ? _esc(product.unit) : 'units'}</span>
        </div>

        <span class="inline-flex items-center gap-1.5 self-start px-2.5 py-1 rounded-full
                     text-xs font-semibold ${stockMeta.cls}">
          ${stockMeta.label}
        </span>

        <div class="flex gap-2 mt-auto pt-1">
          <button data-edit-listing="${listing._id}"
                  data-listing-price="${listing.price}"
                  data-listing-stock="${listing.stock_quantity}"
                  class="flex-1 py-2 border border-outline-variant rounded-xl text-xs font-semibold
                         text-on-surface hover:bg-surface-container flex items-center justify-center
                         gap-1 transition-colors active:scale-[0.97]">
            <span class="material-symbols-outlined text-[14px]">edit</span>Edit
          </button>
          <button data-toggle-listing="${listing._id}" data-active="${listing.is_active}"
                  class="flex-1 py-2 border border-outline-variant rounded-xl text-xs font-semibold
                         ${listing.is_active ? 'text-error hover:bg-error-container' : 'text-primary hover:bg-primary-fixed/20'}
                         flex items-center justify-center gap-1 transition-colors active:scale-[0.97]">
            <span class="material-symbols-outlined text-[14px]">${listing.is_active ? 'pause' : 'play_arrow'}</span>
            ${listing.is_active ? 'Pause' : 'Resume'}
          </button>
        </div>
      </div>
    </div>`;
}

function renderPagination(page, total, limit) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  const info = document.getElementById('pagination-info');
  if (info) {
    info.innerHTML = total === 0
      ? 'No results'
      : `Showing <span class="font-bold text-on-surface">${from}</span>-<span class="font-bold text-on-surface">${to}</span> of <span class="font-bold text-on-surface">${total}</span> products`;
  }

  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  if (btnPrev) {
    btnPrev.disabled = page <= 1;
    btnPrev.onclick = () => goToPage(page - 1);
  }
  if (btnNext) {
    btnNext.disabled = page >= totalPages;
    btnNext.onclick = () => goToPage(page + 1);
  }

  const nums = document.getElementById('page-numbers');
  if (!nums) return;
  if (totalPages <= 1) { nums.innerHTML = ''; return; }

  const pages = buildPageRange(page, totalPages);
  nums.innerHTML = pages.map((p) => {
    if (p === '...') {
      return '<span class="w-9 h-9 flex items-center justify-center text-sm text-on-surface-variant">...</span>';
    }
    const isActive = p === page;
    return `<button onclick="goToPage(${p})"
                    class="w-9 h-9 flex items-center justify-center text-sm rounded-lg
                           transition-colors active:scale-[0.97]
                           ${isActive
                             ? 'font-bold bg-primary text-on-primary shadow-sm'
                             : 'font-medium text-on-surface-variant hover:bg-surface-container'}">
              ${p}
            </button>`;
  }).join('');
}

function buildPageRange(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const pages = [];
  const addPage = (page) => {
    if (!pages.includes(page) && page >= 1 && page <= total) pages.push(page);
  };
  addPage(1);
  if (current > 3) pages.push('...');
  for (let i = current - 1; i <= current + 1; i += 1) addPage(i);
  if (current < total - 2) pages.push('...');
  addPage(total);
  return pages;
}

function goToPage(page) {
  _state.page = page;
  loadListings();
  document.querySelector('[data-product-grid]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setupSearch() {
  const input = document.querySelector('input[placeholder*="Search"], input[placeholder*="search"]');
  if (!input) return;
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      _state.search = input.value.trim();
      loadListings(true);
    }, 380);
  });
}

function setupFilterPanel() {
  const modal = document.getElementById('filter-modal');
  const applyBtn = document.getElementById('apply-filters');
  const clearBtn = document.getElementById('clear-filters');
  if (!modal) return;

  const CATEGORY_MAP = {
    Antibiotics: 'antibiotic',
    Analgesics: 'analgesic',
    Antihistamines: 'antihistamine',
    Supplements: 'supplement',
    Fungicide: 'fungicide',
    Pesticide: 'pesticide',
    Herbicide: 'herbicide',
    Fertilizer: 'fertilizer',
  };

  const STOCK_MAP = {
    'In Stock': 'in_stock',
    'Low Stock': 'low_stock',
    'Out of Stock': 'out_of_stock',
  };

  const SORT_MAP = {
    Newest: 'newest',
    'Price: Low-High': 'price_asc',
    'Price: High-Low': 'price_desc',
    'Name: A-Z': 'name_asc',
    'Price: Low–High': 'price_asc',
    'Price: High–Low': 'price_desc',
    'Name: A–Z': 'name_asc',
  };

  applyBtn?.addEventListener('click', () => {
    const checkedCats = [...modal.querySelectorAll('input[type="checkbox"]:checked')]
      .map((checkbox) => {
        const label = checkbox.nextElementSibling?.textContent?.trim() || '';
        return CATEGORY_MAP[label] || '';
      })
      .filter(Boolean);
    _state.category = checkedCats[0] || '';

    const checkedStock = [...modal.querySelectorAll('input[type="checkbox"]:checked')]
      .map((checkbox) => {
        const label = checkbox.nextElementSibling?.textContent?.trim() || '';
        return STOCK_MAP[label] || '';
      })
      .filter(Boolean);
    _state.stock = checkedStock[0] || '';

    const checkedSort = modal.querySelector('input[type="radio"]:checked');
    const sortLabel = checkedSort?.nextElementSibling?.textContent?.trim() || '';
    _state.sort = SORT_MAP[sortLabel] || 'newest';

    modal.classList.add('hidden');
    loadListings(true);
  });

  clearBtn?.addEventListener('click', () => {
    _state.category = '';
    _state.stock = '';
    _state.sort = 'newest';
    loadListings(true);
  });
}

function setupAddProduct() {
  document.querySelectorAll('button').forEach((btn) => {
    if ((btn.textContent?.trim() || '').includes('Add Product')) {
      btn.addEventListener('click', openAddModal);
    }
  });
}

function openAddModal() {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 overflow-y-auto';
  modal.innerHTML = `
    <div class="bg-surface rounded-2xl w-full max-w-md shadow-xl my-auto">
      <div class="p-5 border-b border-surface-variant flex items-center justify-between">
        <h3 class="text-lg font-bold text-on-surface">Add Product Listing</h3>
        <button onclick="this.closest('.fixed').remove()"
                class="text-on-surface-variant hover:text-on-surface">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <div class="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
        <div>
          <label class="block text-sm font-medium text-on-surface mb-1.5">Product Name *</label>
          <input id="ap-name" type="text" placeholder="e.g. Copper Shield Max"
                 class="w-full px-4 py-2.5 border border-outline-variant rounded-xl text-sm
                        focus:ring-1 focus:ring-primary bg-surface-container-lowest"/>
        </div>
        <div>
          <label class="block text-sm font-medium text-on-surface mb-1.5">Category *</label>
          <select id="ap-category"
                  class="w-full px-4 py-2.5 border border-outline-variant rounded-xl text-sm
                         focus:ring-1 focus:ring-primary bg-surface-container-lowest">
            <option value="fungicide">Fungicide</option>
            <option value="pesticide">Pesticide</option>
            <option value="herbicide">Herbicide</option>
            <option value="fertilizer">Fertilizer</option>
            <option value="nutrient_booster">Nutrient Booster</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-on-surface mb-1.5">Description</label>
          <textarea id="ap-desc" rows="3" placeholder="Product description..."
                    class="w-full px-4 py-3 border border-outline-variant rounded-xl text-sm
                           focus:ring-1 focus:ring-primary resize-none bg-surface-container-lowest"></textarea>
        </div>
        <div>
          <label class="block text-sm font-medium text-on-surface mb-2">Product Photo</label>
          <input id="ap-image" type="file" accept="image/jpeg,image/png,image/webp,image/gif" class="hidden" />
          <div class="border border-dashed border-outline-variant rounded-2xl bg-surface-container-low p-4">
            <div id="ap-image-empty" class="flex flex-col items-center justify-center text-center gap-2 py-4">
              <div class="w-14 h-14 rounded-full bg-surface-container-lowest border border-surface-variant flex items-center justify-center">
                <span class="material-symbols-outlined text-[24px] text-on-surface-variant">image</span>
              </div>
              <div>
                <p class="text-sm font-semibold text-on-surface">Upload product image</p>
                <p class="text-xs text-on-surface-variant mt-1">PNG, JPG, WEBP, or GIF up to 5MB</p>
              </div>
              <button id="ap-image-select" type="button"
                      class="mt-2 inline-flex items-center gap-2 px-4 py-2 border border-outline-variant rounded-xl text-sm font-medium text-on-surface hover:bg-surface-container transition-colors active:scale-[0.98]">
                <span class="material-symbols-outlined text-[18px]">upload</span>
                Choose Image
              </button>
            </div>
            <div id="ap-image-preview-wrap" class="hidden">
              <div class="relative overflow-hidden rounded-2xl border border-surface-variant bg-surface-container-lowest">
                <img id="ap-image-preview" alt="Selected product preview" class="w-full h-44 object-cover" />
              </div>
              <div class="flex items-center justify-between gap-3 mt-3">
                <div class="min-w-0">
                  <p id="ap-image-name" class="text-sm font-semibold text-on-surface truncate"></p>
                  <p id="ap-image-size" class="text-xs text-on-surface-variant mt-0.5"></p>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <button id="ap-image-change" type="button"
                          class="px-3 py-2 border border-outline-variant rounded-xl text-xs font-semibold text-on-surface hover:bg-surface-container transition-colors active:scale-[0.98]">
                    Change
                  </button>
                  <button id="ap-image-remove" type="button"
                          class="px-3 py-2 border border-outline-variant rounded-xl text-xs font-semibold text-error hover:bg-error-container transition-colors active:scale-[0.98]">
                    Remove
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-medium text-on-surface mb-1.5">Price (USD) *</label>
            <input id="ap-price" type="number" min="0" step="0.01" placeholder="0.00"
                   class="w-full px-4 py-2.5 border border-outline-variant rounded-xl text-sm
                          focus:ring-1 focus:ring-primary bg-surface-container-lowest"/>
          </div>
          <div>
            <label class="block text-sm font-medium text-on-surface mb-1.5">Stock Qty *</label>
            <input id="ap-stock" type="number" min="0" placeholder="0"
                   class="w-full px-4 py-2.5 border border-outline-variant rounded-xl text-sm
                          focus:ring-1 focus:ring-primary bg-surface-container-lowest"/>
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-on-surface mb-1.5">Unit</label>
          <input id="ap-unit" type="text" placeholder="e.g. L, kg, ml"
                 class="w-full px-4 py-2.5 border border-outline-variant rounded-xl text-sm
                        focus:ring-1 focus:ring-primary bg-surface-container-lowest"/>
        </div>
        <div>
          <label class="block text-sm font-medium text-on-surface mb-1.5">
            Treats Diseases <span class="text-on-surface-variant font-normal">(comma separated)</span>
          </label>
          <input id="ap-diseases" type="text" placeholder="e.g. Early Blight, Downy Mildew"
                 class="w-full px-4 py-2.5 border border-outline-variant rounded-xl text-sm
                        focus:ring-1 focus:ring-primary bg-surface-container-lowest"/>
        </div>
      </div>
      <div class="p-5 pt-0 flex gap-3">
        <button onclick="this.closest('.fixed').remove()"
                class="flex-1 py-2.5 border border-outline-variant rounded-xl text-sm
                       font-medium text-on-surface-variant hover:bg-surface-container transition-colors">
          Cancel
        </button>
        <button id="add-product-btn"
                class="flex-1 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-semibold
                       hover:opacity-90 transition-colors">
          Add Product
        </button>
      </div>
    </div>`;

  document.body.appendChild(modal);
  modal.addEventListener('click', (event) => { if (event.target === modal) modal.remove(); });

  let selectedImageFile = null;
  let selectedImageUrl = '';

  const imageInput = modal.querySelector('#ap-image');
  const imageEmpty = modal.querySelector('#ap-image-empty');
  const imagePreviewWrap = modal.querySelector('#ap-image-preview-wrap');
  const imagePreview = modal.querySelector('#ap-image-preview');
  const imageName = modal.querySelector('#ap-image-name');
  const imageSize = modal.querySelector('#ap-image-size');

  const clearSelectedImage = () => {
    if (selectedImageUrl) URL.revokeObjectURL(selectedImageUrl);
    selectedImageFile = null;
    selectedImageUrl = '';
    imageInput.value = '';
    imageEmpty.classList.remove('hidden');
    imagePreviewWrap.classList.add('hidden');
    imagePreview.removeAttribute('src');
    imageName.textContent = '';
    imageSize.textContent = '';
  };

  const setSelectedImage = (file) => {
    const validationError = validateProductImage(file);
    if (validationError) {
      showToast(validationError, 'error');
      clearSelectedImage();
      return;
    }
    if (selectedImageUrl) URL.revokeObjectURL(selectedImageUrl);
    selectedImageFile = file;
    selectedImageUrl = URL.createObjectURL(file);
    imagePreview.src = selectedImageUrl;
    imageName.textContent = file.name;
    imageSize.textContent = formatFileSize(file.size);
    imageEmpty.classList.add('hidden');
    imagePreviewWrap.classList.remove('hidden');
  };

  modal.querySelector('#ap-image-select')?.addEventListener('click', () => imageInput.click());
  modal.querySelector('#ap-image-change')?.addEventListener('click', () => imageInput.click());
  modal.querySelector('#ap-image-remove')?.addEventListener('click', clearSelectedImage);
  imageInput?.addEventListener('change', () => {
    const file = imageInput.files?.[0];
    if (file) setSelectedImage(file);
  });

  modal.querySelector('#add-product-btn').addEventListener('click', async () => {
    const name = modal.querySelector('#ap-name').value.trim();
    const category = modal.querySelector('#ap-category').value;
    const price = parseFloat(modal.querySelector('#ap-price').value);
    const stock = parseInt(modal.querySelector('#ap-stock').value, 10);

    if (!name) { showToast('Product name is required', 'error'); return; }
    if (isNaN(price)) { showToast('Price is required', 'error'); return; }
    if (isNaN(stock)) { showToast('Stock quantity is required', 'error'); return; }

    const button = modal.querySelector('#add-product-btn');
    button.disabled = true;
    button.textContent = 'Adding...';

    try {
      const productForm = new FormData();
      productForm.append('name', name);
      productForm.append('category', category);
      const description = modal.querySelector('#ap-desc').value.trim();
      const unit = modal.querySelector('#ap-unit').value.trim();
      const diseases = modal.querySelector('#ap-diseases').value.trim();
      if (description) productForm.append('description', description);
      if (unit) productForm.append('unit', unit);
      if (diseases) productForm.append('treats_diseases', diseases);
      if (selectedImageFile) productForm.append('default_image', selectedImageFile);

      const productRes = await api.post('/products', productForm);
      await api.post('/company/listings', {
        product_id: productRes.data._id,
        price,
        stock_quantity: stock,
      });

      if (selectedImageUrl) URL.revokeObjectURL(selectedImageUrl);
      modal.remove();
      showToast('Product added successfully!', 'success');
      await loadListings(true);
    } catch (error) {
      showToast(error?.message || 'Failed to add product', 'error');
      button.disabled = false;
      button.textContent = 'Add Product';
    }
  });
}

async function editListing(listingId) {
  const btn = document.querySelector(`[data-edit-listing="${listingId}"]`);
  const price = btn?.dataset.listingPrice ?? '';
  const stock = btn?.dataset.listingStock ?? '';

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4';
  modal.innerHTML = `
    <div class="bg-surface rounded-2xl w-full max-w-sm shadow-xl">
      <div class="p-5 border-b border-surface-variant flex items-center justify-between">
        <h3 class="text-lg font-bold text-on-surface">Edit Listing</h3>
        <button onclick="this.closest('.fixed').remove()"
                class="text-on-surface-variant hover:text-on-surface">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <div class="p-5 space-y-4">
        <div>
          <label class="block text-sm font-medium text-on-surface mb-1.5">Price (USD)</label>
          <input id="el-price" type="number" min="0" step="0.01" value="${price}"
                 class="w-full px-4 py-2.5 border border-outline-variant rounded-xl text-sm
                        focus:ring-1 focus:ring-primary bg-surface-container-lowest"/>
        </div>
        <div>
          <label class="block text-sm font-medium text-on-surface mb-1.5">Stock Quantity</label>
          <input id="el-stock" type="number" min="0" value="${stock}"
                 class="w-full px-4 py-2.5 border border-outline-variant rounded-xl text-sm
                        focus:ring-1 focus:ring-primary bg-surface-container-lowest"/>
        </div>
      </div>
      <div class="px-5 pb-5 flex gap-3">
        <button onclick="this.closest('.fixed').remove()"
                class="flex-1 py-2.5 border border-outline-variant rounded-xl text-sm font-medium
                       text-on-surface-variant hover:bg-surface-container transition-colors">
          Cancel
        </button>
        <button id="el-save"
                class="flex-1 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-semibold
                       hover:opacity-90 transition-colors">
          Save Changes
        </button>
      </div>
    </div>`;

  document.body.appendChild(modal);
  modal.addEventListener('click', (event) => { if (event.target === modal) modal.remove(); });

  modal.querySelector('#el-save').addEventListener('click', async () => {
    const newPrice = parseFloat(modal.querySelector('#el-price').value);
    const newStock = parseInt(modal.querySelector('#el-stock').value, 10);
    const body = {};
    if (!isNaN(newPrice) && newPrice >= 0) body.price = newPrice;
    if (!isNaN(newStock) && newStock >= 0) body.stock_quantity = newStock;

    if (!Object.keys(body).length) { modal.remove(); return; }

    const saveBtn = modal.querySelector('#el-save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
      await api.put(`/company/listings/${listingId}`, body);
      modal.remove();
      showToast('Listing updated!', 'success');
      await loadListings();
    } catch (error) {
      showToast(error?.message || 'Failed to update', 'error');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Changes';
    }
  });
}

async function toggleListing(id, isActive) {
  try {
    await api.put(`/company/listings/${id}`, { is_active: !isActive });
    showToast(isActive ? 'Listing paused' : 'Listing resumed', 'success');
    await loadListings();
  } catch (error) {
    showToast(error?.message || 'Failed', 'error');
  }
}

function setupProductNotifications() {
  const toggle = document.querySelector('[data-notif-toggle]');
  const dropdown = document.querySelector('[data-notif-dropdown]');
  const markAllBtn = document.querySelector('[data-mark-all-read]');
  const retryBtn = document.querySelector('[data-notif-retry]');
  if (!toggle || !dropdown) return;

  const positionDropdown = () => {
    const rect = toggle.getBoundingClientRect();
    const width = 360;
    let left = rect.right - width;
    left = Math.max(16, Math.min(left, window.innerWidth - width - 16));
    dropdown.style.top = `${rect.bottom + 10}px`;
    dropdown.style.left = `${left}px`;
  };

  toggle.addEventListener('click', async (event) => {
    event.stopPropagation();
    positionDropdown();
    dropdown.classList.toggle('hidden');
    if (!dropdown.classList.contains('hidden')) {
      await maybePromptForBrowserNotifications();
      if (!_productNotifications.length) await loadProductNotifications();
    }
  });

  markAllBtn?.addEventListener('click', async (event) => {
    event.stopPropagation();
    await markAllProductNotificationsRead();
  });

  retryBtn?.addEventListener('click', async (event) => {
    event.stopPropagation();
    await loadProductNotifications();
  });

  document.addEventListener('click', (event) => {
    if (dropdown.contains(event.target) || toggle.contains(event.target)) return;
    dropdown.classList.add('hidden');
  });

  window.addEventListener('resize', () => {
    if (!dropdown.classList.contains('hidden')) positionDropdown();
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      loadProductNotifications({ silent: true }).catch(() => null);
    }
  });
}

async function loadProductNotifications(options = {}) {
  const { initial = false, silent = false } = options;
  const list = document.querySelector('[data-notif-list]');
  const errorWrap = document.querySelector('[data-notif-error-wrap]');
  const errorText = document.querySelector('[data-notif-error]');

  if (!silent && list) {
    list.innerHTML = '<div class="py-10 text-center text-sm text-on-surface-variant">Loading notifications...</div>';
  }
  if (errorWrap) errorWrap.classList.add('hidden');

  try {
    const res = await api.get('/notifications?limit=20');
    const items = dedupeById((res.data || []).map(normalizeProductNotification));
    const previousIds = new Set(_notificationSeenIds);
    _productNotifications = items;

    if (initial) {
      _notificationSeenIds = new Set(items.map((item) => item._id));
    } else {
      items.forEach((item) => {
        if (!previousIds.has(item._id)) notifyAboutIncomingProductNotification(item);
        _notificationSeenIds.add(item._id);
      });
    }

    renderProductNotifications();
    updateProductNotificationBadge();
  } catch (error) {
    if (errorWrap && errorText) {
      errorText.textContent = error?.message || 'Failed to load notifications.';
      errorWrap.classList.remove('hidden');
    }
    if (!_productNotifications.length && list) {
      list.innerHTML = '<div class="py-10 text-center text-sm text-error">Failed to load notifications.</div>';
    }
  }
}

function renderProductNotifications() {
  const list = document.querySelector('[data-notif-list]');
  const status = document.querySelector('[data-notif-status]');
  if (!list) return;

  if (status) {
    const live = !!(_productNotificationSocket && _productNotificationSocket.connected);
    status.className = 'px-5 py-3 border-b border-surface-variant text-xs';
    status.innerHTML = live
      ? '<span class="font-semibold text-primary">Live updates connected</span>'
      : '<span class="font-semibold text-on-surface-variant">Using automatic refresh</span>';
    status.classList.remove('hidden');
  }

  if (!_productNotifications.length) {
    list.innerHTML = `
      <div class="flex flex-col items-center justify-center py-12 text-center gap-3">
        <div class="w-16 h-16 rounded-full bg-surface-container border border-surface-variant flex items-center justify-center">
          <span class="material-symbols-outlined text-[30px] text-on-surface-variant/40">notifications_off</span>
        </div>
        <div>
          <p class="font-semibold text-slate-600 text-sm">No notifications</p>
          <p class="text-xs text-slate-400 mt-1">You are all caught up.</p>
        </div>
      </div>`;
    return;
  }

  list.innerHTML = _productNotifications.map(productNotificationCard).join('');
  list.querySelectorAll('[data-product-notification-id]').forEach((element) => {
    element.addEventListener('click', async () => {
      const notification = _productNotifications.find((item) => item._id === element.dataset.productNotificationId);
      if (!notification) return;
      await openProductNotification(notification);
    });
  });
}

function productNotificationCard(notification) {
  const unread = !notification.is_read;
  const style = getProductNotificationStyle(notification.type);
  return `<button type="button" data-product-notification-id="${notification._id}"
    class="w-full text-left relative flex items-start gap-4 px-4 py-4 bg-white rounded-2xl border ${unread ? 'border-green-100 bg-green-50/30' : 'border-slate-100'} shadow-sm hover:bg-slate-50 transition-colors">
    ${unread ? '<div class="absolute left-0 top-0 bottom-0 w-[3px] bg-primary rounded-l-2xl"></div>' : ''}
    <div class="w-11 h-11 rounded-full ${style.bg} border ${style.ring} flex items-center justify-center shrink-0">
      <span class="material-symbols-outlined fill ${style.color} text-[20px]">${style.icon}</span>
    </div>
    <div class="flex-1 min-w-0">
      <div class="flex items-start justify-between gap-3">
        <p class="text-sm font-bold text-on-surface leading-snug">${_esc(notification.title || 'Notification')}</p>
        <div class="flex items-center gap-2 shrink-0">
          <span class="text-[11px] font-medium text-slate-400 whitespace-nowrap">${timeAgo(notification.created_at)}</span>
          ${unread ? '<div class="w-2 h-2 bg-primary rounded-full shrink-0 mt-0.5"></div>' : ''}
        </div>
      </div>
      <p class="text-sm text-slate-500 mt-0.5 leading-relaxed">${_esc(notification.body || notification.message || '')}</p>
    </div>
  </button>`;
}

function getProductNotificationStyle(type) {
  const styles = {
    new_order: { icon: 'shopping_basket', bg: 'bg-blue-50', color: 'text-blue-600', ring: 'border-blue-100' },
    low_stock: { icon: 'inventory_2', bg: 'bg-amber-50', color: 'text-amber-600', ring: 'border-amber-100' },
    order_status: { icon: 'local_shipping', bg: 'bg-violet-50', color: 'text-violet-600', ring: 'border-violet-100' },
  };
  return styles[type] || { icon: 'notifications', bg: 'bg-slate-50', color: 'text-slate-500', ring: 'border-slate-200' };
}

function updateProductNotificationBadge() {
  const unreadCount = _productNotifications.filter((item) => !item.is_read).length;
  document.querySelectorAll('[data-notif-count]').forEach((element) => {
    element.textContent = unreadCount > 99 ? '99+' : unreadCount;
    element.classList.toggle('hidden', unreadCount === 0);
  });
}

async function openProductNotification(notification) {
  if (!notification.is_read) await markProductNotificationRead(notification._id);
  const link = productNotificationLink(notification);
  if (link) window.location.href = link;
}

function productNotificationLink(notification) {
  if (notification.related_type === 'order') return '/frontend/company/orders.html';
  if (notification.related_type === 'product_listing') return '/frontend/company/products.html';
  return '';
}

async function markProductNotificationRead(notificationId) {
  try {
    await api.patch(`/notifications/${notificationId}/read`, {});
    const target = _productNotifications.find((item) => item._id === notificationId);
    if (target) target.is_read = true;
    renderProductNotifications();
    updateProductNotificationBadge();
  } catch (error) {
    console.error('[products] mark notification failed:', error);
  }
}

async function markAllProductNotificationsRead() {
  try {
    await api.put('/notifications/read-all');
    _productNotifications.forEach((item) => { item.is_read = true; });
    renderProductNotifications();
    updateProductNotificationBadge();
    showToast('All notifications marked as read', 'success');
  } catch (error) {
    showToast(error?.message || 'Failed to mark notifications as read', 'error');
  }
}

function connectProductNotificationSocket() {
  if (typeof io === 'undefined') return;

  _productNotificationSocket = io('http://localhost:5000', { auth: { token: Auth.getToken() } });
  _productNotificationSocket.on('connect', () => renderProductNotifications());
  _productNotificationSocket.on('disconnect', () => renderProductNotifications());
  _productNotificationSocket.on('notification:new', (notification) => {
    const normalized = normalizeProductNotification(notification);
    if (_productNotifications.some((item) => item._id === normalized._id)) return;
    _productNotifications.unshift(normalized);
    _productNotifications = dedupeById(_productNotifications);
    _notificationSeenIds.add(normalized._id);
    renderProductNotifications();
    updateProductNotificationBadge();
    notifyAboutIncomingProductNotification(normalized);
  });
  _productNotificationSocket.on('error', ({ message }) => {
    console.error('[products][socket]', message);
  });
}

function startProductNotificationPolling() {
  clearInterval(_notificationPollHandle);
  _notificationPollHandle = setInterval(() => {
    loadProductNotifications({ silent: true }).catch(() => null);
  }, PRODUCT_NOTIFICATION_POLL_MS);
}

function normalizeProductNotification(notification) {
  return {
    ...notification,
    _id: notification._id || notification.id,
    is_read: notification.is_read ?? notification.isRead ?? false,
    created_at: notification.created_at || notification.createdAt || new Date().toISOString(),
  };
}

function dedupeById(items) {
  const seen = new Set();
  return (items || []).filter((item) => {
    const id = item?._id || item?.id;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function notifyAboutIncomingProductNotification(notification) {
  if (typeof playNotificationTone === 'function') playNotificationTone();
  showToast(notification.title || 'New notification', 'info');
  showBrowserNotification(notification);
}

async function maybePromptForBrowserNotifications() {
  if (_hasPromptedForBrowserNotifications) return;
  _hasPromptedForBrowserNotifications = true;
  if (typeof Notification === 'undefined' || Notification.permission !== 'default') return;
  try {
    await Notification.requestPermission();
  } catch (_) {
    // Ignore permission errors
  }
}

function showBrowserNotification(notification) {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  if (!document.hidden) return;
  try {
    const browserNotification = new Notification(notification.title || 'PlantDoc notification', {
      body: notification.body || notification.message || '',
      tag: `plantdoc-${notification._id}`,
    });
    browserNotification.onclick = () => {
      window.focus();
      const link = productNotificationLink(notification);
      if (link) window.location.href = link;
      browserNotification.close();
    };
  } catch (_) {
    // Ignore browser notification failures
  }
}

function productImagePlaceholder() {
  return `<div class="absolute inset-0 flex items-center justify-center">
    <span class="material-symbols-outlined text-5xl text-on-surface-variant/20">science</span>
  </div>`;
}

function validateProductImage(file) {
  if (!file) return '';
  if (!file.type.startsWith('image/')) return 'Please select an image file';
  if (file.size > MAX_PRODUCT_IMAGE_BYTES) return 'Image must be under 5MB';
  return '';
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function _esc(str) {
  if (typeof escapeHtml === 'function') return escapeHtml(str);
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const setText = (sel, val) =>
  document.querySelectorAll(sel).forEach((el) => { el.textContent = val ?? ''; });
