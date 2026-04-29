const pendingCasesState = {
  cases: [],
  currentPage: 1,
  totalPages: 0,
  totalCases: 0,
  hasNextPage: false,
  hasPrevPage: false,
  limit: 6,
  filters: {
    crop: '',
    severity: '',
    sort: 'newest',
    status: 'pending',
  },
};

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth('expert')) return;
  populateSidebarUser();
  setupLogout();
  setupPendingCasesUi();
  await loadPendingCases();
});

async function loadPendingCases() {
  const grid = document.querySelector('[data-cases-grid]');
  if (!grid) return;

  grid.innerHTML = skeletonCards(6);

  try {
    const params = new URLSearchParams({
      page: String(pendingCasesState.currentPage),
      limit: String(pendingCasesState.limit),
      sort: pendingCasesState.filters.sort,
    });

    if (pendingCasesState.filters.crop) params.set('crop', pendingCasesState.filters.crop);
    if (pendingCasesState.filters.severity) params.set('severity', pendingCasesState.filters.severity);
    if (pendingCasesState.filters.status) params.set('status', pendingCasesState.filters.status);

    const res = await api.get(`/cases/pending?${params.toString()}`);
    pendingCasesState.cases = res.data || [];
    pendingCasesState.currentPage = res.meta?.currentPage || 1;
    pendingCasesState.totalPages = res.meta?.totalPages || 0;
    pendingCasesState.totalCases = res.meta?.totalCases || 0;
    pendingCasesState.hasNextPage = Boolean(res.meta?.hasNextPage);
    pendingCasesState.hasPrevPage = Boolean(res.meta?.hasPrevPage);

    renderCases();
    renderPagination();
    renderActiveFilters();
  } catch (error) {
    grid.innerHTML = `<div class="col-span-full py-10 text-center text-error text-sm">${escapeHtml(error.message || 'Failed to load cases')}</div>`;
    document.querySelector('[data-pagination]')?.replaceChildren();
    const summary = document.querySelector('[data-pagination-summary]');
    if (summary) summary.textContent = 'Could not load pagination.';
  }
}

function renderCases() {
  const grid = document.querySelector('[data-cases-grid]');
  if (!grid) return;

  if (!pendingCasesState.cases.length) {
    grid.innerHTML = `<div class="col-span-full py-16 text-center">
      <span class="material-symbols-outlined text-5xl text-on-surface-variant/40 block mb-3">pending_actions</span>
      <p class="text-on-surface-variant text-lg font-medium">No pending cases match these filters.</p>
      <p class="text-sm text-on-surface-variant mt-2">Try clearing filters or check back for new submissions.</p>
    </div>`;
  } else {
    grid.innerHTML = pendingCasesState.cases.map(caseCard).join('');
    grid.querySelectorAll('[data-assign]').forEach((button) => {
      button.addEventListener('click', () => assignCase(button.dataset.assign));
    });
    grid.querySelectorAll('[data-view-case]').forEach((button) => {
      button.addEventListener('click', () => viewCase(button.dataset.viewCase));
    });
  }

  const total = document.querySelector('[data-total-cases]');
  if (total) total.textContent = String(pendingCasesState.totalCases);

  const summary = document.querySelector('[data-pagination-summary]');
  if (summary) {
    if (!pendingCasesState.totalCases) {
      summary.textContent = 'Showing 0 cases';
    } else {
      const start = ((pendingCasesState.currentPage - 1) * pendingCasesState.limit) + 1;
      const end = start + pendingCasesState.cases.length - 1;
      summary.textContent = `Showing ${start}-${end} of ${pendingCasesState.totalCases} cases`;
    }
  }
}

