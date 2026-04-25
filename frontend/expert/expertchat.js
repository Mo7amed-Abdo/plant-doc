// expertchat.js — Expert Chat page
let _socket=null, _activeChatId=null, _activeRequestId=null, _chats=[];

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth('expert')) return;
  populateSidebarUser();
  setupLogout(null);
  await loadChats();
  connectSocket();
  setupInput();
});

async function loadChats() {
  const list = document.querySelector('[data-chat-list], aside .flex-1.overflow-y-auto, .w-80 .flex-1');
  try {
    _chats = (await api.get('/chats?limit=50')).data||[];
    if (!list) { if(_chats.length) openChat(_chats[0]._id); return; }
    if (!_chats.length) { list.innerHTML=`<div class="p-6 text-center"><span class="material-symbols-outlined text-4xl text-on-surface-variant/40 block mb-2">forum</span><p class="text-sm text-on-surface-variant">No active chats</p><p class="text-xs text-on-surface-variant/70 mt-1">Pick up a case from Pending Cases</p></div>`; return; }
    list.innerHTML = _chats.map(chatItem).join('');
    list.querySelectorAll('[data-open-chat]').forEach(el=>el.addEventListener('click',()=>openChat(el.dataset.openChat)));
    if (_chats.length) openChat(_chats[0]._id);
  } catch(e) { if(list) list.innerHTML=`<div class="p-4 text-error text-sm">${e.message}</div>`; }
}

function chatItem(c) {
  const farmer=c.farmer_id||{}, req=c.treatment_request_id||{};
  const unread = !c.is_resolved;
  return `<div data-open-chat="${c._id}" class="flex items-start gap-3 p-4 cursor-pointer rounded-xl transition-colors hover:bg-surface-container-low ${_activeChatId===c._id?'border-l-2 border-primary bg-surface-container-low':''}">
    <div class="relative shrink-0"><div class="w-11 h-11 rounded-full bg-secondary-container/30 text-secondary flex items-center justify-center font-bold text-sm border border-surface-variant">F</div>${unread?`<div class="absolute bottom-0 right-0 w-3 h-3 bg-primary rounded-full border-2 border-surface-container-lowest"></div>`:''}</div>
    <div class="flex-1 min-w-0"><div class="flex items-baseline justify-between gap-2 mb-0.5"><p class="font-semibold text-on-surface text-sm truncate">Farmer Case</p>${c.last_message_at?`<span class="text-xs text-on-surface-variant shrink-0">${timeAgo(c.last_message_at)}</span>`:''}</div>
    <p class="text-xs text-on-surface-variant truncate">${c.is_resolved?'✓ Resolved':`Priority: ${req.priority||'medium'}`}</p></div>
  </div>`;
}

async function openChat(chatId) {
  _activeChatId = chatId;
  document.querySelectorAll('[data-open-chat]').forEach(el=>{
    el.classList.toggle('border-l-2',el.dataset.openChat===chatId);
    el.classList.toggle('border-primary',el.dataset.openChat===chatId);
    el.classList.toggle('bg-surface-container-low',el.dataset.openChat===chatId);
  });
  const area=document.getElementById('messages-area')||document.querySelector('[data-messages-area]');
  if (area) area.innerHTML=`<div class="flex justify-center py-4"><span class="text-xs text-on-surface-variant animate-pulse">Loading…</span></div>`;
  try {
    const [msgsRes, chatRes] = await Promise.all([
      api.get(`/chats/${chatId}/messages?limit=100`),
      api.get(`/chats/${chatId}`),
    ]);
    const msgs = msgsRes.data||[];
    const chat = chatRes.data;
    _activeRequestId = chat.treatment_request_id?._id || chat.treatment_request_id;
    if (area) { renderMsgs(msgs,area); scrollBot(area); }
    if(_socket?.connected) _socket.emit('chat:join',{chatId});
    // Update header
    document.querySelectorAll('[data-chat-header-name]').forEach(el=>el.textContent='Farmer Case');
    document.querySelectorAll('[data-chat-header-sub]').forEach(el=>el.textContent=chat.is_resolved?'Resolved':(`Priority: ${chat.treatment_request_id?.priority||'medium'}`));
    // Resolve/View buttons
    updateActionBtns(chat);
  } catch(e) { if(area) area.innerHTML=`<div class="p-4 text-error text-sm text-center">${e.message}</div>`; }
}

