// expertschat.js (farmer side)
let _socket=null, _activeChatId=null, _chats=[];

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth('farmer')) return;
  populateSidebarUser(); setupLogout(_socket);
  await loadChats();
  connectSocket();
  setupInput();
});

async function loadChats() {
  const list = document.querySelector('[data-chat-list], aside .flex-1.overflow-y-auto');
  try {
    _chats = (await api.get('/chats?limit=50')).data || [];
    if (!list) return;
    if (!_chats.length) { list.innerHTML=`<div class="p-6 text-center"><span class="material-symbols-outlined text-4xl text-on-surface-variant/40 block mb-2">forum</span><p class="text-sm text-on-surface-variant">No conversations yet</p><p class="text-xs text-on-surface-variant/70 mt-1">Request expert review from Diagnoses page</p></div>`; return; }
    list.innerHTML = _chats.map(chatItem).join('');
    list.querySelectorAll('[data-open-chat]').forEach(el => el.addEventListener('click', () => openChat(el.dataset.openChat)));
    if (_chats.length) openChat(_chats[0]._id);
  } catch(e) { if(list) list.innerHTML=`<div class="p-4 text-error text-sm">${e.message}</div>`; }
}

function chatItem(c) {
  const ex=c.expert_id||{}, req=c.treatment_request_id||{};
  return `<div data-open-chat="${c._id}" class="flex items-start gap-3 p-4 cursor-pointer rounded-xl transition-colors hover:bg-surface-container-low ${_activeChatId===c._id?'border-l-2 border-primary bg-surface-container-low':''}">
    <div class="relative shrink-0"><div class="w-11 h-11 rounded-full bg-primary-container/20 text-primary flex items-center justify-center font-bold text-sm border border-surface-variant">${ex.specialization?.[0]||'E'}</div>${!c.is_resolved?`<div class="absolute bottom-0 right-0 w-3 h-3 bg-primary rounded-full border-2 border-surface-container-lowest"></div>`:''}</div>
    <div class="flex-1 min-w-0"><div class="flex items-baseline justify-between gap-2 mb-0.5"><p class="font-semibold text-on-surface text-sm truncate">Expert · ${ex.specialization||'Agronomist'}</p>${c.last_message_at?`<span class="text-xs text-on-surface-variant shrink-0">${timeAgo(c.last_message_at)}</span>`:''}</div>
    <p class="text-xs text-on-surface-variant truncate">${c.is_resolved?'✓ Case Resolved':`Priority: ${req.priority||'medium'}`}</p></div>
  </div>`;
}

async function openChat(chatId) {
  _activeChatId = chatId;
  document.querySelectorAll('[data-open-chat]').forEach(el => {
    el.classList.toggle('border-l-2',el.dataset.openChat===chatId);
    el.classList.toggle('border-primary',el.dataset.openChat===chatId);
    el.classList.toggle('bg-surface-container-low',el.dataset.openChat===chatId);
  });
  const area = document.getElementById('messages-area')||document.querySelector('[data-messages-area]');
  if (area) area.innerHTML=`<div class="flex justify-center py-4"><span class="text-xs text-on-surface-variant animate-pulse">Loading…</span></div>`;
  try {
    const msgs = (await api.get(`/chats/${chatId}/messages?limit=100`)).data||[];
    if (area) { renderMsgs(msgs, area); scrollBot(area); }
    if (_socket?.connected) _socket.emit('chat:join',{chatId});
    // Update header
    const c=_chats.find(x=>x._id===chatId), ex=c?.expert_id||{};
    document.querySelectorAll('[data-chat-header-name]').forEach(el=>el.textContent=`Expert · ${ex.specialization||'Agronomist'}`);
    document.querySelectorAll('[data-chat-header-sub]').forEach(el=>el.textContent=c?.is_resolved?'Case Resolved':'Active Case');
  } catch(e) { if(area) area.innerHTML=`<div class="p-4 text-error text-sm text-center">${e.message}</div>`; }
}

function renderMsgs(msgs, container) {
  const myId = Auth.getUser()?.id||Auth.getUser()?._id;
  if (!msgs.length) { container.innerHTML=`<div class="flex justify-center py-8"><div class="bg-surface-container-high text-on-surface-variant text-xs py-1.5 px-4 rounded-full">No messages yet. Say hello! 👋</div></div>`; return; }
  container.innerHTML = msgs.map(m=>msgEl(m,myId)).join('');
}