function caseCard(caseItem) {
  return `<article class="bg-surface-container-lowest rounded-[18px] border border-surface-variant shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-all">
    <div class="relative h-52 bg-surface-container">
      ${renderCaseImage(caseItem)}
      <div class="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/70 via-black/10 to-transparent">
        <div class="flex items-end justify-between gap-3">
          <div>
            <p class="text-white/80 text-xs uppercase tracking-[0.18em] font-semibold">${escapeHtml(caseItem.cropType || 'Unknown crop')}</p>
            <h3 class="text-white font-bold text-lg">${escapeHtml(caseItem.diseaseName || 'Unknown disease')}</h3>
          </div>
          ${severityBadge(caseItem.severity)}
        </div>
      </div>
    </div>
    <div class="p-5 flex-1 flex flex-col gap-4">
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-sm text-on-surface-variant">${escapeHtml(caseItem.location || 'Unknown location')}</p>
          <p class="text-sm text-on-surface-variant">Submitted ${timeAgo(caseItem.createdAt)}</p>
        </div>
        <div class="flex flex-col items-end gap-1">
          ${priorityBadge(caseItem.priority)}
          <span class="text-xs text-on-surface-variant font-medium">${Number(caseItem.confidence || 0).toFixed(0)}% confidence</span>
        </div>
      </div>
      ${caseItem.symptoms?.length ? `<div class="flex flex-wrap gap-1.5">${caseItem.symptoms.slice(0, 3).map((symptom) => `<span class="text-xs px-2 py-1 bg-surface-container rounded-full text-on-surface-variant">${escapeHtml(symptom)}</span>`).join('')}</div>` : ''}
      ${caseItem.farmerMessage ? `<p class="text-sm text-on-surface-variant bg-surface-container rounded-xl p-3 italic">"${escapeHtml(caseItem.farmerMessage)}"</p>` : ''}
      <div class="mt-auto flex gap-2">
        <button data-view-case="${caseItem.id}" class="flex-1 py-2.5 border border-outline-variant rounded-xl text-sm font-medium text-on-surface hover:bg-surface-container transition-colors flex items-center justify-center gap-1">
          <span class="material-symbols-outlined text-[16px]">visibility</span>
          Details
        </button>
        <button data-assign="${caseItem.id}" class="flex-1 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-1 active:scale-[0.98]">
          <span class="material-symbols-outlined text-[16px]">assignment_ind</span>
          Pick Up Case
        </button>
      </div>
    </div>
  </article>`;
}

function renderCaseImage(caseItem) {
  if (!caseItem.imageUrl) {
    return `<div class="w-full h-full flex items-center justify-center text-on-surface-variant">
      <div class="w-20 h-20 rounded-3xl bg-surface-container-high flex items-center justify-center">
        <span class="material-symbols-outlined text-4xl">image</span>
      </div>
    </div>`;
  }

  return `<img src="${caseItem.imageUrl}" alt="${escapeHtml(caseItem.cropType || 'Plant case')}" class="w-full h-full object-cover" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
    <div class="hidden absolute inset-0 items-center justify-center text-on-surface-variant">
      <div class="w-20 h-20 rounded-3xl bg-surface-container-high flex items-center justify-center">
        <span class="material-symbols-outlined text-4xl">image</span>
      </div>
    </div>`;
}

