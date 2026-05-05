// farmerdashboard.js
document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth('farmer')) return;
  populateSidebarUser(); setupLogout();

  if (Auth.isGuest()) {
    enableGuestLockdown();
    return;
  }

  await Promise.all([loadStats(), loadRecentDiagnoses()]);
  setupUpload(); setupNotifBell();
});

function enableGuestLockdown() {
  // Top banner
  const banner = document.createElement('div');
  banner.className = 'fixed top-0 left-0 right-0 z-[9999] bg-primary text-on-primary';
  banner.innerHTML = `
    <div class="max-w-7xl mx-auto px-4 py-3 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
      <div class="flex items-center gap-2 text-sm font-semibold">
        <span class="material-symbols-outlined text-[18px]">lock</span>
        <span>Guest mode: sign up to upload images, place orders, or use any actions.</span>
      </div>
      <div class="flex items-center gap-2">
        <a href="/frontend/register.html" class="px-4 py-2 rounded-full bg-white text-primary text-sm font-bold shadow-sm hover:bg-gray-100 transition-colors">Register</a>
        <a href="/frontend/login.html" class="px-4 py-2 rounded-full border border-white/60 text-white text-sm font-bold hover:bg-white/10 transition-colors">Login</a>
      </div>
    </div>`;
  document.body.appendChild(banner);
  document.body.classList.add('pt-14');

  // Disable upload zone
  const zone = document.getElementById('uploadZone');
  if (zone) {
    zone.classList.add('relative', 'opacity-60');
    zone.style.pointerEvents = 'none';
    const overlay = document.createElement('div');
    overlay.className = 'absolute inset-0 flex items-center justify-center';
    overlay.innerHTML = `
      <div class="mx-4 px-4 py-2 rounded-full bg-surface-container-lowest border border-outline-variant text-on-surface text-sm font-semibold shadow-sm">
        Sign up to upload a plant image
      </div>`;
    zone.appendChild(overlay);
  }

  // Replace dynamic sections with safe placeholders
  setText('[data-stat="recovered-crops"]', '—');
  setText('[data-stat="total-crops"]', '—');
  setText('[data-stat="fields-count"]', 'Sign up to see your fields');
  setText('[data-stat="active-diseases"]', '—');
  setText('[data-stat="active-orders"]', '—');

  const tbody = document.getElementById('diagnoses-table-body') || document.querySelector('table tbody');
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center text-on-surface-variant text-sm">Guest mode: register to view your diagnoses history.</td></tr>`;
  }

  // Block navigation/actions within farmer area
  const block = (e) => {
    e.preventDefault();
    e.stopPropagation();
    showToast('Guest mode: please register to continue', 'info');
  };

  document.querySelectorAll('a[href$=\".html\"]').forEach((a) => {
    const href = (a.getAttribute('href') || '').toLowerCase();
    if (href.includes('login.html') || href.includes('register.html') || href.includes('landing.html')) return;
    a.addEventListener('click', block);
    a.classList.add('opacity-80');
  });
}



async function loadStats() {
  try {
    const [sRes, fRes, oRes] = await Promise.all([
      api.get('/diagnoses/stats'),
      api.get('/farmer/fields'),
      api.get('/orders?limit=200'),
    ]);
    const stats   = sRes.data || {};
    const fields = fRes.data || [];
    const orders = oRes.data || [];
    const activeDis    = orders.filter(o => !['delivered','cancelled'].includes(o.status)).length;
///teo line add 
    setText('[data-stat="recovered-crops"]', stats.recovered_crops || 0);
    setText('[data-stat="total-crops"]', stats.total_crops || 0);
    setText('[data-stat="fields-count"]',    `Across ${fields.length} field${fields.length!==1?'s':''}`);
    setText('[data-stat="active-diseases"]', stats.active_diseases || 0);/////changed
    setText('[data-stat="active-orders"]',   activeDis);
  } catch(e) { console.error(e); }
} 

