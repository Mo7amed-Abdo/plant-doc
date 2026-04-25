// expertpendingcases.js
let _cases=[], _filter='all';

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth('expert')) return;
  populateSidebarUser(); setupLogout();
  await loadCases();
  setupFilters();
});

async function loadCases() {
  const grid = document.querySelector('[data-cases-grid], main .grid, main .flex.flex-col.gap');
  if (!grid) return;
  grid.innerHTML = skeletonCards(4);
  try {
    const res = await api.get('/treatment-requests/pool?limit=50');
    _cases = res.data||[];
    setText('[data-stat="pool-count"]', res.meta?.total||_cases.length);
    renderCases(_filtered(_filter), grid);
  } catch(e) { grid.innerHTML=`<div class="col-span-full py-8 text-center text-error text-sm">${e.message}</div>`; }
}

function renderCases(list, con) {
  if (!list.length) { con.innerHTML=`<div class="col-span-full py-16 text-center"><span class="material-symbols-outlined text-5xl text-on-surface-variant/40 block mb-3">pending_actions</span><p class="text-on-surface-variant">No cases in the pool right now</p></div>`; return; }
  con.innerHTML = list.map(caseCard).join('');
  con.querySelectorAll('[data-assign]').forEach(btn => btn.addEventListener('click', () => assignCase(btn.dataset.assign)));
  con.querySelectorAll('[data-view-case]').forEach(btn => btn.addEventListener('click', () => viewCase(btn.dataset.viewCase)));
}

function caseCard(c) {
  const d=c.diagnosis_id||{}, f=c.farmer_id||{};
  return `<div class="bg-surface-container-lowest rounded-[16px] border border-surface-variant shadow-sm p-5 hover:shadow-md transition-all">
    <div class="flex items-start justify-between mb-4">
      <div class="flex items-center gap-3">
        <div class="w-12 h-12 rounded-xl bg-primary-fixed/20 text-primary flex items-center justify-center shrink-0"><span class="material-symbols-outlined fill text-2xl">biotech</span></div>
        <div><h3 class="font-bold text-on-surface">${d.ai_result?.disease_name||'Unknown Disease'}</h3><p class="text-sm text-on-surface-variant">${d.crop_type||'Unknown crop'} · ${f.location||'Unknown location'}</p></div>
      </div>
      <div class="flex flex-col items-end gap-1">${priorityBadge(c.priority)}${severityBadge(d.ai_result?.severity)}</div>
    </div>
    ${d.ai_result?.symptoms?.length?`<div class="flex flex-wrap gap-1 mb-4">${d.ai_result.symptoms.slice(0,3).map(s=>`<span class="text-xs px-2 py-0.5 bg-surface-container rounded-full text-on-surface-variant">${s}</span>`).join('')}</div>`:''}
    ${c.farmer_message?`<p class="text-sm text-on-surface-variant bg-surface-container rounded-xl p-3 mb-4 italic">"${escapeHtml(c.farmer_message)}"</p>`:''}
    <div class="flex items-center justify-between text-xs text-on-surface-variant mb-4">
      <span>Submitted ${timeAgo(c.created_at)}</span>
      <span>Confidence: ${(d.ai_result?.confidence||0).toFixed(0)}%</span>
    </div>
    <div class="flex gap-2">
      <button data-view-case="${c._id}" class="flex-1 py-2.5 border border-outline-variant rounded-xl text-sm font-medium text-on-surface hover:bg-surface-container transition-colors flex items-center justify-center gap-1"><span class="material-symbols-outlined text-[16px]">visibility</span>Details</button>
      <button data-assign="${c._id}" class="flex-1 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-semibold hover:opacity-90 flex items-center justify-center gap-1 active:scale-[0.98]"><span class="material-symbols-outlined text-[16px]">assignment_ind</span>Pick Up Case</button>
    </div>
  </div>`;
}

