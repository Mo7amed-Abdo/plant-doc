// expertschat.js (farmer side)
let _socket = null;
let _activeChatId = null;
let _chats = [];
let _allChats = [];
let _chatSearchTerm = '';
let _renderedMessageIds = new Set();
let _activeExpertName = 'Expert';
let _activeExpertAvatar = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth('farmer')) return;
  populateSidebarUser();
  setupLogout(_socket);
  await loadChats();
  setupChatSearch();
  connectSocket();
  setupInput();
});

async function loadChats() {
  try {
    _allChats = (await api.get('/chats?limit=50')).data || [];
    _chats = [..._allChats];
    renderChatList();
    if (_chats.length) openChat(_chats[0]._id);
  } catch (e) {
    const list = document.querySelector('[data-chat-list], aside .flex-1.overflow-y-auto');
    if (list) list.innerHTML = `<div class="p-4 text-error text-sm">${e.message}</div>`;
  }
}

function chatItem(c) {
  const ex = c.expert_id || {};
  const req = c.treatment_request_id || {};
  const expertName = getExpertName(c, ex);
  const initials = expertName.charAt(0).toUpperCase() || ex.specialization?.[0] || 'E';
  const avatar = getExpertAvatar(c, ex);
  return `<div data-open-chat="${c._id}" class="flex items-start gap-3 p-4 cursor-pointer rounded-xl transition-colors hover:bg-surface-container-low ${_activeChatId === c._id ? 'border-l-2 border-primary bg-surface-container-low' : ''}">
    <div class="relative shrink-0">
      <div class="w-11 h-11 rounded-full bg-primary-container/20 text-primary flex items-center justify-center font-bold text-sm border border-surface-variant overflow-hidden">
        ${avatar
          ? `<img src="${escapeHtml(avatar)}" alt="${escapeHtml(expertName)}" class="w-full h-full object-cover" />`
          : escapeHtml(initials)}
      </div>
      ${!c.is_resolved ? `<div class="absolute bottom-0 right-0 w-3 h-3 bg-primary rounded-full border-2 border-surface-container-lowest"></div>` : ''}
    </div>
    <div class="flex-1 min-w-0"><div class="flex items-baseline justify-between gap-2 mb-0.5"><p class="font-semibold text-on-surface text-sm truncate">${escapeHtml(expertName)}</p>${c.last_message_at ? `<span class="text-xs text-on-surface-variant shrink-0">${timeAgo(c.last_message_at)}</span>` : ''}</div>
    <p class="text-xs text-on-surface-variant truncate">${c.is_resolved ? 'Case Resolved' : `Priority: ${req.priority || 'medium'}`}</p></div>
  </div>`;
}

async function openChat(chatId) {
  _activeChatId = chatId;

  document.querySelectorAll('[data-open-chat]').forEach((el) => {
    el.classList.toggle('border-l-2', el.dataset.openChat === chatId);
    el.classList.toggle('border-primary', el.dataset.openChat === chatId);
    el.classList.toggle('bg-surface-container-low', el.dataset.openChat === chatId);
  });

  const area = document.getElementById('messages-area') || document.querySelector('[data-messages-area]');
  if (area) area.innerHTML = `<div class="flex justify-center py-4"><span class="text-xs text-on-surface-variant animate-pulse">Loading...</span></div>`;

  try {
    const [msgsRes, chatRes] = await Promise.all([
      api.get(`/messages/${chatId}?limit=100`),
      api.get(`/chats/${chatId}`),
    ]);
    const msgs = msgsRes.data || [];
    const chat = chatRes.data;
    const ex = chat.expert_id || {};
    const expertName = getExpertName(chat, ex);
    const expertAvatar = getExpertAvatar(chat, ex);
    _activeExpertName = expertName || 'Expert';
    _activeExpertAvatar = expertAvatar || null;

    console.log(`[FarmerChat] conversationId exists: ${chatId}`);
    console.log(`[FarmerChat] messages fetched successfully after refresh - conversationId=${chatId}, count=${msgs.length}, total=${msgsRes.meta?.total ?? msgs.length}`);

    if (area) {
      renderMsgs(msgs, area);
      scrollBot(area);
    }
    if (_socket?.connected) _socket.emit('chat:join', { conversationId: chatId });

    document.querySelectorAll('[data-chat-header-name]').forEach((el) => {
      el.textContent = expertName;
    });
    document.querySelectorAll('[data-chat-header-sub]').forEach((el) => {
      el.textContent = chat.is_resolved ? 'Case Resolved' : 'Active Case';
    });
    document.querySelectorAll('[data-chat-header-avatar]').forEach((el) => {
      if (expertAvatar) {
        el.src = expertAvatar;
        el.classList.remove('hidden');
      } else {
        el.removeAttribute('src');
        el.classList.add('hidden');
      }
    });
    document.querySelectorAll('[data-chat-header-avatar-fallback]').forEach((el) => {
      el.textContent = expertName.charAt(0).toUpperCase() || 'E';
      el.classList.toggle('hidden', !!expertAvatar);
    });
  } catch (e) {
    if (area) area.innerHTML = `<div class="p-4 text-error text-sm text-center">${e.message}</div>`;
  }
}

