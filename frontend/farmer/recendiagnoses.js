// recendiagnoses.js
let _allDiag = [], _filterTab = 'all';

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth('farmer')) return;
  populateSidebarUser(); setupLogout();
  await loadDiagnoses();
  setupFilterTabs();
});

async function loadDiagnoses() {
  const grid = document.querySelector('[data-diagnoses-grid], main .grid') || document.querySelector('main');
  try {
    const res = await api.get('/diagnoses?limit=100');
    _allDiag  = res.data || [];
    updateMiniStats();
    render(_filterDiag(_filterTab), grid);
  } catch(e) { showToast('Failed to load diagnoses', 'error'); }
}

function updateMiniStats() {
  const crit    = _allDiag.filter(d=>['critical','high'].includes(d.ai_result?.severity)).length;
  const pending = _allDiag.filter(d=>d.status==='pending_expert').length;
  document.querySelectorAll('[data-stat="critical"]').forEach(el=>el.textContent=crit);
  document.querySelectorAll('[data-stat="pending"]').forEach(el=>el.textContent=pending);
}

function render(list, container) {
  if (!container) return;
  if (!list.length) {
    container.innerHTML = `<div class="col-span-full py-16 text-center"><span class="material-symbols-outlined text-5xl text-on-surface-variant/40 block mb-3">biotech</span><p class="text-on-surface-variant font-medium">No diagnoses found</p><a href="farmerdashboard.html" class="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-primary text-on-primary rounded-xl text-sm font-semibold"><span class="material-symbols-outlined text-[18px]">add_a_photo</span>New Diagnosis</a></div>`;
    return;
  }
  container.innerHTML = list.map(diagCard).join('');
  container.querySelectorAll('[data-ask-expert]').forEach(btn => btn.addEventListener('click', () => askExpert(btn.dataset.askExpert)));
  container.querySelectorAll('[data-view-diag]').forEach(btn  => btn.addEventListener('click', () => viewDiag(btn.dataset.viewDiag)));
  container.querySelectorAll('[data-del-diag]').forEach(btn   => btn.addEventListener('click', () => delDiag(btn.dataset.delDiag)));
}