async function viewCase(id) {
  const c = _cases.find(x=>x._id===id)||{};
  const d = c.diagnosis_id||{};
  const m = document.createElement('div');
  m.className = 'fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 overflow-y-auto';
  m.innerHTML = `<div class="bg-surface rounded-2xl w-full max-w-lg shadow-xl my-auto">
    <div class="p-5 border-b border-surface-variant flex justify-between items-start">
      <div><h3 class="text-lg font-bold text-on-surface">${d.ai_result?.disease_name||'Case Details'}</h3><p class="text-sm text-on-surface-variant">${d.crop_type||'Unknown crop'} · ${timeAgo(c.created_at)}</p></div>
      <button onclick="this.closest('.fixed').remove()" class="text-on-surface-variant p-1"><span class="material-symbols-outlined">close</span></button>
    </div>
    <div class="p-5 space-y-4">
      <div class="flex gap-3">${priorityBadge(c.priority)}${severityBadge(d.ai_result?.severity)}</div>
      <div class="grid grid-cols-2 gap-3">
        <div class="bg-surface-container rounded-xl p-3"><p class="text-xs text-on-surface-variant mb-1">Confidence</p><p class="font-bold text-on-surface">${(d.ai_result?.confidence||0).toFixed(1)}%</p></div>
        <div class="bg-surface-container rounded-xl p-3"><p class="text-xs text-on-surface-variant mb-1">Status</p><p class="font-bold text-on-surface capitalize">${c.status?.replace(/_/g,' ')||'—'}</p></div>
      </div>
      ${d.ai_result?.symptoms?.length?`<div><p class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Symptoms</p><ul class="space-y-1">${d.ai_result.symptoms.map(s=>`<li class="flex items-center gap-2 text-sm"><span class="w-1.5 h-1.5 rounded-full bg-primary shrink-0"></span>${s}</li>`).join('')}</ul></div>`:''}
      ${d.ai_result?.suggested_action?`<div class="bg-primary-fixed/20 rounded-xl p-4"><p class="text-xs font-semibold text-primary uppercase tracking-wider mb-1">AI Suggestion</p><p class="text-sm text-on-surface">${d.ai_result.suggested_action}</p></div>`:''}
      ${c.farmer_message?`<div class="bg-surface-container rounded-xl p-4"><p class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">Farmer's Note</p><p class="text-sm text-on-surface italic">"${escapeHtml(c.farmer_message)}"</p></div>`:''}
    </div>
    <div class="p-5 pt-0 flex gap-3">
      <button onclick="this.closest('.fixed').remove()" class="flex-1 py-2.5 border border-outline-variant rounded-xl text-sm font-medium text-on-surface-variant">Close</button>
      <button onclick="this.closest('.fixed').remove();assignCase('${c._id}')" class="flex-1 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-semibold">Pick Up Case</button>
    </div>
  </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e=>{if(e.target===m)m.remove();});
}

async function assignCase(id) {
  if (!await confirmDialog('Pick up this case? It will be assigned to you and moved out of the pool.')) return;
  try {
    await api.post(`/treatment-requests/${id}/assign`);
    showToast('Case assigned! Head to Chat to connect with the farmer.','success');
    _cases = _cases.filter(c=>c._id!==id);
    renderCases(_filtered(_filter), document.querySelector('[data-cases-grid], main .grid, main .flex.flex-col.gap'));
    setTimeout(()=>window.location.href='expertChat.html',1500);
  } catch(err) { showToast(err.message||'Failed to assign case','error'); }
}

function setupFilters() {
  document.querySelectorAll('[data-filter-priority]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-filter-priority]').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active'); _filter=btn.dataset.filterPriority;
      renderCases(_filtered(_filter), document.querySelector('[data-cases-grid], main .grid, main .flex.flex-col.gap'));
    });
  });
}

function _filtered(f) {
  if (f==='all') return _cases;
  return _cases.filter(c=>c.priority===f);
}

const setText=(sel,val)=>document.querySelectorAll(sel).forEach(el=>el.textContent=val??'');