function renderChatList() {
  const list = document.querySelector('[data-chat-list], aside .flex-1.overflow-y-auto');
  if (!list) return;

  if (!_allChats.length) {
    list.innerHTML = `
      <div class="p-6 text-center flex flex-col items-center gap-3">
        <div class="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
          <span class="material-symbols-outlined text-3xl text-primary/50">forum</span>
        </div>
        <div>
          <p class="text-sm font-semibold text-on-surface">No active chats yet</p>
          <p class="text-xs text-on-surface-variant mt-1 leading-relaxed">
            To chat with an expert, first run a diagnosis on your plant,
            then submit a <strong>Treatment Request</strong> from the Diagnoses page.
            An expert will be assigned and a chat will open here.
          </p>
        </div>
        <a href="recendiagnoses.html"
           class="mt-1 flex items-center gap-1.5 px-4 py-2 bg-primary text-on-primary rounded-lg text-xs font-semibold hover:bg-primary/90 transition-all active:scale-[0.97]">
          <span class="material-symbols-outlined text-[15px]">biotech</span>
          Go to Diagnoses
        </a>
      </div>`;
    return;
  }

  _chats = filterChats(_allChats, _chatSearchTerm);
  if (!_chats.length) {
    list.innerHTML = `<div class="p-4 text-sm text-on-surface-variant">No experts match your search.</div>`;
    return;
  }

  list.innerHTML = _chats.map(chatItem).join('');
  list.querySelectorAll('[data-open-chat]').forEach((el) => {
    el.addEventListener('click', () => openChat(el.dataset.openChat));
  });
}

function setupChatSearch() {
  const input = document.querySelector('[data-chat-search], input[placeholder*="Search"]');
  if (!input) return;
  input.addEventListener('input', () => {
    _chatSearchTerm = input.value.trim().toLowerCase();
    renderChatList();
  });
}

