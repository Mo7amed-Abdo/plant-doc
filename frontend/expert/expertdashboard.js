// expertdashboard.js
document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth('expert')) return;
  populateSidebarUser(); setupLogout();
  await Promise.all([loadStats(), loadRecentCases()]);
  setupNotifBell();
});

async function loadStats() {
  try {
    const profile = Auth.getProfile() || (await api.get('/expert/profile')).data;
    setText('[data-stat="cases-reviewed"]', profile.cases_reviewed||0);
    setText('[data-stat="accuracy-rate"]', `${profile.accuracy_rate||0}%`);
    // Pending cases count
    const pool = await api.get('/treatment-requests/pool?limit=1');
    setText('[data-stat="pending-cases"]', pool.meta?.total||0);
    // Reviewed today
    setText('[data-stat="reviewed-today"]', '--');
  } catch(e) { console.error(e); }
}

async function loadRecentCases() {
  const tbody = document.querySelector('table tbody');
  if (!tbody) return;
  tbody.innerHTML = skeletonRows(3,5);
  try {
    // Get cases assigned to this expert
    const res = await api.get('/treatment-requests/my-assigned?limit=10').catch(() => api.get('/treatment-requests/pool?limit=10'));
    const cases = res.data||[];
    if (!cases.length) { tbody.innerHTML=`<tr><td colspan="5" class="px-6 py-8 text-center text-on-surface-variant text-sm">No cases yet — check Pending Cases to pick one up</td></tr>`; return; }
    tbody.innerHTML = cases.map(c=>{
      const d=c.diagnosis_id||{};
      return `<tr class="hover:bg-surface-container-low/50 transition-colors cursor-pointer" onclick="window.location.href='expertPendingcases.html'">
        <td class="px-6 py-4 font-semibold text-on-surface">${d.crop_type||'Unknown crop'}</td>
        <td class="px-6 py-4 text-on-surface-variant hidden sm:table-cell">${d.ai_result?.disease_name||'—'}</td>
        <td class="px-6 py-4">${priorityBadge(c.priority)}</td>
        <td class="px-6 py-4">${badge(c.status?.replace(/_/g,' ')||'—','bg-surface-container text-on-surface-variant')}</td>
        <td class="px-6 py-4"><button class="text-on-surface-variant hover:text-primary"><span class="material-symbols-outlined text-xl">chevron_right</span></button></td>
      </tr>`;
    }).join('');
  } catch(e) { tbody.innerHTML=`<tr><td colspan="5" class="px-6 py-6 text-center text-error text-sm">Failed to load cases</td></tr>`; }
}

async function setupNotifBell() {
  try {
    const res = await api.get('/notifications?is_read=false&limit=1');
    const count = res.meta?.total||0;
    if (count>0) {
      document.querySelectorAll('button').forEach(btn=>{
        const ic=btn.querySelector('.material-symbols-outlined');
        if(ic&&ic.textContent.trim()==='notifications'){ ic.style.color='#ba1a1a'; }
      });
      // Update chat badge
      const pending = (await api.get('/chats?limit=1').catch(()=>({meta:{total:0}}))).meta?.total||0;
      document.querySelectorAll('[data-chat-badge]').forEach(el=>{el.textContent=pending||count;el.classList.toggle('hidden',!pending&&!count);});
    }
  } catch(_) {}
}

const setText=(sel,val)=>document.querySelectorAll(sel).forEach(el=>el.textContent=val??'');
