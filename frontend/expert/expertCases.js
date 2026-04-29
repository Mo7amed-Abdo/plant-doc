const state = {
  page: 1,
  limit: 3,
  total: 0,
  totalPages: 0,
  hasPrevPage: false,
  hasNextPage: false,
  cases: [],
  filters: {
    crop: '',
    severity: '',
    sort: 'newest',
  },
};

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth('expert')) return;
  bindCasePageActions();
  await loadValidatedCases();
});

async function loadValidatedCases() {
  const grid = document.querySelector('[data-cases-grid]');
  const summary = document.querySelector('[data-pagination-summary]');
  if (!grid || !summary) return;

  grid.innerHTML = skeletonCards(6);

  const params = new URLSearchParams({
    page: String(state.page),
    limit: String(state.limit),
    sort: state.filters.sort,
  });

  if (state.filters.crop) params.set('crop', state.filters.crop);
  if (state.filters.severity) params.set('severity', state.filters.severity);

  try {
    const res = await api.get(`/cases/validated?${params.toString()}`);
    state.cases = res.data || [];
    state.total = res.meta?.total || 0;
    state.totalPages = res.meta?.totalPages || 0;
    state.hasPrevPage = Boolean(res.meta?.hasPrevPage);
    state.hasNextPage = Boolean(res.meta?.hasNextPage);

    renderCases();
    renderSummary(res.meta || {});
    renderActiveFilters();
  } catch (error) {
    grid.innerHTML = `<div class="col-span-full rounded-[28px] border border-red-200 bg-red-50 px-6 py-12 text-center text-red-700">Failed to load validated cases.</div>`;
    summary.textContent = 'Could not load pagination.';
  }
}

function renderCases() {
  const grid = document.querySelector('[data-cases-grid]');
  if (!grid) return;

  if (!state.cases.length) {
    grid.innerHTML = `<div class="col-span-full rounded-[28px] border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
      <div class="mx-auto w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-4">
        <span class="material-symbols-outlined text-[38px]">inventory_2</span>
      </div>
      <h3 class="text-xl font-bold text-slate-900">No validated cases found</h3>
      <p class="mt-2 text-sm text-slate-500">Try adjusting the filters or check back after more expert reviews are completed.</p>
    </div>`;
    return;
  }

  grid.innerHTML = state.cases.map(renderCaseCard).join('');
  grid.querySelectorAll('[data-details-id]').forEach((button) => {
    button.addEventListener('click', () => openCaseDetails(button.dataset.detailsId));
  });
}

function renderCaseCard(item) {
  return `<article class="group overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-[0_16px_35px_-26px_rgba(15,23,42,0.28)]">
    <div class="relative h-52 bg-slate-100">
      ${renderImage(item)}
      <div class="absolute inset-x-0 top-0 p-4 flex items-start justify-between gap-3">
        ${renderStatusBadge(item.validationStatus || item.status)}
        ${renderSeverityBadge(item.severity)}
      </div>
      <div class="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/75 via-black/15 to-transparent">
        <p class="text-xs uppercase tracking-[0.22em] font-bold text-white/75">${escapeHtml(item.cropName || item.plantName || 'Unknown crop')}</p>
        <h3 class="mt-2 text-2xl font-extrabold text-white leading-tight">${escapeHtml(item.diseaseName || item.title || 'Validated Case')}</h3>
      </div>
    </div>

    <div class="p-5 flex flex-col gap-4">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-sm font-semibold text-slate-900">${escapeHtml(item.title || item.diseaseName || 'Untitled case')}</p>
          <p class="mt-1 text-xs font-medium text-slate-500">Validated ${formatDate(item.validatedAt || item.reviewedAt || item.createdAt)}</p>
        </div>
        <div class="text-right">
          <p class="text-lg font-black text-emerald-700">${Number(item.confidence || 0).toFixed(0)}%</p>
          <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Confidence</p>
        </div>
      </div>

      <div>
        <div class="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div class="h-full rounded-full bg-gradient-to-r from-emerald-500 via-green-500 to-teal-500" style="width:${Math.max(6, Math.min(Number(item.confidence || 0), 100))}%"></div>
        </div>
      </div>

      <p class="text-sm leading-6 text-slate-600">${escapeHtml(trimText(item.recommendation || item.description || item.farmerMessage || 'No recommendation available yet.', 140))}</p>

      <button type="button" data-details-id="${item.id}" class="mt-auto inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 transition-colors hover:bg-slate-100">
        <span class="material-symbols-outlined text-[18px]">visibility</span>
        Details
      </button>
    </div>
  </article>`;
}