function filterChats(chats, term) {
  if (!term) return [...chats];
  return chats.filter((chat) => {
    const ex = chat.expert_id || {};
    const req = chat.treatment_request_id || {};
    const haystack = [
      getExpertName(chat, ex),
      ex.specialization,
      req.priority,
      req.crop_type,
      req.notes,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(term);
  });
}

function getExpertName(chat, expert) {
  return (
    chat?.expertName ||
    expert?.full_name ||
    expert?.name ||
    expert?.user_id?.full_name ||
    expert?.user?.full_name ||
    (expert?.specialization ? `Expert - ${expert.specialization}` : 'Expert')
  );
}

function getExpertAvatar(chat, expert) {
  return (
    chat?.expertAvatar ||
    expert?.profile_picture ||
    expert?.avatar ||
    expert?.image ||
    expert?.logo ||
    expert?.user_id?.profile_picture ||
    expert?.user?.profile_picture ||
    null
  );
}

function renderMsgs(msgs, container) {
  const welcome = document.getElementById('chat-welcome');
  if (welcome) welcome.style.display = 'none';

  const msgContainer = document.getElementById('messages-container') || container;
  const normalizedMsgs = msgs.map(normalizeMessage).filter(Boolean);
  _renderedMessageIds = new Set();

  if (!normalizedMsgs.length) {
    msgContainer.innerHTML = `<div data-empty-state="true" class="flex justify-center py-8"><div class="bg-white border border-slate-200 text-on-surface-variant text-xs py-1.5 px-4 rounded-full shadow-sm">No messages yet. Say hello!</div></div>`;
    return;
  }

  normalizedMsgs.forEach((m) => {
    const messageId = getMessageId(m);
    if (messageId) _renderedMessageIds.add(messageId);
  });

  msgContainer.innerHTML = normalizedMsgs.map((m) => msgEl(m)).join('');
}

function msgEl(message) {
  const senderRole = message.senderRole;
  const messageType = message.messageType;
  const messageId = escapeHtml(getMessageId(message));
  const timestamp = message.createdAt || message.sent_at;
  const isMe = senderRole === 'farmer';
  const isSys = senderRole === 'system';

  if (isSys) {
    return `<div data-message-id="${messageId}" class="flex justify-center my-2"><div class="bg-surface-container-high text-on-surface-variant text-xs py-1 px-3 rounded-full">${message.text || 'System message'}</div></div>`;
  }

  if (messageType === 'ai_analysis' && message.ai_analysis) {
    const ai = message.ai_analysis;
    return `<div data-message-id="${messageId}" class="flex ${isMe ? 'justify-end' : 'justify-start'} my-2"><div class="max-w-[80%] bg-primary-fixed/20 border border-primary/20 rounded-2xl p-4"><p class="text-xs font-semibold text-primary mb-2 flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">biotech</span>AI Diagnosis</p><p class="text-sm font-bold text-on-surface">${ai.disease_name || '-'}</p><p class="text-xs text-on-surface-variant mt-1">Confidence: ${(ai.confidence || 0).toFixed(0)}%</p>${severityBadge(ai.severity)}</div></div>`;
  }

  let imageHtml = '';
  if (messageType === 'image') {
    if (message.imageUrl) {
      imageHtml = `<img src="${message.imageUrl}" class="rounded-lg mb-1 block" style="max-width:260px;max-height:280px;min-width:60px;min-height:60px;object-fit:cover;" onerror="this.style.display='none';this.nextSibling&&(this.nextSibling.style.display='flex')"/>
        <div class="hidden items-center gap-2 text-xs opacity-60 py-1"><span class="material-symbols-outlined text-[16px]">broken_image</span><span>Image unavailable</span></div>`;
    } else {
      imageHtml = `<div class="flex items-center gap-2 text-xs opacity-60 py-1">
        <span class="material-symbols-outlined text-[16px]">broken_image</span>
        <span>Image unavailable</span>
      </div>`;
    }
  }

  return `<div data-message-id="${messageId}" class="flex items-end gap-2 ${isMe ? 'flex-row-reverse' : ''} max-w-[80%] ${isMe ? 'ml-auto' : ''}">
    ${!isMe ? `<div class="w-7 h-7 rounded-full bg-primary-container/20 text-primary flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden border border-surface-variant">
      ${_activeExpertAvatar
        ? `<img src="${escapeHtml(_activeExpertAvatar)}" alt="${escapeHtml(_activeExpertName)}" class="w-full h-full object-cover" />`
        : escapeHtml((_activeExpertName || 'Expert').charAt(0).toUpperCase())}
    </div>` : ''}
    <div class="flex flex-col gap-1 ${isMe ? 'items-end' : 'items-start'}">
      <span class="text-xs text-on-surface-variant px-1">${formatDateTime(timestamp)}</span>
      <div class="px-4 py-2.5 rounded-2xl ${isMe ? 'bg-primary text-on-primary rounded-br-sm' : 'bg-surface-container-high text-on-surface rounded-bl-sm'}">
        ${imageHtml}
        ${message.text ? `<p class="text-sm">${escapeHtml(message.text)}</p>` : ''}
      </div>
    </div>
  </div>`;
}

function appendMsg(rawMessage) {
  const welcome = document.getElementById('chat-welcome');
  if (welcome) welcome.style.display = 'none';

  const area = document.getElementById('messages-area') || document.querySelector('[data-messages-area]');
  if (!area) return;

  const target = document.getElementById('messages-container') || area;
  const message = normalizeMessage(rawMessage);
  const conversationId = getConversationId(message);
  const messageId = getMessageId(message);

  if (_activeChatId && conversationId && conversationId !== String(_activeChatId)) return;
  if (messageId && _renderedMessageIds.has(messageId)) return;

  target.querySelector('[data-empty-state="true"]')?.remove();

  const holder = document.createElement('div');
  holder.innerHTML = msgEl(message);
  if (holder.firstElementChild) {
    target.appendChild(holder.firstElementChild);
    if (messageId) _renderedMessageIds.add(messageId);
  }

  scrollBot(area);
}

function setupInput() {
  const inp =
    document.getElementById('message-input') ||
    document.querySelector('[data-message-input], input[placeholder*="essage"], textarea[placeholder*="essage"]');

  const btn =
    document.getElementById('send-btn') ||
    document.querySelector('[data-send-btn]');

  if (!inp) return;

  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(inp);
    }
  });

  btn?.addEventListener('click', () => send(inp));

  const fi = document.createElement('input');
  fi.type = 'file';
  fi.accept = 'image/*';
  fi.style.display = 'none';
  document.body.appendChild(fi);

  document.querySelectorAll('[data-attach]').forEach((b) => {
    b.addEventListener('click', () => fi.click());
  });

  document.querySelectorAll('button').forEach((b) => {
    const ic = b.querySelector('.material-symbols-outlined');
    if (ic && ['attach_file', 'image'].includes(ic.textContent.trim())) {
      b.addEventListener('click', () => fi.click());
    }
  });

  fi.addEventListener('change', async () => {
    if (!_activeChatId || !fi.files[0]) return;

    const file = fi.files[0];
    console.log(`[FarmerChat] sending image message - conversationId=${_activeChatId}`);

    const fd = new FormData();
    fd.append('image', file);
    fd.append('messageType', 'image');
    fd.append('content_type', 'image');

    try {
      const res = await api.post(`/chats/${_activeChatId}/messages`, fd);
      console.log(`[FarmerChat] message saved successfully - conversationId=${_activeChatId}, messageId=${res.data?.id}`);
      appendMsg(res.data);
    } catch (e) {
      console.error('[FarmerChat] upload error:', e);
      showToast('Failed to send image', 'error');
    }

    fi.value = '';
  });
}