function renderPagination() {
  const container = document.querySelector('[data-pagination]');
  if (!container) return;

  container.innerHTML = '';

  const previous = document.createElement('button');
  previous.className = 'px-3 py-2 rounded-lg bg-surface-container-lowest border border-outline-variant text-on-surface hover:bg-surface-container-low disabled:opacity-50 disabled:cursor-not-allowed transition-colors';
  previous.textContent = 'Previous';
  previous.disabled = !pendingCasesState.hasPrevPage;
  previous.addEventListener('click', async () => {
    if (!pendingCasesState.hasPrevPage) return;
    pendingCasesState.currentPage -= 1;
    await loadPendingCases();
  });
  container.appendChild(previous);

  const totalPages = pendingCasesState.totalPages || 1;
  for (let page = 1; page <= totalPages; page += 1) {
    const pageButton = document.createElement('button');
    const isActive = page === pendingCasesState.currentPage;
    pageButton.className = isActive
      ? 'w-10 h-10 rounded-lg bg-green-700 text-white flex items-center justify-center font-semibold'
      : 'w-10 h-10 rounded-lg bg-surface-container-lowest border border-outline-variant text-on-surface hover:bg-surface-container-low flex items-center justify-center font-medium transition-colors';
    pageButton.textContent = String(page);
    pageButton.addEventListener('click', async () => {
      pendingCasesState.currentPage = page;
      await loadPendingCases();
    });
    container.appendChild(pageButton);
  }

  const next = document.createElement('button');
  next.className = 'px-3 py-2 rounded-lg bg-surface-container-lowest border border-outline-variant text-on-surface hover:bg-surface-container-low disabled:opacity-50 disabled:cursor-not-allowed transition-colors';
  next.textContent = 'Next';
  next.disabled = !pendingCasesState.hasNextPage;
  next.addEventListener('click', async () => {
    if (!pendingCasesState.hasNextPage) return;
    pendingCasesState.currentPage += 1;
    await loadPendingCases();
  });
  container.appendChild(next);
}

function setupPendingCasesUi() {
  document.querySelector('[data-filter-toggle]')?.addEventListener('click', openFilterModal);
  document.querySelector('[data-filter-close]')?.addEventListener('click', closeFilterModal);
  document.querySelector('[data-filter-apply]')?.addEventListener('click', applyFilters);
  document.querySelector('[data-filter-clear]')?.addEventListener('click', clearFilters);
  document.querySelector('[data-filter-modal]')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeFilterModal();
  });
}

function openFilterModal() {
  document.getElementById('filter-crop').value = pendingCasesState.filters.crop;
  document.getElementById('filter-severity').value = pendingCasesState.filters.severity;
  document.getElementById('filter-sort').value = pendingCasesState.filters.sort;
  document.getElementById('filter-status').value = pendingCasesState.filters.status;
  document.querySelector('[data-filter-modal]')?.classList.remove('hidden');
}

function closeFilterModal() {
  document.querySelector('[data-filter-modal]')?.classList.add('hidden');
}

async function applyFilters() {
  pendingCasesState.filters.crop = document.getElementById('filter-crop').value.trim();
  pendingCasesState.filters.severity = document.getElementById('filter-severity').value;
  pendingCasesState.filters.sort = document.getElementById('filter-sort').value || 'newest';
  pendingCasesState.filters.status = document.getElementById('filter-status').value || 'pending';
  pendingCasesState.currentPage = 1;
  closeFilterModal();
  await loadPendingCases();
}

async function clearFilters() {
  pendingCasesState.filters = {
    crop: '',
    severity: '',
    sort: 'newest',
    status: 'pending',
  };
  pendingCasesState.currentPage = 1;
  closeFilterModal();
  await loadPendingCases();
}

function renderActiveFilters() {
  const label = document.querySelector('[data-active-filters]');
  if (!label) return;

  const active = [];
  if (pendingCasesState.filters.crop) active.push(`Crop: ${pendingCasesState.filters.crop}`);
  if (pendingCasesState.filters.severity) active.push(`Severity: ${pendingCasesState.filters.severity}`);
  active.push(`Date: ${pendingCasesState.filters.sort}`);

  label.textContent = active.length ? active.join(' • ') : '';
}