function renderImage(item) {
  if (!item.imageUrl) return placeholderImageMarkup();

  return `<div class="relative w-full h-full">
    <img src="${item.imageUrl}" alt="${escapeHtml(item.title || item.plantName || 'Case image')}" class="w-full h-full object-cover" onerror="this.style.display='none';this.nextElementSibling.classList.remove('hidden');" />
    <div class="hidden absolute inset-0">${placeholderImageMarkup()}</div>
  </div>`;
}

function placeholderImageMarkup() {
  return `<div class="w-full h-full flex items-center justify-center bg-slate-100 text-slate-400"><div class="w-24 h-24 rounded-[28px] border border-slate-200 bg-white/70 flex items-center justify-center"><span class="material-symbols-outlined text-[42px]">image</span></div></div>`;
}

function renderStatusBadge(status) {
  const normalized = status || 'validated';
  const tone = normalized === 'rejected'
    ? 'bg-red-50 text-red-700 border-red-100'
    : 'bg-emerald-50 text-emerald-700 border-emerald-100';
  const label = normalized.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return `<span class="inline-flex items-center rounded-full border ${tone} px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em]">${escapeHtml(label)}</span>`;
}

function renderSeverityBadge(severity) {
  const tones = {
    low: 'bg-sky-50 text-sky-700 border-sky-100',
    medium: 'bg-amber-50 text-amber-700 border-amber-100',
    high: 'bg-orange-50 text-orange-700 border-orange-100',
    critical: 'bg-red-50 text-red-700 border-red-100',
  };
  const label = severity ? severity.charAt(0).toUpperCase() + severity.slice(1) : 'Unknown';
  return `<span class="inline-flex items-center rounded-full border ${tones[severity] || 'bg-slate-50 text-slate-600 border-slate-200'} px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em]">${escapeHtml(label)}</span>`;
}

function renderSummary(meta) {
  const summary = document.querySelector('[data-pagination-summary]');
  if (!summary) return;

  if (!state.total) {
    summary.textContent = 'Showing 0 validated cases';
  } else {
    const start = ((meta.page - 1) * meta.limit) + 1;
    const end = start + state.cases.length - 1;
    summary.textContent = `Showing ${start}-${end} of ${state.total} validated cases • Page ${meta.page || 1} of ${meta.totalPages || 1}`;
  }

  document.querySelector('[data-prev-page]')?.toggleAttribute('disabled', !state.hasPrevPage);
  document.querySelector('[data-next-page]')?.toggleAttribute('disabled', !state.hasNextPage);
}

function renderActiveFilters() {
  const label = document.querySelector('[data-active-filters]');
  if (!label) return;

  const active = [];
  if (state.filters.crop) active.push(`Crop: ${state.filters.crop}`);
  if (state.filters.severity) active.push(`Severity: ${state.filters.severity}`);
  active.push(`Date: ${state.filters.sort === 'oldest' ? 'Oldest first' : 'Newest first'}`);
  label.textContent = active.join(' • ');
}