async function send(inp) {
  const text = inp.value.trim();
  if (!text || !_activeChatId) return;

  console.log(`[FarmerChat] sending text message - conversationId=${_activeChatId}`);
  inp.value = '';

  if (_socket?.connected) {
    _socket.emit('message:send', { conversationId: _activeChatId, messageType: 'text', text }, (ack) => {
      if (!ack?.success) {
        console.error(`[FarmerChat] failed to save message - conversationId=${_activeChatId}`, ack?.error);
        showToast(ack?.error || 'Send failed', 'error');
        return;
      }
      console.log(`[FarmerChat] message saved successfully - conversationId=${ack.message?.conversationId || _activeChatId}, messageId=${ack.message?.id}`);
      appendMsg(ack.message);
    });
    return;
  }

  try {
    const res = await api.post(`/chats/${_activeChatId}/messages`, { messageType: 'text', content_type: 'text', text });
    console.log(`[FarmerChat] message saved successfully - conversationId=${_activeChatId}, messageId=${res.data?.id}`);
    appendMsg(res.data);
  } catch (e) {
    showToast('Send failed', 'error');
  }
}

function connectSocket() {
  if (typeof io === 'undefined') {
    console.warn('[FarmerChat] Socket.IO CDN not loaded');
    return;
  }
  _socket = io('http://localhost:5000', { auth: { token: Auth.getToken() } });
  _socket.on('connect', () => {
    if (_activeChatId) _socket.emit('chat:join', { conversationId: _activeChatId });
  });
  _socket.on('message:new', (message) => appendMsg(message));
  _socket.on('chat:resolved', ({ chatId }) => {
    if (chatId === _activeChatId) {
      showToast('Case resolved by expert', 'info');
      loadChats();
    }
  });
  _socket.on('notification:new', (n) => showToast(n.title || 'New notification', 'info'));
  _socket.on('error', ({ message }) => console.error('[FarmerChat][Socket]', message));
}

function scrollBot(el) {
  setTimeout(() => {
    el.scrollTop = el.scrollHeight;
  }, 50);
}

function normalizeMessage(message) {
  if (!message) return null;
  return {
    ...message,
    id: message.id || message._id || '',
    _id: message._id || message.id || '',
    conversationId: String(message.conversationId || message.chat_id || ''),
    senderId: message.senderId || message.sender_id || '',
    senderRole: message.senderRole || message.sender_role || '',
    messageType: message.messageType || message.content_type || 'text',
    imageUrl: message.imageUrl || message.image || null,
    createdAt: message.createdAt || message.created_at || message.sent_at || null,
    sent_at: message.sent_at || message.createdAt || message.created_at || null,
  };
}

function getMessageId(message) {
  return String(message?.id || message?._id || '');
}

function getConversationId(message) {
  return String(message?.conversationId || message?.chat_id || '');
}