async function loadRecentDiagnoses() {
  const tbody = document.querySelector('table tbody');
  if (!tbody) return;
  tbody.innerHTML = skeletonRows(3, 6);
  try {
    const res = await api.get('/diagnoses?limit=5');
    const rows = res.data?.data || res.data || [];
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-on-surface-variant text-sm">No diagnoses yet — upload a plant photo to get started</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(d => `
      <tr class="hover:bg-surface-container-low/50 transition-colors cursor-pointer" onclick="window.location.href='recendiagnoses.html'">
        <td class="px-6 py-4">
          <div class="w-10 h-10 rounded-lg bg-surface-container border border-surface-variant flex items-center justify-center">
            ${getPlantImageSrc(d)
              ? `<img src="${getPlantImageSrc(d)}" alt="Plant" class="w-full h-full rounded-lg object-cover" loading="lazy" />`
              : `<span class="material-symbols-outlined text-on-surface-variant text-[18px]">grass</span>`}
          </div>
        </td>
        <td class="px-6 py-4 font-semibold text-on-surface">${d.crop_type||'Unknown crop'}</td>
        <td class="px-6 py-4 text-on-surface-variant hidden sm:table-cell">${d.ai_result?.disease_name||'—'}</td>
        <td class="px-6 py-4 hidden md:table-cell">
          <div class="flex items-center gap-2">
            <div class="w-16 h-2 bg-surface-variant rounded-full overflow-hidden"><div class="h-full bg-primary rounded-full" style="width:${d.ai_result?.confidence||0}%"></div></div>
            <span class="text-xs text-on-surface-variant">${formatConfidence(d.ai_result?.confidence)}</span>
          </div>
        </td>
        <td class="px-6 py-4">${severityBadge(d.ai_result?.severity)}</td>
        
<td class="px-6 py-4">
  ${
      d.is_recovered
        ? `<span class="text-green-600">Recovered</span>`
        : d.ai_result?.severity?.toLowerCase() === 'high'
        ? `<button onclick="handleRecoverClick(event, '${d.id}', this)" class="text-xs bg-green-600 text-white px-3 py-1 rounded">Mark as Recovered</button>`
          : `<button class="w-8 h-8 rounded-full bg-surface-container border border-surface-variant text-on-surface-variant hover:text-primary hover:border-primary/40 transition-colors flex items-center justify-center" aria-label="View diagnosis details"><span class="material-symbols-outlined text-[18px]">visibility</span></button>`
  }
</td>

      </tr>`).join('');
  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-6 text-center text-error text-sm">Failed to load diagnoses</td></tr>`;
  }
}

// ── Upload ────────────────────────────────────────────────────────────────────
function setupUpload() {
  const zone = document.getElementById('uploadZone');
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

  const fd = new FormData();
  fd.append('plant_image', file);

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
  const escapeHtml = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const treatment = d.ai_result?.treatment || null;
  const recommendation = d.ai_result?.recommendation || d.ai_result?.suggested_action || null;

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
        <div class="flex justify-between"><span class="text-sm text-on-surface-variant">Confidence</span><span class="text-sm font-bold text-on-surface">${formatConfidence(d.ai_result?.confidence)}</span></div>
        <div class="flex justify-between items-center"><span class="text-sm text-on-surface-variant">Severity</span>${severityBadge(d.ai_result?.severity)}</div>
      </div>
      ${treatment ? `<div class="bg-secondary-container/35 rounded-xl p-4 mb-4"><p class="text-xs font-semibold text-on-secondary-container uppercase tracking-wider mb-1">Treatment</p><p class="text-sm text-on-surface">${escapeHtml(treatment)}</p></div>` : ''}
      ${recommendation ? `<div class="bg-surface-container rounded-xl p-4 mb-4"><p class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">Recommendation</p><p class="text-sm text-on-surface">${escapeHtml(recommendation)}</p></div>` : ''}
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
//////////////////////////////////farmer e
///////////
async function markRecovered(id, btn) {
  try {
    await api.patch(`/diagnoses/${id}/recover`);
    if (btn) {
      const cell = btn.parentElement;
      btn.remove();
      cell.innerHTML = `<span class="text-green-600">Recovered</span>`;
    }
    showToast('Crop marked as recovered', 'success');
    await loadStats();
  } catch(e) {
    showToast(e.message || 'Failed to mark as recovered', 'error');
  }
}
/////////////////add
function handleRecoverClick(event, id, btn) {
  event.stopPropagation();
  event.preventDefault();

  markRecovered(id, btn);
}
function rowClick(event) {
  // لو ضغط زرار → متعملش navigation
  if (event.target.closest('button')) return;

  window.location.href = 'recendiagnoses.html';
}

function setText(sel, val) { document.querySelectorAll(sel).forEach(el => el.textContent = val??''); }
function getPlantImageSrc(diagnosis) {
  if (!diagnosis) return '';
  if (typeof diagnosis.plant_image === 'string') return diagnosis.plant_image;
  if (typeof diagnosis.plant_image_url === 'string') return diagnosis.plant_image_url;
  if (typeof diagnosis.image === 'string') return diagnosis.image;
  if (typeof diagnosis.image_url === 'string') return diagnosis.image_url;
  return '';
}

function formatConfidence(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return `${String(value)}%`;
}
async function applyFilter(severity) {
  const res = await fetch(`/diagnoses?severity=${severity}`);
  const data = await res.json();

  renderDiagnoses(data);
}