function updateActionBtns(chat) {
  const viewBtn    = document.querySelector('[data-action="view-case"], button:has(.material-symbols-outlined)');
  const resolveBtn = document.querySelector('[data-action="resolve-case"], [data-resolve-btn]');
  if (chat.is_resolved) {
    resolveBtn && (resolveBtn.disabled=true) && (resolveBtn.textContent='Resolved');
  }
  // Wire resolve
  document.querySelectorAll('button').forEach(btn=>{
    const txt=btn.querySelector('.material-symbols-outlined')?.textContent?.trim();
    if(txt==='check_circle'||btn.textContent?.includes('Resolve')) {
      btn.addEventListener('click',()=>openReviewModal());
    }
  });
}

function renderMsgs(msgs,container) {
  const myId=Auth.getUser()?.id||Auth.getUser()?._id;
  if(!msgs.length){container.innerHTML=`<div class="flex justify-center py-8"><div class="bg-surface-container-high text-on-surface-variant text-xs py-1.5 px-4 rounded-full">No messages yet</div></div>`;return;}
  container.innerHTML=msgs.map(m=>msgEl(m,myId,'expert')).join('');
}

function msgEl(m,myId,myRole) {
  const isMe=m.sender_role==='expert', isSys=m.sender_role==='system';
  if(isSys) return `<div class="flex justify-center my-2"><div class="bg-surface-container-high text-on-surface-variant text-xs py-1 px-3 rounded-full">${m.text||'System'}</div></div>`;
  if(m.content_type==='ai_analysis'&&m.ai_analysis){const ai=m.ai_analysis;return `<div class="flex ${isMe?'justify-end':'justify-start'} my-2"><div class="max-w-[80%] bg-primary-fixed/20 border border-primary/20 rounded-2xl p-4"><p class="text-xs font-semibold text-primary mb-2 flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">biotech</span>AI Diagnosis</p><p class="text-sm font-bold">${ai.disease_name||'—'}</p>${severityBadge(ai.severity)}</div></div>`;}
  return `<div class="flex items-end gap-2 ${isMe?'flex-row-reverse':''} max-w-[80%] ${isMe?'ml-auto':''}">
    ${!isMe?`<div class="w-7 h-7 rounded-full bg-secondary-container/30 flex items-center justify-center text-xs font-bold shrink-0">F</div>`:''}
    <div class="flex flex-col gap-1 ${isMe?'items-end':'items-start'}">
      <span class="text-xs text-on-surface-variant px-1">${formatDateTime(m.sent_at)}</span>
      <div class="px-4 py-2.5 rounded-2xl ${isMe?'bg-green-700 text-white rounded-br-sm':'bg-surface-container-high text-on-surface rounded-bl-sm'}">
        ${m.image?`<img src="${m.image}" class="max-w-xs rounded-lg mb-1"/>`:''}
        ${m.text?`<p class="text-sm">${escapeHtml(m.text)}</p>`:''}
      </div>
    </div>
  </div>`;
}

function appendMsg(m) {
  const area=document.getElementById('messages-area')||document.querySelector('[data-messages-area]');
  if(!area) return;
  const d=document.createElement('div');
  d.innerHTML=msgEl(m,Auth.getUser()?.id,'expert');
  area.appendChild(d.firstElementChild); scrollBot(area);
}

function setupInput() {
  const inp=document.getElementById('message-input')||document.querySelector('[data-message-input], input[placeholder*="essage"], textarea[placeholder*="essage"]');
  const btn=document.getElementById('send-btn')||document.querySelector('[data-send-btn]');
  if(!inp) return;
  inp.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send(inp);}});
  btn?.addEventListener('click',()=>send(inp));
}

async function send(inp) {
  const text=inp.value.trim(); if(!text||!_activeChatId) return;
  inp.value='';
  appendMsg({_id:`t${Date.now()}`,sender_role:'expert',content_type:'text',text,sent_at:new Date().toISOString()});
  if(_socket?.connected){_socket.emit('message:send',{chatId:_activeChatId,content_type:'text',text});}
  else{try{await api.post(`/chats/${_activeChatId}/messages`,{content_type:'text',text});}catch(e){showToast('Send failed','error');}}
}

