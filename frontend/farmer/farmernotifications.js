// farmernotifications.js
let _notifs=[], _tab='all';

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth('farmer')) return;
  populateSidebarUser(); setupLogout();
  await loadNotifs();
  setupTabs(); setupMarkAll();
});

async function loadNotifs() {
  try {
    _notifs = (await api.get('/notifications?limit=100')).data||[];
    updateCount(); render(_filtered(_tab));
  } catch(e) { showToast('Failed to load notifications','error'); }
}

function render(list) {
  const con = document.querySelector('[data-notifications-list], main .flex.flex-col.gap-3, main .flex.flex-col.gap-6');
  if (!con) return;
  // Remove old dynamic items
  con.querySelectorAll('.notif-item').forEach(el=>el.remove());
  // Also clear static section labels if we're re-rendering
  con.querySelectorAll('[data-notif-section]').forEach(el=>el.remove());

  if (!list.length) {
    con.innerHTML=`<div class="py-16 text-center"><span class="material-symbols-outlined text-5xl text-on-surface-variant/40 block mb-3">notifications_off</span><p class="text-on-surface-variant">No notifications</p></div>`;
    return;
  }
  const unread=list.filter(n=>!n.is_read), read=list.filter(n=>n.is_read);
  let html='';
  if (unread.length) html+=`<p data-notif-section class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">${unread.map(notifCard).join('')}`;
  if (read.length)   html+=`<p data-notif-section class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mt-4">Read</p>${read.map(notifCard).join('')}`;
  con.innerHTML = html;
  con.querySelectorAll('.notif-item[data-nid]').forEach(el => { if(!el.dataset.read) el.addEventListener('click',()=>markOne(el.dataset.nid,el)); });
}

function notifCard(n) {
  const icons={expert_reply:'forum',treatment_due:'schedule',order_status:'shopping_basket',diagnosis_ready:'biotech',system:'notifications'};
  const icon=icons[n.type]||'notifications';
  const link={diagnosis:'recendiagnoses.html',order:'ordertracking.html',chat:'expertschat.html',treatment_request:'recendiagnoses.html'}[n.related_type]||'#';
  return `<div class="notif-item ${n.is_read?'is-read':'unread'} bg-surface-container-lowest border border-surface-variant rounded-[16px] flex items-start overflow-hidden cursor-pointer hover:shadow-sm transition-all relative" data-nid="${n._id}" ${n.is_read?'data-read="true"':''}>
    ${!n.is_read?`<div class="unread-bar absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-l-[16px]"></div>`:''}
    <div class="pl-5 py-5 notif-icon-wrap shrink-0 ${n.is_read?'opacity-60':''}"><div class="w-10 h-10 rounded-full bg-primary-fixed/40 text-primary flex items-center justify-center"><span class="material-symbols-outlined fill text-[20px]">${icon}</span></div></div>
    <div class="flex-1 min-w-0 py-5 px-4 notif-content ${n.is_read?'opacity-75':''}">
      <div class="flex items-start justify-between gap-2 mb-1"><h4 class="text-sm font-bold text-on-surface">${n.title}</h4><span class="text-xs font-semibold ${n.is_read?'text-on-surface-variant':'text-primary'} shrink-0">${timeAgo(n.created_at)}</span></div>
      <p class="text-sm text-on-surface-variant leading-relaxed">${n.body}</p>
      ${n.related_type?`<a href="${link}" class="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-primary hover:underline">View <span class="material-symbols-outlined text-[14px]">arrow_forward</span></a>`:''}
    </div>
    ${!n.is_read?`<div class="pr-4 py-5 flex items-start"><div class="unread-dot w-2 h-2 bg-primary rounded-full mt-2"></div></div>`:''}
  </div>`;
}

async function markOne(id, el) {
  if (el.dataset.read) return;
  try {
    await api.put(`/notifications/${id}/read`);
    const n=_notifs.find(x=>x._id===id); if(n) n.is_read=true;
    el.classList.remove('unread'); el.classList.add('is-read'); el.dataset.read='true';
    el.querySelector('.unread-bar')?.remove(); el.querySelector('.unread-dot')?.remove();
    el.querySelector('.notif-icon-wrap')?.classList.add('opacity-60');
    el.querySelector('.notif-content')?.classList.add('opacity-75');
    updateCount();
  } catch(_){}
}

async function markAll() {
  try { await api.put('/notifications/read-all'); _notifs.forEach(n=>n.is_read=true); render(_filtered(_tab)); updateCount(); showToast('All marked as read','success'); }
  catch(e) { showToast('Failed','error'); }
}

function setupMarkAll() {
  document.querySelectorAll('button').forEach(btn => {
    if (btn.textContent?.includes('Mark all')||btn.getAttribute('onclick')?.includes('markAllRead')) {
      btn.removeAttribute('onclick'); btn.addEventListener('click', markAll);
    }
  });
}

function setupTabs() {
  document.querySelectorAll('[data-filter-tab], [onclick*="setTab"]').forEach(tab => {
    const f = tab.dataset.filterTab || tab.getAttribute('onclick')?.match(/'([^']+)'\)/)?.[1];
    if (!f) return;
    tab.removeAttribute('onclick');
    tab.addEventListener('click', () => {
      _tab=f;
      document.querySelectorAll('[data-filter-tab],[onclick*="setTab"],.filter-tab').forEach(t=>t.classList.remove('active'));
      tab.classList.add('active');
      render(_filtered(f));
    });
  });
}

function _filtered(f) {
  if (f==='unread') return _notifs.filter(n=>!n.is_read);
  if (f==='expert') return _notifs.filter(n=>n.type==='expert_reply');
  return _notifs;
}

function updateCount() {
  const n=_notifs.filter(x=>!x.is_read).length;
  document.querySelectorAll('#unread-count,[data-unread-count]').forEach(el=>{el.textContent=n;el.classList.toggle('hidden',n===0);});
}