async function viewCase(id) {
  const caseItem = pendingCasesState.cases.find((item) => item.id === id) || {};
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black/45 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 overflow-y-auto';
  modal.innerHTML = `<div class="relative z-[10000] w-full max-w-lg my-auto rounded-2xl bg-white text-slate-900 shadow-2xl opacity-100">
    <div class="p-5 border-b border-surface-variant flex justify-between items-start">
      <div>
        <h3 class="text-lg font-bold text-on-surface">${escapeHtml(caseItem.diseaseName || 'Case Details')}</h3>
        <p class="text-sm text-on-surface-variant">${escapeHtml(caseItem.cropType || 'Unknown crop')} • ${timeAgo(caseItem.createdAt)}</p>
      </div>
      <button onclick="this.closest('.fixed').remove()" class="text-on-surface-variant p-1"><span class="material-symbols-outlined">close</span></button>
    </div>
    <div class="p-5 space-y-4">
      <div class="flex gap-3">${priorityBadge(caseItem.priority)}${severityBadge(caseItem.severity)}</div>
      <div class="grid grid-cols-1 gap-3">
        <div class="bg-surface-container rounded-xl p-3"><p class="text-xs text-on-surface-variant mb-1">Confidence</p><p class="font-bold text-on-surface">${Number(caseItem.confidence || 0).toFixed(1)}%</p></div>
      </div>
      ${caseItem.symptoms?.length ? `<div><p class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Symptoms</p><ul class="space-y-1">${caseItem.symptoms.map((symptom) => `<li class="flex items-center gap-2 text-sm"><span class="w-1.5 h-1.5 rounded-full bg-primary shrink-0"></span>${escapeHtml(symptom)}</li>`).join('')}</ul></div>` : ''}
      ${caseItem.suggestedAction ? `<div class="bg-primary-fixed/20 rounded-xl p-4"><p class="text-xs font-semibold text-primary uppercase tracking-wider mb-1">AI Suggestion</p><p class="text-sm text-on-surface">${escapeHtml(caseItem.suggestedAction)}</p></div>` : ''}
      ${caseItem.farmerMessage ? `<div class="bg-surface-container rounded-xl p-4"><p class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">Farmer note</p><p class="text-sm text-on-surface italic">"${escapeHtml(caseItem.farmerMessage)}"</p></div>` : ''}
    </div>
    <div class="p-5 pt-0 flex gap-3">
      <button onclick="this.closest('.fixed').remove()" class="flex-1 py-2.5 border border-outline-variant rounded-xl text-sm font-medium text-on-surface-variant">Close</button>
      <button onclick="this.closest('.fixed').remove();assignCase('${caseItem.id}')" class="flex-1 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-semibold">Pick Up Case</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', (event) => { if (event.target === modal) modal.remove(); });
}

async function assignCase(id) {
  if (!await confirmDialog('Pick up this case? It will be assigned to you and removed from the pending queue.')) return;
  try {
    await api.post(`/treatment-requests/${id}/assign`);
    showToast('Case assigned! Opening chat shortly.', 'success');
    await loadPendingCases();
    setTimeout(() => { window.location.href = 'expertChat.html'; }, 1200);
  } catch (error) {
    showToast(error.message || 'Failed to assign case', 'error');
  }
}

function confirmDialog(message) {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/45 backdrop-blur-sm z-[9999] flex items-center justify-center p-4';
    modal.innerHTML = `
      <div class="relative z-[10000] w-full max-w-sm rounded-2xl bg-white text-slate-900 p-6 shadow-2xl opacity-100">
        <p class="text-base font-semibold text-slate-900 mb-5">${escapeHtml(message)}</p>
        <div class="flex gap-3">
          <button data-confirm-cancel class="flex-1 py-2.5 border border-outline-variant rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
          <button data-confirm-ok class="flex-1 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-colors">Confirm</button>
        </div>
      </div>`;

    document.body.appendChild(modal);

    modal.querySelector('[data-confirm-ok]')?.addEventListener('click', () => {
      modal.remove();
      resolve(true);
    });

    modal.querySelector('[data-confirm-cancel]')?.addEventListener('click', () => {
      modal.remove();
      resolve(false);
    });

    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        modal.remove();
        resolve(false);
      }
    });
  });
}

const setText = (selector, value) => document.querySelectorAll(selector).forEach((element) => { element.textContent = value ?? ''; });