function msgEl(m, myId) {
  const isMe=m.sender_role==='farmer', isSys=m.sender_role==='system';
  if (isSys) return `<div class="flex justify-center my-2"><div class="bg-surface-container-high text-on-surface-variant text-xs py-1 px-3 rounded-full">${m.text||'System message'}</div></div>`;
  if (m.content_type==='ai_analysis'&&m.ai_analysis) {
    const ai=m.ai_analysis;
    return `<div class="flex ${isMe?'justify-end':'justify-start'} my-2"><div class="max-w-[80%] bg-primary-fixed/20 border border-primary/20 rounded-2xl p-4"><p class="text-xs font-semibold text-primary mb-2 flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">biotech</span>AI Diagnosis</p><p class="text-sm font-bold text-on-surface">${ai.disease_name||'—'}</p><p class="text-xs text-on-surface-variant mt-1">Confidence: ${(ai.confidence||0).toFixed(0)}%</p>${severityBadge(ai.severity)}</div></div>`;
  }
  return `<div class="flex items-end gap-2 ${isMe?'flex-row-reverse':''} max-w-[80%] ${isMe?'ml-auto':''}">
    ${!isMe?`<div class="w-7 h-7 rounded-full bg-primary-container/20 text-primary flex items-center justify-center text-xs font-bold shrink-0">E</div>`:''}
    <div class="flex flex-col gap-1 ${isMe?'items-end':'items-start'}">
      <span class="text-xs text-on-surface-variant px-1">${formatDateTime(m.sent_at)}</span>
      <div class="px-4 py-2.5 rounded-2xl ${isMe?'bg-primary text-on-primary rounded-br-sm':'bg-surface-container-high text-on-surface rounded-bl-sm'}">
        ${m.image?`<img src="${m.image}" class="max-w-xs rounded-lg mb-1"/>`:''}
        ${m.text?`<p class="text-sm">${escapeHtml(m.text)}</p>`:''}
      </div>
    </div>
  </div>`;
}

function appendMsg(m) {
  const area=document.getElementById('messages-area')||document.querySelector('[data-messages-area]');
  if (!area) return;
  const myId=Auth.getUser()?.id||Auth.getUser()?._id;
  const d=document.createElement('div'); d.innerHTML=msgEl(m,myId);
  area.appendChild(d.firstElementChild); scrollBot(area);
}

function setupInput() {
  const inp=document.getElementById('message-input')||document.querySelector('[data-message-input], input[placeholder*="essage"], textarea[placeholder*="essage"]');
  const btn=document.getElementById('send-btn')||document.querySelector('[data-send-btn]');
  if (!inp) return;
  inp.addEventListener('keydown', e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send(inp);} });
  btn?.addEventListener('click', ()=>send(inp));
  // Image attach
  const fi=document.createElement('input'); fi.type='file'; fi.accept='image/*'; fi.style.display='none'; document.body.appendChild(fi);
  document.querySelectorAll('button').forEach(b=>{const ic=b.querySelector('.material-symbols-outlined'); if(ic&&(ic.textContent.trim()==='attach_file'||ic.textContent.trim()==='image'))b.addEventListener('click',()=>fi.click());});
  fi.addEventListener('change',async()=>{ if(!_activeChatId||!fi.files[0]) return; const fd=new FormData(); fd.append('image',fi.files[0]); fd.append('content_type','image');
    try{const res=await api.post(`/chats/${_activeChatId}/messages`,fd); appendMsg(res.data);}catch(e){showToast('Failed to send image','error');} fi.value='';});
}

async function send(inp) {
  const text=inp.value.trim(); if(!text||!_activeChatId) return;
  inp.value='';
  const temp={_id:`t-${Date.now()}`,sender_role:'farmer',sender_id:Auth.getUser()?.id,content_type:'text',text,sent_at:new Date().toISOString(),is_read:false};
  appendMsg(temp);
  if (_socket?.connected) { _socket.emit('message:send',{chatId:_activeChatId,content_type:'text',text}); }
  else { try{await api.post(`/chats/${_activeChatId}/messages`,{content_type:'text',text});}catch(e){showToast('Send failed','error');} }
}

function connectSocket() {
  if (typeof io==='undefined') { console.warn('[Chat] Socket.IO CDN not loaded'); return; }
  _socket = io('http://localhost:5000',{auth:{token:Auth.getToken()}});
  _socket.on('connect', ()=>{ if(_activeChatId) _socket.emit('chat:join',{chatId:_activeChatId}); });
  _socket.on('message:new', m=>{ if(m.sender_role!=='farmer') appendMsg(m); });
  _socket.on('chat:resolved', ({chatId})=>{ if(chatId===_activeChatId){showToast('Case resolved by expert','info'); loadChats();} });
  _socket.on('notification:new', n=>showToast(n.title||'New notification','info'));
  _socket.on('error', ({message})=>console.error('[Socket]',message));
}

function scrollBot(el) { setTimeout(()=>{el.scrollTop=el.scrollHeight;},50); }