// ── Review Modal ──────────────────────────────────────────────────────────────
function openReviewModal() {
  if(!_activeRequestId){showToast('No active case to review','error');return;}
  const m=document.createElement('div');
  m.className='fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 overflow-y-auto';
  m.innerHTML=`<div class="bg-surface rounded-2xl w-full max-w-md shadow-xl my-auto">
    <div class="p-5 border-b border-surface-variant"><h3 class="text-lg font-bold text-on-surface">Submit Expert Review</h3><p class="text-sm text-on-surface-variant mt-0.5">This will close the case</p></div>
    <div class="p-5 space-y-4">
      <div><label class="block text-sm font-medium text-on-surface mb-1.5">Decision *</label>
        <select id="rv-decision" class="w-full px-4 py-2.5 border border-outline-variant rounded-xl text-sm focus:ring-1 focus:ring-primary bg-surface-container-lowest">
          <option value="approved">Approved — AI diagnosis is correct</option>
          <option value="edited">Edited — I have corrections</option>
          <option value="rejected">Rejected — AI diagnosis is wrong</option>
        </select>
      </div>
      <div><label class="block text-sm font-medium text-on-surface mb-1.5">Confirmed Disease</label><input id="rv-disease" type="text" placeholder="Your diagnosis…" class="w-full px-4 py-2.5 border border-outline-variant rounded-xl text-sm focus:ring-1 focus:ring-primary bg-surface-container-lowest"/></div>
      <div><label class="block text-sm font-medium text-on-surface mb-1.5">Confirmed Severity</label>
        <select id="rv-severity" class="w-full px-4 py-2.5 border border-outline-variant rounded-xl text-sm focus:ring-1 focus:ring-primary bg-surface-container-lowest">
          <option value="">Same as AI</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
        </select>
      </div>
      <div><label class="block text-sm font-medium text-on-surface mb-1.5">Expert Notes *</label><textarea id="rv-notes" rows="4" placeholder="Your detailed findings and recommendations for the farmer…" class="w-full px-4 py-3 border border-outline-variant rounded-xl text-sm focus:ring-1 focus:ring-primary resize-none bg-surface-container-lowest"></textarea></div>
    </div>
    <div class="p-5 pt-0 flex gap-3">
      <button onclick="this.closest('.fixed').remove()" class="flex-1 py-2.5 border border-outline-variant rounded-xl text-sm font-medium text-on-surface-variant">Cancel</button>
      <button id="submit-review-btn" class="flex-1 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-semibold">Submit Review</button>
    </div>
  </div>`;
  document.body.appendChild(m);
  m.addEventListener('click',e=>{if(e.target===m)m.remove();});
  m.querySelector('#submit-review-btn').addEventListener('click',async()=>{
    const notes=m.querySelector('#rv-notes').value.trim();
    if(!notes){showToast('Expert notes are required','error');return;}
    const btn=m.querySelector('#submit-review-btn'); btn.disabled=true; btn.textContent='Submitting…';
    try{
      await api.post(`/treatment-requests/${_activeRequestId}/review`,{
        decision:m.querySelector('#rv-decision').value,
        confirmed_disease:m.querySelector('#rv-disease').value.trim()||null,
        confirmed_severity:m.querySelector('#rv-severity').value||null,
        expert_notes:notes,
      });
      m.remove(); showToast('Review submitted! Case closed.','success');
      await loadChats();
    }catch(err){showToast(err.message||'Failed','error');btn.disabled=false;btn.textContent='Submit Review';}
  });
}

function connectSocket() {
  if(typeof io==='undefined'){console.warn('[Chat] Socket.IO not loaded');return;}
  _socket=io('http://localhost:5000',{auth:{token:Auth.getToken()}});
  _socket.on('connect',()=>{if(_activeChatId)_socket.emit('chat:join',{chatId:_activeChatId});});
  _socket.on('message:new',m=>{if(m.sender_role!=='expert')appendMsg(m);});
  _socket.on('notification:new',n=>showToast(n.title||'New notification','info'));
  _socket.on('error',({message})=>console.error('[Socket]',message));
}

function scrollBot(el){setTimeout(()=>{el.scrollTop=el.scrollHeight;},50);}
