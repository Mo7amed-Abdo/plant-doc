// farmerdashboard.js
document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth('farmer')) return;
  populateSidebarUser(); setupLogout();
  await Promise.all([loadStats(), loadRecentDiagnoses()]);
  setupUpload(); setupNotifBell();
});

async function loadStats() {
  try {
    const [dRes, fRes, oRes] = await Promise.all([
      api.get('/diagnoses?limit=200'),
      api.get('/farmer/fields'),
      api.get('/orders?limit=200'),
    ]);
    const diags  = dRes.data || [];
    const fields = fRes.data || [];
    const orders = oRes.data || [];
    const totalCrops   = fields.reduce((s,f) => s+(f.crops_count||0), 0);
    const activeDis    = diags.filter(d => ['high','critical'].includes(d.ai_result?.severity) && d.status!=='archived').length;
    const activeOrders = orders.filter(o => !['delivered','cancelled'].includes(o.status)).length;

    setText('[data-stat="recovered-crops"]', totalCrops.toLocaleString());
    setText('[data-stat="total-crops"]',     totalCrops.toLocaleString());
    setText('[data-stat="fields-count"]',    `Across ${fields.length} field${fields.length!==1?'s':''}`);
    setText('[data-stat="active-diseases"]', activeDis);
    setText('[data-stat="active-orders"]',   activeOrders);
  } catch(e) { console.error(e); }
}

async function loadRecentDiagnoses() {
  const tbody = document.querySelector('table tbody');
  if (!tbody) return;
  tbody.innerHTML = skeletonRows(3, 6);
  try {
    const rows = (await api.get('/diagnoses?limit=5')).data || [];
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-on-surface-variant text-sm">No diagnoses yet — upload a plant photo to get started</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(d => `
      <tr class="hover:bg-surface-container-low/50 transition-colors cursor-pointer" onclick="window.location.href='recendiagnoses.html'">
        <td class="px-6 py-4">
          <div class="w-10 h-10 rounded-lg bg-surface-container border border-surface-variant flex items-center justify-center">
            <span class="material-symbols-outlined text-on-surface-variant text-[18px]">grass</span>
          </div>
        </td>
        <td class="px-6 py-4 font-semibold text-on-surface">${d.crop_type||'Unknown crop'}</td>
        <td class="px-6 py-4 text-on-surface-variant hidden sm:table-cell">${d.ai_result?.disease_name||'—'}</td>
        <td class="px-6 py-4 hidden md:table-cell">
          <div class="flex items-center gap-2">
            <div class="w-16 h-2 bg-surface-variant rounded-full overflow-hidden"><div class="h-full bg-primary rounded-full" style="width:${d.ai_result?.confidence||0}%"></div></div>
            <span class="text-xs text-on-surface-variant">${(d.ai_result?.confidence||0).toFixed(0)}%</span>
          </div>
        </td>
        <td class="px-6 py-4">${severityBadge(d.ai_result?.severity)}</td>
        <td class="px-6 py-4"><button class="text-on-surface-variant hover:text-primary"><span class="material-symbols-outlined text-xl">chevron_right</span></button></td>
      </tr>`).join('');
  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-6 text-center text-error text-sm">Failed to load diagnoses</td></tr>`;
  }
}

// ── Upload ────────────────────────────────────────────────────────────────────
function setupUpload() {
  const zone  = document.querySelector('.border-dashed');
  const input = (() => { const i=document.createElement('input'); i.type='file'; i.accept='image/*'; i.style.display='none'; document.body.appendChild(i); return i; })();

  if (zone) {
    zone.addEventListener('click', () => input.click());
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('border-primary','bg-primary/5'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('border-primary','bg-primary/5'));
    zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('border-primary','bg-primary/5'); if(e.dataTransfer.files[0]) handleUpload(e.dataTransfer.files[0], zone); });
    // Browse button inside zone
    zone.querySelector('button')?.addEventListener('click', e => { e.stopPropagation(); input.click(); });
  }
  input.addEventListener('change', () => { if(input.files[0]) handleUpload(input.files[0], zone); });
}