function diagCard(d) {
  const canAsk  = d.status==='ai_only' && ['high','critical'].includes(d.ai_result?.severity);
  const isPend  = d.status==='pending_expert';
  const isReviewed = d.status==='expert_reviewed';
  return `
  <article class="bg-surface-container-lowest rounded-[16px] border border-surface-variant shadow-sm overflow-hidden hover:shadow-md transition-all flex flex-col">
    <div class="h-40 bg-surface-container flex items-center justify-center relative overflow-hidden">
      <span class="material-symbols-outlined text-5xl text-primary/20">grass</span>
      <div class="absolute top-3 right-3">${severityBadge(d.ai_result?.severity)}</div>
      ${isPend?`<div class="absolute top-3 left-3"><span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-secondary-container text-on-secondary-container"><span class="material-symbols-outlined text-[12px]">pending</span>Pending Review</span></div>`:''}
      ${isReviewed?`<div class="absolute top-3 left-3"><span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-primary-fixed/30 text-primary"><span class="material-symbols-outlined text-[12px]">verified</span>Expert Reviewed</span></div>`:''}
    </div>
    <div class="p-4 flex flex-col flex-1 gap-3">
      <div><h3 class="font-bold text-on-surface">${d.ai_result?.disease_name||'Unknown Disease'}</h3>
        <p class="text-sm text-on-surface-variant mt-0.5">${d.crop_type||'Unknown crop'} · ${formatDate(d.created_at)}</p></div>
      <div class="flex items-center gap-2">
        <div class="flex-1 h-2 bg-surface-variant rounded-full overflow-hidden"><div class="h-full bg-primary rounded-full" style="width:${d.ai_result?.confidence||0}%"></div></div>
        <span class="text-xs font-semibold text-on-surface-variant">${(d.ai_result?.confidence||0).toFixed(0)}%</span>
      </div>
      ${d.ai_result?.suggested_action?`<p class="text-xs text-on-surface-variant line-clamp-2">${d.ai_result.suggested_action}</p>`:''}
      <div class="flex gap-2 mt-auto pt-2 border-t border-surface-variant">
        <button data-view-diag="${d.id||d._id}" class="flex-1 py-2 border border-outline-variant rounded-xl text-xs font-medium text-on-surface hover:bg-surface-container transition-colors flex items-center justify-center gap-1"><span class="material-symbols-outlined text-[14px]">visibility</span>Details</button>
        ${canAsk?`<button data-ask-expert="${d.id||d._id}" class="flex-1 py-2 bg-primary text-on-primary rounded-xl text-xs font-semibold hover:opacity-90 flex items-center justify-center gap-1"><span class="material-symbols-outlined text-[14px]">support_agent</span>Ask Expert</button>`
        :isPend?`<button disabled class="flex-1 py-2 bg-surface-container rounded-xl text-xs font-medium text-on-surface-variant flex items-center justify-center gap-1 cursor-default"><span class="material-symbols-outlined text-[14px]">hourglass_top</span>Awaiting</button>`
        :isReviewed?`<a href="expertschat.html" class="flex-1 py-2 bg-primary-fixed/30 text-primary rounded-xl text-xs font-semibold text-center flex items-center justify-center gap-1"><span class="material-symbols-outlined text-[14px]">forum</span>View Chat</a>`
        :`<button data-del-diag="${d.id||d._id}" class="py-2 px-3 border border-outline-variant rounded-xl text-xs font-medium text-error hover:bg-error-container flex items-center justify-center"><span class="material-symbols-outlined text-[14px]">delete</span></button>`}
      </div>
    </div>
  </article>`;
}

async function viewDiag(id) {
  try {
    const d = (await api.get(`/diagnoses/${id}`)).data;
    const m = document.createElement('div');
    m.className = 'fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 overflow-y-auto';
    m.innerHTML = `<div class="bg-surface rounded-2xl w-full max-w-lg shadow-xl my-auto">
      <div class="p-5 border-b border-surface-variant flex justify-between items-start">
        <div><h3 class="text-lg font-bold text-on-surface">${d.ai_result?.disease_name||'Diagnosis'}</h3><p class="text-sm text-on-surface-variant">${d.crop_type||'Unknown'} · ${formatDate(d.created_at)}</p></div>
        <button onclick="this.closest('.fixed').remove()" class="text-on-surface-variant p-1"><span class="material-symbols-outlined">close</span></button>
      </div>
      <div class="p-5 space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <div class="bg-surface-container rounded-xl p-3"><p class="text-xs text-on-surface-variant mb-1">Confidence</p><p class="font-bold text-on-surface">${(d.ai_result?.confidence||0).toFixed(1)}%</p></div>
          <div class="bg-surface-container rounded-xl p-3"><p class="text-xs text-on-surface-variant mb-1">Severity</p>${severityBadge(d.ai_result?.severity)}</div>
        </div>
        ${d.ai_result?.symptoms?.length?`<div><p class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Symptoms</p><ul class="space-y-1">${d.ai_result.symptoms.map(s=>`<li class="flex items-center gap-2 text-sm"><span class="w-1.5 h-1.5 rounded-full bg-primary shrink-0"></span>${s}</li>`).join('')}</ul></div>`:''}
        ${d.ai_result?.suggested_action?`<div class="bg-primary-fixed/20 rounded-xl p-4"><p class="text-xs font-semibold text-primary uppercase tracking-wider mb-1">Suggested Action</p><p class="text-sm text-on-surface">${d.ai_result.suggested_action}</p></div>`:''}
        <div class="flex items-center justify-between bg-surface-container rounded-xl p-3"><p class="text-sm text-on-surface-variant">Status</p><span class="text-sm font-semibold text-on-surface capitalize">${(d.status||'').replace(/_/g,' ')}</span></div>
      </div>
      <div class="p-5 pt-0 flex gap-3">
        <button onclick="this.closest('.fixed').remove()" class="flex-1 py-2.5 border border-outline-variant rounded-xl text-sm font-medium text-on-surface-variant">Close</button>
        ${d.status==='ai_only'&&['high','critical'].includes(d.ai_result?.severity)?`<button onclick="this.closest('.fixed').remove();askExpert('${d.id||d._id}')" class="flex-1 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-semibold">Ask Expert</button>`:''}
      </div>
    </div>`;
    document.body.appendChild(m);
    m.addEventListener('click', e => { if(e.target===m) m.remove(); });
  } catch(e) { showToast('Failed to load details', 'error'); }
}

async function askExpert(id) {
  const msg = await promptMsg();
  try {
    await api.post('/treatment-requests', { diagnosis_id: id, farmer_message: msg||null });
    showToast('Expert request sent!', 'success');
    await loadDiagnoses();
  } catch(err) { showToast(err.message||'Failed to request expert', 'error'); }
}

async function delDiag(id) {
  if (!await confirmDialog('Delete this diagnosis? This cannot be undone.')) return;
  try {
    await api.delete(`/diagnoses/${id}`);
    showToast('Deleted', 'success');
    _allDiag = _allDiag.filter(d => (d.id||d._id) !== id);
    render(_filterDiag(_filterTab), document.querySelector('[data-diagnoses-grid], main .grid'));
  } catch(err) { showToast('Delete failed', 'error'); }
}

function setupFilterTabs() {
  document.querySelectorAll('[data-filter-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('[data-filter-tab]').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      _filterTab = tab.dataset.filterTab;
      render(_filterDiag(_filterTab), document.querySelector('[data-diagnoses-grid], main .grid'));
    });
  });
}

function _filterDiag(f) {
  if (f==='critical') return _allDiag.filter(d=>['high','critical'].includes(d.ai_result?.severity));
  if (f==='pending')  return _allDiag.filter(d=>d.status==='pending_expert');
  if (f==='reviewed') return _allDiag.filter(d=>d.status==='expert_reviewed');
  return _allDiag;
}

function promptMsg() {
  return new Promise(resolve => {
    const m = document.createElement('div');
    m.className = 'fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4';
    m.innerHTML = `<div class="bg-surface rounded-2xl p-6 w-full max-w-sm shadow-xl">
      <h3 class="text-lg font-bold text-on-surface mb-1">Message for Expert</h3>
      <p class="text-sm text-on-surface-variant mb-4">Optional — describe what you've observed</p>
      <textarea rows="3" id="exp-msg" placeholder="e.g. Spots appeared 3 days ago…" class="w-full px-4 py-3 border border-outline-variant rounded-xl text-sm focus:ring-1 focus:ring-primary resize-none bg-surface-container-lowest mb-4"></textarea>
      <div class="flex gap-3">
        <button id="m-skip" class="flex-1 py-2.5 border border-outline-variant rounded-xl text-sm font-medium text-on-surface-variant">Skip</button>
        <button id="m-send" class="flex-1 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-semibold">Send</button>
      </div></div>`;
    document.body.appendChild(m);
    const ta = m.querySelector('#exp-msg');
    m.querySelector('#m-send').addEventListener('click', () => { m.remove(); resolve(ta.value.trim()||null); });
    m.querySelector('#m-skip').addEventListener('click', () => { m.remove(); resolve(null); });
  });
}
document.getElementById('apply-filters').addEventListener('click', async () => {
  const filters = { severity: [], crop: [], status: [] };

  document.querySelectorAll('.filter-chip input[type="checkbox"]').forEach(cb => {
    if (cb.checked && cb.value && cb.dataset.type) {
      filters[cb.dataset.type].push(cb.value.toLowerCase());
    }
  });

  const params = new URLSearchParams();
  if (filters.severity.length) params.set('severity', filters.severity.join(','));
  if (filters.crop.length) params.set('crop', filters.crop.join(','));
  if (filters.status.length) params.set('status', filters.status.join(','));

  const queryString = params.toString();
  const url = queryString ? `/diagnoses?${queryString}` : '/diagnoses?limit=100';

  console.log('Filter request URL:', url);

  try {
    const res = await api.get(url);
    _allDiag = res.data || [];
    render(_filterDiag(_filterTab), document.querySelector('[data-diagnoses-grid], main .grid'));
    document.getElementById('filter-modal').classList.add('hidden');
  } catch(e) {
    showToast('Failed to load diagnoses', 'error');
  }
});
document.getElementById("newScanBtn").addEventListener("click", () => {
  window.location.href = "/frontend/farmer/farmerdashboard.html#upload";
});