function bindCasePageActions() {
  document.querySelector('[data-back-dashboard]')?.addEventListener('click', () => {
    window.location.href = '/frontend/expert/expertDashboard.html';
  });

  document.querySelector('[data-prev-page]')?.addEventListener('click', async () => {
    if (!state.hasPrevPage) return;
    state.page -= 1;
    await loadValidatedCases();
  });

  document.querySelector('[data-next-page]')?.addEventListener('click', async () => {
    if (!state.hasNextPage) return;
    state.page += 1;
    await loadValidatedCases();
  });

  document.querySelector('[data-filter-toggle]')?.addEventListener('click', openFilterModal);
  document.querySelector('[data-filter-close]')?.addEventListener('click', closeFilterModal);
  document.querySelector('[data-filter-apply]')?.addEventListener('click', applyFilters);
  document.querySelector('[data-filter-clear]')?.addEventListener('click', clearFilters);
  document.querySelector('[data-filter-modal]')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeFilterModal();
  });
}

function openFilterModal() {
  document.getElementById('filter-crop').value = state.filters.crop;
  document.getElementById('filter-severity').value = state.filters.severity;
  document.getElementById('filter-sort').value = state.filters.sort;
  document.querySelector('[data-filter-modal]')?.classList.remove('hidden');
}

function closeFilterModal() {
  document.querySelector('[data-filter-modal]')?.classList.add('hidden');
}

async function applyFilters() {
  state.filters.crop = document.getElementById('filter-crop').value.trim();
  state.filters.severity = document.getElementById('filter-severity').value;
  state.filters.sort = document.getElementById('filter-sort').value || 'newest';
  state.page = 1;
  closeFilterModal();
  await loadValidatedCases();
}

async function clearFilters() {
  state.filters = {
    crop: '',
    severity: '',
    sort: 'newest',
  };
  state.page = 1;
  closeFilterModal();
  await loadValidatedCases();
}

function openCaseDetails(caseId) {
  const item = state.cases.find((entry) => String(entry.id) === String(caseId));
  if (!item) return;

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-[10000] bg-black/45 backdrop-blur-sm p-4 flex items-center justify-center';
  modal.innerHTML = `<div class="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-[30px] bg-white shadow-2xl border border-slate-200">
    <div class="p-6 border-b border-slate-200 flex items-start justify-between gap-4">
      <div>
        <p class="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">${escapeHtml(item.cropName || item.plantName || 'Validated case')}</p>
        <h2 class="mt-2 text-2xl font-black text-slate-950">${escapeHtml(item.diseaseName || item.title || 'Case details')}</h2>
        <p class="mt-2 text-sm text-slate-500">Real expert case data from MongoDB.</p>
      </div>
      <button data-close-modal class="text-slate-400 hover:text-slate-700 transition-colors">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
    <div class="p-6 grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-6">
      <div class="overflow-hidden rounded-[26px] border border-slate-200 bg-slate-100 min-h-[260px]">
        ${renderImage(item)}
      </div>
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-3">
          ${metricCard('Status', (item.validationStatus || item.status || 'validated').replace(/_/g, ' '))}
          ${metricCard('Severity', item.severity || 'Unknown')}
          ${metricCard('Confidence', `${Number(item.confidence || 0).toFixed(0)}%`)}
          ${metricCard('Date', formatDate(item.validatedAt || item.reviewedAt || item.createdAt))}
        </div>
        <div class="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
          <p class="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Title</p>
          <p class="mt-2 text-sm font-semibold text-slate-900">${escapeHtml(item.title || 'Untitled case')}</p>
        </div>
        <div class="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
          <p class="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Recommendation</p>
          <p class="mt-2 text-sm leading-6 text-slate-700">${escapeHtml(item.recommendation || item.description || 'No recommendation available.')}</p>
        </div>
      </div>
    </div>
  </div>`;

  document.body.appendChild(modal);
  modal.querySelector('[data-close-modal]')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (event) => {
    if (event.target === modal) modal.remove();
  });
}

function metricCard(label, value) {
  return `<div class="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
    <p class="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">${escapeHtml(label)}</p>
    <p class="mt-2 text-sm font-semibold text-slate-900">${escapeHtml(value)}</p>
  </div>`;
}

function trimText(text, maxLength) {
  if (!text || text.length <= maxLength) return text || '';
  return `${text.slice(0, maxLength - 1).trim()}…`;
}
