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
    _notifs = (await api.get('/notifications?limit=100')).data || [];
    updateCount(); render(_filtered(_tab));
  } catch(e) { showToast('Failed to load notifications','error'); }
}

/* ── render ──────────────────────────────────────────────────────────────── */
function render(list) {
  const con = document.querySelector('[data-notifications-list], main .flex.flex-col.gap-3, main .flex.flex-col.gap-6');
  if (!con) return;

  // Clear previous content
  con.querySelectorAll('.notif-item').forEach(el => el.remove());
  con.querySelectorAll('[data-notif-section]').forEach(el => el.remove());
  // Clear loading skeletons
  con.innerHTML = '';

  if (!list.length) {
    con.innerHTML = `
      <div class="flex flex-col items-center justify-center py-24 text-center gap-4">
        <div class="w-20 h-20 rounded-full bg-surface-container border-2 border-surface-variant flex items-center justify-center">
          <span class="material-symbols-outlined text-[40px] text-on-surface-variant/30">notifications_off</span>
        </div>
        <div>
          <p class="font-semibold text-slate-600 text-base">No notifications</p>
          <p class="text-sm text-slate-400 mt-1">You're all caught up! Check back later.</p>
        </div>
      </div>`;
    return;
  }

  // ── Group by time period ──
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const weekAgo   = new Date(today); weekAgo.setDate(today.getDate() - 7);

  const groups = { Today: [], Yesterday: [], 'This Week': [], Earlier: [] };

  list.forEach(n => {
    const d = new Date(n.created_at);
    if      (d >= today)     groups['Today'].push(n);
    else if (d >= yesterday) groups['Yesterday'].push(n);
    else if (d >= weekAgo)   groups['This Week'].push(n);
    else                     groups['Earlier'].push(n);
  });

  let html = '';
  Object.entries(groups).forEach(([label, items]) => {
    if (!items.length) return;
    html += `
      <div data-notif-section class="flex items-center gap-3 mb-1 mt-2">
        <span class="text-[11px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">${label}</span>
        <div class="flex-1 h-px bg-slate-100"></div>
        <span class="text-[11px] text-slate-400">${items.length} notification${items.length !== 1 ? 's' : ''}</span>
      </div>
      ${items.map(notifCard).join('')}`;
  });

  con.innerHTML = html;

  // Wire click handlers
  con.querySelectorAll('.notif-item[data-nid]').forEach(el => {
    if (!el.dataset.read) {
      el.addEventListener('click', () => markOne(el.dataset.nid, el));
    }
  });
}

/* ── notifCard ───────────────────────────────────────────────────────────── */
function notifCard(n) {
  // Icon map per notification type
  const iconMap = {
    expert_reply:    { icon: 'forum',            bg: 'bg-blue-50',   color: 'text-blue-600',   ring: 'border-blue-100'  },
    treatment_due:   { icon: 'schedule',          bg: 'bg-amber-50',  color: 'text-amber-600',  ring: 'border-amber-100' },
    order_status:    { icon: 'shopping_basket',   bg: 'bg-violet-50', color: 'text-violet-600', ring: 'border-violet-100'},
    diagnosis_ready: { icon: 'biotech',           bg: 'bg-green-50',  color: 'text-green-700',  ring: 'border-green-100' },
    new_order:       { icon: 'local_shipping',    bg: 'bg-cyan-50',   color: 'text-cyan-700',   ring: 'border-cyan-100'  },
    low_stock:       { icon: 'inventory_2',       bg: 'bg-orange-50', color: 'text-orange-600', ring: 'border-orange-100'},
    system:          { icon: 'notifications',     bg: 'bg-slate-50',  color: 'text-slate-500',  ring: 'border-slate-200' },
  };
  const style  = iconMap[n.type] || iconMap.system;
  const normalizedTitle =
    n.type === 'expert_reply' && (n.title || '').trim() === 'الخبير بعتلك رسالة'
      ? 'New message from expert'
      : (n.title || 'Notification');

  // Link map per related type
  const linkMap = {
    diagnosis:         'recendiagnoses.html',
    order:             'ordertracking.html',
    chat:              'expertschat.html',
    treatment_request: 'recendiagnoses.html',
    product_listing:   'treatmentsolutions.html',
  };
  const link = n.related_type ? (linkMap[n.related_type] || '#') : null;

  const isRead = !!n.is_read;

  return `
  <div class="notif-item ${isRead ? 'is-read' : 'unread'}
              relative flex items-start gap-4 px-5 py-4
              bg-white rounded-2xl border cursor-pointer
              ${isRead ? 'border-slate-100' : 'border-green-100 bg-green-50/30'}
              shadow-sm overflow-hidden"
       data-nid="${n._id}" ${isRead ? 'data-read="true"' : ''}>

    <!-- Unread left bar -->
    ${!isRead ? `<div class="unread-bar absolute left-0 top-0 bottom-0 w-[3px] bg-primary rounded-l-2xl"></div>` : ''}

    <!-- Icon -->
    <div class="notif-icon-wrap shrink-0 mt-0.5">
      <div class="w-11 h-11 rounded-full ${style.bg} border ${style.ring} flex items-center justify-center">
        <span class="material-symbols-outlined fill ${style.color} text-[20px]">${style.icon}</span>
      </div>
    </div>

    <!-- Content -->
    <div class="notif-content flex-1 min-w-0">
      <div class="flex items-start justify-between gap-3">
        <p class="text-sm font-bold text-on-surface leading-snug">${escapeHtml(normalizedTitle)}</p>
        <div class="flex items-center gap-2 shrink-0">
          <span class="text-[11px] font-medium text-slate-400 whitespace-nowrap">${timeAgo(n.created_at)}</span>
          ${!isRead ? `<div class="unread-dot w-2 h-2 bg-primary rounded-full shrink-0 mt-0.5"></div>` : ''}
        </div>
      </div>
      <p class="text-sm text-slate-500 mt-0.5 leading-relaxed">${escapeHtml(n.body)}</p>
      ${link ? `
      <a href="${link}" onclick="event.stopPropagation()"
         class="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-primary hover:text-primary/80 hover:underline transition-colors">
        View details <span class="material-symbols-outlined text-[13px]">arrow_forward</span>
      </a>` : ''}
    </div>
  </div>`;
}