async function handleUpload(file, zone) {
  if (!file.type.startsWith('image/')) { showToast('Please select an image file', 'error'); return; }
  if (file.size > 5*1024*1024) { showToast('Image must be under 5MB', 'error'); return; }

  // Preview
  if (zone) { const r=new FileReader(); r.onload=e=>{zone.style.backgroundImage=`url(${e.target.result})`;zone.style.backgroundSize='cover';zone.style.backgroundPosition='center';}; r.readAsDataURL(file); }

  const cropType = await promptInput('What crop is this?', 'e.g. Tomato, Wheat, Corn…');
  const fd = new FormData();
  fd.append('plant_image', file);
  if (cropType) fd.append('crop_type', cropType);

  showToast('Analysing…', 'info');
  try {
    const res = await api.post('/diagnoses', fd);
    const d   = res.data;
    showToast(`Done: ${d.ai_result?.disease_name||'See results'}`, 'success');
    await Promise.all([loadRecentDiagnoses(), loadStats()]);
    showResultModal(d);
  } catch(err) {
    showToast(err.message||'Diagnosis failed', 'error');
    if (zone) { zone.style.backgroundImage=''; }
  }
}

function showResultModal(d) {
  const m = document.createElement('div');
  m.className = 'fixed inset-0 bg-black/50 z-[9998] flex items-center justify-center p-4';
  m.innerHTML = `
    <div class="bg-surface rounded-2xl p-6 w-full max-w-md shadow-xl">
      <div class="flex items-center gap-3 mb-5">
        <div class="w-12 h-12 rounded-xl bg-primary-container/20 flex items-center justify-center text-primary"><span class="material-symbols-outlined fill text-2xl">biotech</span></div>
        <div><h3 class="text-lg font-bold text-on-surface">Diagnosis Result</h3><p class="text-sm text-on-surface-variant">${d.crop_type||'Unknown crop'}</p></div>
      </div>
      <div class="bg-surface-container rounded-xl p-4 mb-4 space-y-2.5">
        <div class="flex justify-between"><span class="text-sm text-on-surface-variant">Disease</span><span class="text-sm font-bold text-on-surface">${d.ai_result?.disease_name||'—'}</span></div>
        <div class="flex justify-between"><span class="text-sm text-on-surface-variant">Confidence</span><span class="text-sm font-bold text-on-surface">${(d.ai_result?.confidence||0).toFixed(1)}%</span></div>
        <div class="flex justify-between items-center"><span class="text-sm text-on-surface-variant">Severity</span>${severityBadge(d.ai_result?.severity)}</div>
      </div>
      ${d.ai_result?.suggested_action ? `<div class="bg-primary-fixed/20 rounded-xl p-4 mb-4"><p class="text-xs font-semibold text-primary uppercase tracking-wider mb-1">Suggested Action</p><p class="text-sm text-on-surface">${d.ai_result.suggested_action}</p></div>` : ''}
      <div class="flex gap-3">
        <button onclick="this.closest('.fixed').remove()" class="flex-1 py-2.5 border border-outline-variant rounded-xl text-sm font-medium text-on-surface-variant">Close</button>
        <a href="recendiagnoses.html" class="flex-1 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-semibold text-center hover:opacity-90">View All</a>
      </div>
    </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if(e.target===m) m.remove(); });
}

async function setupNotifBell() {
  try {
    const res = await api.get('/notifications?is_read=false&limit=1');
    if ((res.meta?.total||0) > 0) document.querySelectorAll('[data-notif-dot]').forEach(el => el.classList.remove('hidden'));
  } catch(_) {}
}

function promptInput(title, placeholder) {
  return new Promise(resolve => {
    const m = document.createElement('div');
    m.className = 'fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4';
    m.innerHTML = `<div class="bg-surface rounded-2xl p-6 w-full max-w-sm shadow-xl">
      <h3 class="text-lg font-bold text-on-surface mb-4">${title}</h3>
      <input id="prompt-input" type="text" placeholder="${placeholder}" class="w-full px-4 py-3 border border-outline-variant rounded-xl text-sm focus:ring-1 focus:ring-primary bg-surface-container-lowest mb-4" />
      <div class="flex gap-3">
        <button id="p-skip" class="flex-1 py-2.5 border border-outline-variant rounded-xl text-sm font-medium text-on-surface-variant">Skip</button>
        <button id="p-ok" class="flex-1 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-semibold">OK</button>
      </div></div>`;
    document.body.appendChild(m);
    const inp = m.querySelector('#prompt-input'); inp.focus();
    m.querySelector('#p-ok').addEventListener('click',   () => { m.remove(); resolve(inp.value.trim()||null); });
    m.querySelector('#p-skip').addEventListener('click', () => { m.remove(); resolve(null); });
    inp.addEventListener('keydown', e => { if(e.key==='Enter') m.querySelector('#p-ok').click(); });
  });
}

function setText(sel, val) { document.querySelectorAll(sel).forEach(el => el.textContent = val??''); }
