// expertschat.js (farmer side)
let _socket = null;
let _activeChatId = null;
let _chats = [];
let _allChats = [];
let _chatSearchTerm = '';
let _renderedMessageIds = new Set();
let _activeExpertName = 'Expert';
let _activeExpertAvatar = null;
let _selectDeleteMode = false;
let _selectedChatIds = new Set();

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth('farmer')) return;
  populateSidebarUser();
  setupLogout(_socket);
  await loadChats();
  setupChatSearch();
  setupSelectDeleteAction();
  setupDeleteChatAction();
  connectSocket();
  setupInput();
  setupQuickReplies();
});

async function loadChats() {
  try {
    _allChats = ((await api.get('/chats?limit=50')).data || []).map((chat) => ({
      ...chat,
      unreadCount: Number(chat.unreadCount || 0),
    }));
    _chats = [..._allChats];
    renderChatList();
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
  const unreadCount = Number(c.unreadCount || 0);
  const chatId = String(c._id || '');
  const isChecked = _selectedChatIds.has(chatId);
  const selectBox = _selectDeleteMode
    ? `<button type="button" data-select-checkbox="1" data-chat-id="${escapeHtml(chatId)}" class="shrink-0 w-7 h-7 rounded-md border border-white/15 bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-center">
        <span class="material-symbols-outlined text-[18px] leading-none text-white">${isChecked ? 'check_box' : 'check_box_outline_blank'}</span>
      </button>`
    : '';
  return `<div data-open-chat="${c._id}" class="relative flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-[#2a3b43] ${_activeChatId === c._id ? 'bg-[#1d473f] shadow-[inset_3px_0_0_rgba(52,211,153,0.95)]' : ''}">
    ${_activeChatId === c._id ? '' : '<div class="absolute bottom-0 left-[6.75rem] right-8 h-px bg-[#1b2a33] shadow-[0_-1px_0_rgba(8,14,18,0.65)]"></div>'}
    ${selectBox}
    <div class="relative shrink-0">
      <div class="w-12 h-12 rounded-full bg-white/10 text-white flex items-center justify-center font-bold text-sm border border-white/10 overflow-hidden">
        ${avatar
          ? `<img src="${escapeHtml(avatar)}" alt="${escapeHtml(expertName)}" class="w-full h-full object-cover" />`
          : escapeHtml(initials)}
      </div>
      ${!c.is_resolved ? `<div class="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 rounded-full border-2 border-[#23313a]"></div>` : ''}
    </div>
    <div class="flex-1 min-w-0">
      <div class="grid grid-cols-[minmax(0,1fr)_auto] grid-rows-2 gap-x-2 gap-y-0.5">
        <p class="font-semibold text-white text-[15px] truncate row-start-1 col-start-1">${escapeHtml(expertName)}</p>
        <span class="text-[12px] text-emerald-300 shrink-0 row-start-1 col-start-2 text-right">${c.last_message_at ? timeAgo(c.last_message_at) : ''}</span>
        <p class="text-[13px] text-slate-300 truncate row-start-2 col-start-1">${c.is_resolved ? 'Case Resolved' : 'Not resolved yet'}</p>
        <span class="inline-flex items-center justify-center w-6 h-6 bg-emerald-400 text-[#102026] rounded-full text-[10px] font-bold leading-none row-start-2 col-start-2 ${unreadCount > 0 ? '' : 'opacity-0'}">${Math.min(Math.max(unreadCount, 0), 99)}</span>
      </div>
    </div>
  </div>`;
}

async function openChat(chatId) {
  _activeChatId = chatId;

  document.querySelectorAll('[data-open-chat]').forEach((el) => {
    el.classList.toggle('bg-[#1d473f]', el.dataset.openChat === chatId);
    el.classList.toggle('shadow-[inset_3px_0_0_rgba(52,211,153,0.95)]', el.dataset.openChat === chatId);
  });
  updateChatUnreadState(chatId, 0);
  renderChatList();

  const chatHeader = document.getElementById('chat-header');
  if (chatHeader) chatHeader.classList.remove('hidden');

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
    emitReadReceipt(chatId);

    document.querySelectorAll('[data-chat-header-name]').forEach((el) => {
      el.textContent = expertName;
    });
    document.querySelectorAll('[data-chat-header-sub]').forEach((el) => {
      el.textContent = chat.is_resolved ? 'Case Resolved' : 'Not resolved yet';
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

    // Opening the chat marks notifications/messages as read on the backend,
    // so refresh the sidebar badges.
    if (typeof setupFarmerNotificationBadge === 'function') setupFarmerNotificationBadge().catch?.(() => null);
    if (typeof setupFarmerChatBadge === 'function') setupFarmerChatBadge().catch?.(() => null);
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
    list.innerHTML = `<div class="p-4 text-sm text-slate-300">No experts match your search.</div>`;
    return;
  }

  list.innerHTML = _chats.map(chatItem).join('');
  bindChatListInteractions(list);
}

function bindChatListInteractions(list) {
  if (!list || list.dataset._chatListBound === '1') return;
  list.addEventListener('click', (ev) => {
    const checkbox = ev.target.closest('[data-select-checkbox]');
    if (checkbox) {
      ev.preventDefault();
      ev.stopPropagation();
      toggleChatSelection(checkbox.dataset.chatId);
      return;
    }

    const item = ev.target.closest('[data-open-chat]');
    if (!item) return;

    const chatId = item.dataset.openChat;
    if (_selectDeleteMode) {
      toggleChatSelection(chatId);
      return;
    }
    openChat(chatId);
  });
  list.dataset._chatListBound = '1';
}

function toggleChatSelection(chatId) {
  if (!chatId) return;
  const id = String(chatId);
  if (_selectedChatIds.has(id)) _selectedChatIds.delete(id);
  else _selectedChatIds.add(id);
  renderChatList();
  updateSelectDeleteButtonState();
}

function setupSelectDeleteAction() {
  const btn = document.querySelector('[data-select-delete]');
  if (!btn) return;

  const setMode = (on) => {
    _selectDeleteMode = !!on;
    if (_selectDeleteMode) {
      _selectedChatIds = new Set();
      btn.innerHTML = '<span class="material-symbols-outlined text-[18px] leading-none">delete</span>';
      btn.setAttribute('title', 'Delete selected chats');
    } else {
      _selectedChatIds = new Set();
      btn.textContent = 'Select';
      btn.removeAttribute('title');
    }
    updateSelectDeleteButtonState();
    renderChatList();
  };

  btn.addEventListener('click', async () => {
    if (!_selectDeleteMode) {
      setMode(true);
      return;
    }
    // In select mode: act as "delete" (or exit if nothing selected).
    if (!_selectedChatIds.size) {
      setMode(false);
      return;
    }
    const ok = window.confirm(`Delete ${_selectedChatIds.size} chat(s) from your list?`);
    if (!ok) return;
    await deleteChatsFromList(Array.from(_selectedChatIds));
    setMode(false);
  });
  btn._setSelectDeleteMode = setMode;
}

function updateSelectDeleteButtonState() {
  const btn = document.querySelector('[data-select-delete]');
  if (!btn) return;
  if (!_selectDeleteMode) return;
  btn.classList.toggle('opacity-60', !_selectedChatIds.size);
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
  const isRead = Boolean(message.is_read ?? message.isRead);

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

  const bubbleMeta = isMe
    ? `<span class="inline-flex items-center gap-1 pl-2 text-[10px] leading-none whitespace-nowrap ${isRead ? 'text-cyan-200' : 'text-emerald-100/80'}">
        <span>${formatTime(timestamp)}</span>
        <span data-read-state data-read="${isRead ? '1' : '0'}" class="inline-flex items-center leading-none">
          <span class="material-symbols-outlined text-[13px] -mr-1">${isRead ? 'done_all' : 'done'}</span>
        </span>
      </span>`
    : `<span class="inline-flex items-center pl-2 text-[10px] text-slate-300 whitespace-nowrap">${formatTime(timestamp)}</span>`;

  return `<div data-message-id="${messageId}" data-message-owner="${isMe ? 'me' : 'other'}" class="flex items-end gap-2 ${isMe ? 'flex-row-reverse' : ''} max-w-[80%] ${isMe ? 'ml-auto' : ''} mb-1">
    ${!isMe ? `<div class="w-7 h-7 rounded-full bg-primary-container/20 text-primary flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden border border-surface-variant">
      ${_activeExpertAvatar
        ? `<img src="${escapeHtml(_activeExpertAvatar)}" alt="${escapeHtml(_activeExpertName)}" class="w-full h-full object-cover" />`
        : escapeHtml((_activeExpertName || 'Expert').charAt(0).toUpperCase())}
    </div>` : ''}
    <div class="flex flex-col gap-1 ${isMe ? 'items-end' : 'items-start'}">
      <div class="px-3 py-2 rounded-[10px] shadow-sm ${isMe ? 'bg-[#0c8f78] text-white rounded-br-[3px] border border-emerald-300/10' : 'bg-[#2f3c46] text-white rounded-bl-[3px] border border-white/5'}">
        ${imageHtml}
        ${message.text ? `<div class="flex items-end justify-end gap-1.5"><p class="text-[13px] leading-relaxed tracking-[0.01em] text-right">${escapeHtml(message.text)}</p>${bubbleMeta}</div>` : bubbleMeta}
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

  if (message.senderRole !== 'farmer') emitReadReceipt(_activeChatId);
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

function setupQuickReplies() {
  const defaultReplies = [
    'Is the disease diagnosis correct?',
    'What is the appropriate treatment?',
    'How should I use it?',
  ];

  const inp =
    document.getElementById('message-input') ||
    document.querySelector('[data-message-input], input[placeholder*="essage"], textarea[placeholder*="essage"]');

  const sendBtn =
    document.getElementById('send-btn') ||
    document.querySelector('[data-send-btn]');

  if (!inp) return;

  // Hide the old quick-replies row (the 3 pill buttons) if it exists.
  const oldQuickRepliesRow = document.querySelector('div.flex.gap-2.mb-3, .flex.gap-2.mb-3');
  if (oldQuickRepliesRow) {
    const oldTexts = Array.from(oldQuickRepliesRow.querySelectorAll('button'))
      .map((b) => b.textContent.trim())
      .filter(Boolean);
    const looksLikeQuickReplies = oldTexts.some((t) => defaultReplies.includes(t));
    if (looksLikeQuickReplies) oldQuickRepliesRow.classList.add('hidden');
  }

  // Insert a 3-dot menu near the message input.
  const host =
    inp.closest('.input-wrap') ||
    (sendBtn && sendBtn.parentElement) ||
    inp.closest('form') ||
    inp.parentElement;
  if (!host) return;

  // Avoid duplicating if setup runs twice.
  if (host.querySelector('[data-quick-replies-menu="1"]')) return;

  const wrapper = document.createElement('div');
  wrapper.dataset.quickRepliesMenu = '1';
  wrapper.className = 'relative inline-flex items-center mr-1';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('aria-haspopup', 'menu');
  btn.setAttribute('aria-expanded', 'false');
  btn.className =
    'inline-flex items-center justify-center w-10 h-10 rounded-full bg-transparent hover:bg-black/5 active:bg-black/10 border border-black/10 text-slate-900 transition-colors';
  btn.innerHTML = '<span class="material-symbols-outlined text-[22px] leading-none">more_vert</span>';

  const menu = document.createElement('div');
  menu.setAttribute('role', 'menu');
  menu.className =
    'absolute bottom-[calc(100%+10px)] left-0 z-50 min-w-[220px] rounded-xl border border-black/10 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.20)] p-1 hidden';

  defaultReplies.forEach((text) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.setAttribute('role', 'menuitem');
    item.className =
      'w-full text-left px-3 py-2 rounded-lg text-[13px] text-slate-900 hover:bg-black/5 active:bg-black/10 transition-colors';
    item.textContent = text;
    item.addEventListener('click', () => {
      menu.classList.add('hidden');
      btn.setAttribute('aria-expanded', 'false');
      if (!_activeChatId) return;
      inp.value = text;
      send(inp);
    });
    menu.appendChild(item);
  });

  const closeMenu = () => {
    if (menu.classList.contains('hidden')) return;
    menu.classList.add('hidden');
    btn.setAttribute('aria-expanded', 'false');
  };

  const toggleMenu = () => {
    const willOpen = menu.classList.contains('hidden');
    if (willOpen) {
      menu.classList.remove('hidden');
      btn.setAttribute('aria-expanded', 'true');
      return;
    }
    closeMenu();
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMenu();
  });

  // Close when clicking outside or pressing Escape.
  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target)) closeMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });

  wrapper.appendChild(btn);
  wrapper.appendChild(menu);

  // Place it at the far-left of the input row (before attach/image buttons).
  host.insertBefore(wrapper, host.firstChild);
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
  _socket.on('message:new', (message) => {
    const normalized = normalizeMessage(message);
    const conversationId = getConversationId(normalized);
    const isActive = String(conversationId || '') === String(_activeChatId || '');
    if (isActive) {
      appendMsg(normalized);
      return;
    }
    incrementChatUnread(conversationId);
    renderChatList();
    if (typeof setupFarmerChatBadge === 'function') setupFarmerChatBadge().catch?.(() => null);
    if (typeof playNotificationTone === 'function') playNotificationTone();
  });
  _socket.on('message:read', ({ chatId }) => {
    if (String(chatId || '') !== String(_activeChatId || '')) return;
    markOutgoingMessagesRead();
  });
  _socket.on('chat:resolved', ({ chatId }) => {
    if (chatId === _activeChatId) {
      showToast('Case resolved by expert', 'info');
      loadChats();
    }
  });
  _socket.on('notification:new', (n) => {
    if (typeof playNotificationTone === 'function') playNotificationTone();
    showToast(n.title || 'New notification', 'info');
    if (typeof setupFarmerNotificationBadge === 'function') setupFarmerNotificationBadge().catch?.(() => null);
  });
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
    is_read: Boolean(message.is_read ?? message.isRead),
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

function emitReadReceipt(chatId) {
  if (!_socket?.connected || !chatId) return;
  _socket.emit('message:read', { chatId });
}

function markOutgoingMessagesRead() {
  document.querySelectorAll('[data-message-owner="me"] [data-read-state]').forEach((el) => {
    if (el.dataset.read === '1') return;
    el.dataset.read = '1';
    el.className = 'inline-flex items-center leading-none';
    el.innerHTML = '<span class="material-symbols-outlined text-[13px] -mr-1">done_all</span>';
  });
}

function updateChatUnreadState(chatId, unreadCount) {
  if (!chatId) return;
  const nextCount = Math.max(0, Number(unreadCount || 0));
  _allChats = _allChats.map((chat) => String(chat._id) === String(chatId) ? { ...chat, unreadCount: nextCount } : chat);
  _chats = _chats.map((chat) => String(chat._id) === String(chatId) ? { ...chat, unreadCount: nextCount } : chat);
}

function incrementChatUnread(chatId) {
  if (!chatId) return;
  let found = false;
  _allChats = _allChats.map((chat) => {
    if (String(chat._id) !== String(chatId)) return chat;
    found = true;
    return { ...chat, unreadCount: Number(chat.unreadCount || 0) + 1 };
  });
  if (!found) return;
  _chats = _chats.map((chat) => String(chat._id) === String(chatId) ? { ...chat, unreadCount: Number(chat.unreadCount || 0) + 1 } : chat);
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function setupDeleteChatAction() {
  const btn = document.querySelector('[data-delete-chat]');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (!_activeChatId) {
      showToast('No active chat selected', 'info');
      return;
    }

    const ok = window.confirm('Delete this chat from your list?');
    if (!ok) return;

    await deleteChatsFromList([String(_activeChatId)]);
  });
}

function selectAndDeleteChat(chatId) {
  if (!chatId) return;
  const ok = window.confirm('Delete this chat from your list?');
  if (!ok) return;
  deleteChatsFromList([String(chatId)]);
  const selectBtn = document.querySelector('[data-select-delete]');
  if (selectBtn && typeof selectBtn._setSelectDeleteMode === 'function') {
    selectBtn._setSelectDeleteMode(false);
  } else {
    _selectDeleteMode = false;
    if (selectBtn) selectBtn.textContent = 'Select';
  }
}

async function deleteChatsFromList(chatIds) {
  const ids = (chatIds || []).map(String).filter(Boolean);
  if (!ids.length) return;
  const results = await Promise.allSettled(ids.map((id) => api.delete(`/chats/${id}`)));
  const succeeded = [];
  const failed = [];
  results.forEach((r, idx) => {
    if (r.status === 'fulfilled') succeeded.push(ids[idx]);
    else failed.push(ids[idx]);
  });

  if (!succeeded.length) {
    showToast('Failed to delete chat', 'error');
    return;
  }

  const succeededSet = new Set(succeeded);

  _allChats = _allChats.filter((c) => !succeededSet.has(String(c._id)));
  _chats = _chats.filter((c) => !succeededSet.has(String(c._id)));

  if (_socket?.connected) {
    succeeded.forEach((id) => _socket.emit('chat:leave', { conversationId: id }));
  }

  if (_activeChatId && succeededSet.has(String(_activeChatId))) {
    _activeChatId = null;
    _renderedMessageIds = new Set();
    _activeExpertName = 'Expert';
    _activeExpertAvatar = null;
  }

  renderChatList();

  if (!_chats.length) {
    const area = document.getElementById('messages-area') || document.querySelector('[data-messages-area]');
    if (area) {
      area.innerHTML = `
        <div id="chat-welcome" class="flex flex-col items-center justify-center h-full gap-4 text-center py-16">
          <div class="w-20 h-20 rounded-full bg-green-50 border-2 border-green-100 flex items-center justify-center">
            <span class="material-symbols-outlined text-[38px] text-green-300">chat_bubble</span>
          </div>
          <div>
            <p class="font-semibold text-slate-600 text-base">No conversations</p>
            <p class="text-sm text-slate-400 mt-1 max-w-xs leading-relaxed">This chat was removed from your list.</p>
          </div>
        </div>`;
    }
    document.querySelectorAll('[data-chat-header-name]').forEach((el) => { el.textContent = 'Expert Chat'; });
    document.querySelectorAll('[data-chat-header-sub]').forEach((el) => { el.textContent = 'No active case'; });
    document.querySelectorAll('[data-chat-header-avatar]').forEach((el) => {
      el.removeAttribute('src');
      el.classList.add('hidden');
    });
    document.querySelectorAll('[data-chat-header-avatar-fallback]').forEach((el) => {
      el.textContent = 'E';
      el.classList.remove('hidden');
    });
  }

  showToast(succeeded.length > 1 ? 'Chats deleted' : 'Chat deleted', 'success');
  if (failed.length) showToast(`${failed.length} chat(s) failed to delete`, 'error');
}