/* ── markOne ─────────────────────────────────────────────────────────────── */
async function markOne(id, el) {
  if (el.dataset.read) return;
  try {
    await api.put(`/notifications/${id}/read`);
    const n = _notifs.find(x => x._id === id);
    if (n) n.is_read = true;

    // Animate transition to read state
    el.classList.remove('unread', 'bg-green-50/30', 'border-green-100');
    el.classList.add('is-read', 'border-slate-100');
    el.dataset.read = 'true';

    el.querySelector('.unread-bar')?.remove();
    el.querySelector('.unread-dot')?.remove();

    updateCount();
  } catch(_) {}
}

/* ── markAll — called by onclick AND by setupMarkAll() ───────────────────── */
async function markAll() {
  try {
    await api.put('/notifications/read-all');
    _notifs.forEach(n => n.is_read = true);
    render(_filtered(_tab));
    updateCount();
    showToast('All marked as read', 'success');
  } catch(e) { showToast('Failed', 'error'); }
}

// Alias — HTML uses onclick="markAllRead()" 
const markAllRead = markAll;

/* ── setupMarkAll ────────────────────────────────────────────────────────── */
function setupMarkAll() {
  document.querySelectorAll('button').forEach(btn => {
    if (btn.textContent?.includes('Mark all') || btn.getAttribute('onclick')?.includes('markAllRead')) {
      btn.removeAttribute('onclick');
      btn.addEventListener('click', markAll);
    }
  });
}

/* ── setupTabs ───────────────────────────────────────────────────────────── */
function setupTabs() {
  document.querySelectorAll('[data-filter-tab], [onclick*="setTab"]').forEach(tab => {
    const f = tab.dataset.filterTab || tab.getAttribute('onclick')?.match(/'([^']+)'\)/)?.[1];
    if (!f) return;
    tab.removeAttribute('onclick');
    tab.addEventListener('click', () => {
      _tab = f;
      document.querySelectorAll('[data-filter-tab], [onclick*="setTab"], .filter-tab').forEach(t => {
        t.classList.remove('active');
        // Reset non-active styles
        t.classList.add('border-slate-200', 'bg-white', 'text-slate-600');
        t.classList.remove('border-transparent');
      });
      tab.classList.add('active');
      tab.classList.remove('border-slate-200', 'bg-white', 'text-slate-600');
      tab.classList.add('border-transparent');
      render(_filtered(f));
    });
  });
}

/* ── _filtered ───────────────────────────────────────────────────────────── */
function _filtered(f) {
  if (f === 'unread') return _notifs.filter(n => !n.is_read);
  if (f === 'expert') return _notifs.filter(n => n.type === 'expert_reply');
  return _notifs;
}

/* ── updateCount ─────────────────────────────────────────────────────────── */
function updateCount() {
  const n = _notifs.filter(x => !x.is_read).length;
  document.querySelectorAll('#unread-count, [data-unread-count]').forEach(el => {
    el.textContent = n;
    el.classList.toggle('hidden', n === 0);
  });
}
