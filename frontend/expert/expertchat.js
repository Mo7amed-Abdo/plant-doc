// expertchat.js — Expert Chat page
let _socket = null;
let _activeChatId = null;
let _activeRequestId = null;
let _activeChat = null;
let _chats = [];
let _chatFilter = 'all';
let _renderedMessageIds = new Set();

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth('expert')) return;
  populateSidebarUser();
  setupLogout(null);
  bindChatFilters();
  await loadChats();
  connectSocket();
  setupInput();
});

async function loadChats() {
  const list = document.querySelector('[data-chat-list], aside .flex-1.overflow-y-auto, .w-80 .flex-1');
  const requestedChatId = new URLSearchParams(window.location.search).get('chatId');
  try {
    const chats = (await api.get('/chats?limit=50')).data || [];
    const unreadConversationIds = await loadUnreadConversationIds();
    _chats = chats.map((chat) => ({
      ...chat,
      hasUnreadMessage: unreadConversationIds.has(String(chat._id)),
    }));

    const visibleChats = getVisibleChats();
    if (!list) {
      if (_chats.length) openChat(requestedChatId || _chats[0]._id);
      return;
    }
    if (!visibleChats.length) {
      list.innerHTML = `<div class="p-6 text-center"><span class="material-symbols-outlined text-4xl text-on-surface-variant/40 block mb-2">forum</span><p class="text-sm text-on-surface-variant">No active chats</p><p class="text-xs text-on-surface-variant/70 mt-1">Pick up a case from Pending Cases</p></div>`;
      return;
    }
    list.innerHTML = visibleChats.map(chatItem).join('');
    list.querySelectorAll('[data-open-chat]').forEach((el) => el.addEventListener('click', () => openChat(el.dataset.openChat)));
    const initialChat = visibleChats.find((chat) => String(chat._id) === String(requestedChatId))?._id
      || visibleChats[0]._id;
    openChat(initialChat);
  } catch (e) {
    if (list) list.innerHTML = `<div class="p-4 text-error text-sm">${e.message}</div>`;
  }
}

function chatItem(c) {
  const farmer = c.farmer_id || {};
  const farmerU = farmer.user_id || {};
  const req = c.treatment_request_id || {};
  const name = farmerU.full_name || 'Farmer';
  const initials = name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2) || 'F';
  const unread = Boolean(c.hasUnreadMessage);
  const avatar = c.farmerAvatar || farmerU.avatar_url || farmerU.avatarUrl || null;
  const cropName = c.caseDetails?.cropName || req.diagnosis_id?.crop_type || 'Unknown crop';

  return `<div data-open-chat="${c._id}" class="flex items-start gap-3 p-4 cursor-pointer rounded-xl transition-colors hover:bg-surface-container-low ${_activeChatId === c._id ? 'border-l-2 border-primary bg-surface-container-low' : ''}">
    <div class="relative shrink-0">
      ${avatar
        ? `<img src="${avatar}" alt="${escapeHtml(name)}" class="w-11 h-11 rounded-full object-cover border border-surface-variant" />`
        : `<div class="w-11 h-11 rounded-full bg-secondary-container/30 text-secondary flex items-center justify-center font-bold text-sm border border-surface-variant">${initials}</div>`}
      ${unread ? `<div class="absolute bottom-0 right-0 w-3 h-3 bg-primary rounded-full border-2 border-surface-container-lowest"></div>` : ''}
    </div>
    <div class="flex-1 min-w-0">
      <div class="flex items-baseline justify-between gap-2 mb-0.5">
        <p class="font-semibold text-on-surface text-sm truncate">${escapeHtml(name)}</p>
        ${c.last_message_at ? `<span class="text-xs text-on-surface-variant shrink-0">${timeAgo(c.last_message_at)}</span>` : ''}
      </div>
      <p class="text-xs text-on-surface-variant truncate">${unread ? 'Unread farmer message' : (c.is_resolved ? 'Resolved' : escapeHtml(cropName))}</p>
    </div>
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
    _activeChat = chat;
    _activeRequestId = chat.treatment_request_id?._id || chat.treatment_request_id;

    console.log(`[ExpertChat] conversationId exists: ${chatId}`);
    console.log(`[ExpertChat] messages fetched successfully after refresh - conversationId=${chatId}, count=${msgs.length}, total=${msgsRes.meta?.total ?? msgs.length}`);

    if (area) {
      renderMsgs(msgs, area);
      scrollBot(area);
    }
    if (_socket?.connected) _socket.emit('chat:join', { conversationId: chatId });

    renderChatHeader(chat);
    renderCaseDetails(chat);

    updateActionBtns(chat);
  } catch (e) {
    if (area) area.innerHTML = `<div class="p-4 text-error text-sm text-center">${e.message}</div>`;
  }
}

function updateActionBtns(chat) {
  const resolveBtn = document.querySelector('[data-resolve-btn]');
  if (!resolveBtn) return;

  if (chat.is_resolved) {
    resolveBtn.disabled = true;
    resolveBtn.innerHTML = '<span class="material-symbols-outlined text-lg">check_circle</span> Resolved';
    return;
  }

  const fresh = resolveBtn.cloneNode(true);
  fresh.disabled = false;
  fresh.innerHTML = '<span class="material-symbols-outlined text-lg">check_circle</span> Resolve';
  resolveBtn.parentNode.replaceChild(fresh, resolveBtn);
  fresh.addEventListener('click', () => openReviewModal());
}

function renderMsgs(msgs, container) {
  const normalizedMsgs = msgs.map(normalizeMessage).filter(Boolean);
  _renderedMessageIds = new Set();

  if (!normalizedMsgs.length) {
    container.innerHTML = `<div data-empty-state="true" class="flex justify-center py-8"><div class="bg-surface-container-high text-on-surface-variant text-xs py-1.5 px-4 rounded-full">No messages yet</div></div>`;
    return;
  }

  normalizedMsgs.forEach((m) => {
    const messageId = getMessageId(m);
    if (messageId) _renderedMessageIds.add(messageId);
  });

  container.innerHTML = normalizedMsgs.map((m) => msgEl(m)).join('');
}

function msgEl(message) {
  const senderRole = message.senderRole;
  const messageType = message.messageType;
  const messageId = escapeHtml(getMessageId(message));
  const timestamp = message.createdAt || message.sent_at;
  const isMe = senderRole === 'expert';
  const isSys = senderRole === 'system';

  if (isSys) {
    return `<div data-message-id="${messageId}" class="flex justify-center my-2"><div class="bg-surface-container-high text-on-surface-variant text-xs py-1 px-3 rounded-full">${message.text || 'System'}</div></div>`;
  }

  if (messageType === 'ai_analysis' && message.ai_analysis) {
    const ai = message.ai_analysis;
    return `<div data-message-id="${messageId}" class="flex ${isMe ? 'justify-end' : 'justify-start'} my-2"><div class="max-w-[80%] bg-primary-fixed/20 border border-primary/20 rounded-2xl p-4"><p class="text-xs font-semibold text-primary mb-2 flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">biotech</span>AI Diagnosis</p><p class="text-sm font-bold">${ai.disease_name || '-'}</p>${severityBadge(ai.severity)}</div></div>`;
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
    ${!isMe ? renderFarmerMessageAvatar() : ''}
    <div class="flex flex-col gap-1 ${isMe ? 'items-end' : 'items-start'}">
      <span class="text-xs text-on-surface-variant px-1">${formatDateTime(timestamp)}</span>
      <div class="px-4 py-2.5 rounded-2xl ${isMe ? 'bg-green-700 text-white rounded-br-sm' : 'bg-surface-container-high text-on-surface rounded-bl-sm'}">
        ${imageHtml}
        ${message.text ? `<p class="text-sm">${escapeHtml(message.text)}</p>` : ''}
      </div>
    </div>
  </div>`;
}

function appendMsg(rawMessage) {
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

function bindChatFilters() {
  document.querySelectorAll('[data-chat-filter]').forEach((button) => {
    button.addEventListener('click', async () => {
      _chatFilter = button.dataset.chatFilter || 'all';
      document.querySelectorAll('[data-chat-filter]').forEach((item) => {
        const active = item === button;
        item.classList.toggle('bg-green-700', active);
        item.classList.toggle('text-white', active);
        item.classList.toggle('font-semibold', active);
        item.classList.toggle('bg-surface-container', !active);
        item.classList.toggle('text-on-surface-variant', !active);
        item.classList.toggle('font-medium', !active);
      });
      await loadChats();
    });
  });
}

function getVisibleChats() {
  if (_chatFilter === 'unread') {
    return _chats.filter((chat) => chat.hasUnreadMessage);
  }
  return _chats;
}

async function loadUnreadConversationIds() {
  try {
    const expertId = typeof getExpertSidebarProfileId === 'function'
      ? await getExpertSidebarProfileId()
      : await getExpertProfileIdForChat();
    if (!expertId) return new Set();

    const res = await api.get(`/notifications/expert/${expertId}`);
    const notifications = Array.isArray(res.data) ? res.data : [];
    return new Set(
      notifications
        .filter((item) => !item.is_read && item.type === 'unread_chat_message')
        .map((item) => String(item.relatedConversationId || item.related_conversation_id || item.related_id || ''))
        .filter(Boolean)
    );
  } catch (error) {
    console.error('[ExpertChat] failed to load unread conversation ids:', error);
    return new Set();
  }
}

async function getExpertProfileIdForChat() {
  const cachedProfile = Auth.getProfile();
  if (cachedProfile?.id) return cachedProfile.id;

  try {
    const profile = (await api.get('/expert/profile')).data;
    if (profile) localStorage.setItem('plantdoc_profile', JSON.stringify(profile));
    return profile?.id || null;
  } catch (_) {
    return null;
  }
}

function renderChatHeader(chat) {
  const farmer = chat.farmer_id || {};
  const farmerUser = farmer.user_id || {};
  const caseDetails = chat.caseDetails || {};
  const farmerName = chat.farmerName || farmerUser.full_name || 'Farmer';
  const avatar = chat.farmerAvatar || farmerUser.avatar_url || farmerUser.avatarUrl || null;
  const cropName = caseDetails.cropName || chat.treatment_request_id?.diagnosis_id?.crop_type || 'Unknown crop';
  const badgeLabel = chat.is_resolved ? 'Resolved' : (caseDetails.priority || chat.treatment_request_id?.priority || '').toUpperCase();

  document.querySelectorAll('[data-chat-header-name-text]').forEach((el) => {
    el.textContent = farmerName;
    el.classList.remove('h-5', 'w-28', 'rounded', 'bg-surface-variant', 'animate-pulse', 'text-transparent', 'inline-block');
  });

  document.querySelectorAll('[data-chat-header-sub-text]').forEach((el) => {
    el.textContent = chat.is_resolved ? 'Conversation resolved' : `${cropName} crop`;
    el.classList.remove('h-4', 'w-24', 'rounded', 'bg-surface-variant', 'animate-pulse', 'text-transparent', 'inline-block');
  });

  document.querySelectorAll('[data-chat-header-avatar-shell]').forEach((el) => {
    el.remove();
  });

  document.querySelectorAll('[data-chat-header-avatar]').forEach((el) => {
    if (avatar) {
      el.src = avatar;
    } else {
      el.src = '';
    }
    el.classList.remove('hidden');
  });

  document.querySelectorAll('[data-chat-header-badge]').forEach((el) => {
    if (!badgeLabel) {
      el.classList.add('hidden');
      el.textContent = '';
      return;
    }

    el.textContent = badgeLabel;
    el.classList.remove('hidden');
    el.className = chat.is_resolved
      ? 'px-2 py-0.5 rounded text-xs font-semibold bg-secondary-container text-on-secondary-container'
      : 'px-2 py-0.5 rounded text-xs font-semibold bg-error-container text-on-error-container';
  });
}

function renderCaseDetails(chat) {
  const container = document.querySelector('[data-case-details]');
  if (!container) return;

  const details = chat.caseDetails || {};
  const image = details.imageUrl
    ? `<img alt="Case image" class="w-full h-40 object-cover rounded-xl mb-4" src="${details.imageUrl}" onerror="this.style.display='none';this.nextElementSibling.classList.remove('hidden');"/>`
    : '';
  const imageFallback = `<div class="${details.imageUrl ? 'hidden' : ''} w-full h-40 rounded-xl mb-4 bg-surface-container flex items-center justify-center text-on-surface-variant"><span class="material-symbols-outlined text-[42px]">image</span></div>`;
  const confidence = Number(details.confidence || 0);
  const severity = details.severity || 'unknown';
  const recommendation = details.recommendation || 'No recommendation available.';
  const symptoms = Array.isArray(details.symptoms) ? details.symptoms.filter(Boolean) : [];
  const diseaseName = details.diseaseName || 'Unknown disease';
  const cropName = details.cropName || 'Unknown crop';
  const statusLabel = (details.status || 'validated').replace(/_/g, ' ');

  container.innerHTML = `
    ${image}
    ${imageFallback}
    <div class="space-y-4">
      <div class="bg-surface-container p-4 rounded-xl">
        <h4 class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Case Summary</h4>
        <div class="flex justify-between items-center mb-1 gap-3">
          <span class="text-sm font-bold text-on-surface">${escapeHtml(diseaseName)}</span>
          <span class="text-xs font-semibold text-primary">${confidence}% Match</span>
        </div>
        <div class="w-full bg-surface-variant rounded-full h-1.5 mb-3">
          <div class="bg-green-700 h-1.5 rounded-full" style="width: ${Math.max(4, Math.min(confidence, 100))}%"></div>
        </div>
        <div class="flex flex-wrap items-center gap-2 text-xs">
          <span class="text-on-surface-variant">Crop:</span>
          <span class="font-semibold text-on-surface">${escapeHtml(cropName)}</span>
          <span class="text-on-surface-variant ml-2">Severity:</span>
          ${severityBadge(severity)}
        </div>
        <div class="mt-3 text-xs text-on-surface-variant">
          Status: <span class="font-semibold text-on-surface">${escapeHtml(statusLabel.replace(/\b\w/g, (c) => c.toUpperCase()))}</span>
        </div>
      </div>
      <div>
        <h4 class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Symptoms Noted</h4>
        ${symptoms.length
          ? `<ul class="text-sm text-on-surface space-y-1">${symptoms.map((symptom) => `<li class="flex items-center gap-2"><span class="material-symbols-outlined text-[14px] text-primary">check</span>${escapeHtml(symptom)}</li>`).join('')}</ul>`
          : `<p class="text-sm text-on-surface-variant">No symptoms recorded.</p>`}
      </div>
      <div>
        <h4 class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Recommendation</h4>
        <p class="text-sm text-on-surface leading-6">${escapeHtml(recommendation)}</p>
      </div>
    </div>`;
}

function renderFarmerMessageAvatar() {
  const farmer = _activeChat?.farmer_id || {};
  const farmerUser = farmer.user_id || {};
  const avatar = _activeChat?.farmerAvatar || farmerUser.avatar_url || farmerUser.avatarUrl || null;
  const name = _activeChat?.farmerName || farmerUser.full_name || 'Farmer';
  const initials = name.split(' ').map((word) => word[0]).join('').toUpperCase().slice(0, 2) || 'F';

  return avatar
    ? `<img alt="${escapeHtml(name)}" class="w-7 h-7 rounded-full object-cover flex-shrink-0" src="${avatar}" />`
    : `<div class="w-7 h-7 rounded-full bg-secondary-container/30 flex items-center justify-center text-xs font-bold shrink-0">${initials}</div>`;
}

function setupInput() {
  const inp = document.getElementById('message-input') || document.querySelector('[data-message-input], input[placeholder*="essage"], textarea[placeholder*="essage"]');
  const btn = document.getElementById('send-btn') || document.querySelector('[data-send-btn]');
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

  document.querySelectorAll('button').forEach((b) => {
    const ic = b.querySelector('.material-symbols-outlined');
    if (ic && ['attach_file', 'image'].includes(ic.textContent.trim())) {
      b.addEventListener('click', () => fi.click());
    }
  });

  fi.addEventListener('change', async () => {
    if (!_activeChatId || !fi.files[0]) return;

    const file = fi.files[0];
    console.log(`[ExpertChat] sending image message - conversationId=${_activeChatId}`);

    const fd = new FormData();
    fd.append('image', file);
    fd.append('messageType', 'image');
    fd.append('content_type', 'image');

    try {
      const res = await api.post(`/chats/${_activeChatId}/messages`, fd);
      console.log(`[ExpertChat] message saved successfully - conversationId=${_activeChatId}, messageId=${res.data?.id}`);
      appendMsg(res.data);
    } catch (e) {
      console.error('[ExpertChat] image upload error:', e);
      showToast('Failed to send image', 'error');
    }

    fi.value = '';
  });
}

async function send(inp) {
  const text = inp.value.trim();
  if (!text || !_activeChatId) return;

  console.log(`[ExpertChat] sending text message - conversationId=${_activeChatId}`);
  inp.value = '';

  if (_socket?.connected) {
    _socket.emit('message:send', { conversationId: _activeChatId, messageType: 'text', text }, (ack) => {
      if (!ack?.success) {
        console.error(`[ExpertChat] failed to save message - conversationId=${_activeChatId}`, ack?.error);
        showToast(ack?.error || 'Send failed', 'error');
        return;
      }
      console.log(`[ExpertChat] message saved successfully - conversationId=${ack.message?.conversationId || _activeChatId}, messageId=${ack.message?.id}`);
      appendMsg(ack.message);
    });
    return;
  }

  try {
    const res = await api.post(`/chats/${_activeChatId}/messages`, { messageType: 'text', content_type: 'text', text });
    console.log(`[ExpertChat] message saved successfully - conversationId=${_activeChatId}, messageId=${res.data?.id}`);
    appendMsg(res.data);
  } catch (e) {
    showToast('Send failed', 'error');
  }
}

function openReviewModal() {
  if (!_activeRequestId) {
    showToast('No active case to review', 'error');
    return;
  }
  const m = document.createElement('div');
  m.className = 'fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 overflow-y-auto';
  m.innerHTML = `<div class="bg-surface rounded-2xl w-full max-w-md shadow-xl my-auto">
    <div class="p-5 border-b border-surface-variant"><h3 class="text-lg font-bold text-on-surface">Submit Expert Review</h3><p class="text-sm text-on-surface-variant mt-0.5">This will close the case</p></div>
    <div class="p-5 space-y-4">
      <div><label class="block text-sm font-medium text-on-surface mb-1.5">Decision *</label>
        <select id="rv-decision" class="w-full px-4 py-2.5 border border-outline-variant rounded-xl text-sm focus:ring-1 focus:ring-primary bg-surface-container-lowest">
          <option value="approved">Approved - AI diagnosis is correct</option>
          <option value="edited">Edited - I have corrections</option>
          <option value="rejected">Rejected - AI diagnosis is wrong</option>
        </select>
      </div>
      <div><label class="block text-sm font-medium text-on-surface mb-1.5">Confirmed Disease</label><input id="rv-disease" type="text" placeholder="Your diagnosis..." class="w-full px-4 py-2.5 border border-outline-variant rounded-xl text-sm focus:ring-1 focus:ring-primary bg-surface-container-lowest"/></div>
      <div><label class="block text-sm font-medium text-on-surface mb-1.5">Confirmed Severity</label>
        <select id="rv-severity" class="w-full px-4 py-2.5 border border-outline-variant rounded-xl text-sm focus:ring-1 focus:ring-primary bg-surface-container-lowest">
          <option value="">Same as AI</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
        </select>
      </div>
      <div><label class="block text-sm font-medium text-on-surface mb-1.5">Expert Notes *</label><textarea id="rv-notes" rows="4" placeholder="Your detailed findings and recommendations for the farmer..." class="w-full px-4 py-3 border border-outline-variant rounded-xl text-sm focus:ring-1 focus:ring-primary resize-none bg-surface-container-lowest"></textarea></div>
    </div>
    <div class="p-5 pt-0 flex gap-3">
      <button onclick="this.closest('.fixed').remove()" class="flex-1 py-2.5 border border-outline-variant rounded-xl text-sm font-medium text-on-surface-variant">Cancel</button>
      <button id="submit-review-btn" class="flex-1 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-semibold">Submit Review</button>
    </div>
  </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', (e) => {
    if (e.target === m) m.remove();
  });
  m.querySelector('#submit-review-btn').addEventListener('click', async () => {
    const notes = m.querySelector('#rv-notes').value.trim();
    if (!notes) {
      showToast('Expert notes are required', 'error');
      return;
    }
    const btn = m.querySelector('#submit-review-btn');
    btn.disabled = true;
    btn.textContent = 'Submitting...';
    try {
      await api.post(`/treatment-requests/${_activeRequestId}/review`, {
        decision: m.querySelector('#rv-decision').value,
        confirmed_disease: m.querySelector('#rv-disease').value.trim() || null,
        confirmed_severity: m.querySelector('#rv-severity').value || null,
        expert_notes: notes,
      });
      m.remove();
      showToast('Review submitted! Case closed.', 'success');
      await loadChats();
    } catch (err) {
      showToast(err.message || 'Failed', 'error');
      btn.disabled = false;
      btn.textContent = 'Submit Review';
    }
  });
}

function connectSocket() {
  if (typeof io === 'undefined') {
    console.warn('[ExpertChat] Socket.IO not loaded');
    return;
  }
  _socket = io('http://localhost:5000', { auth: { token: Auth.getToken() } });
  _socket.on('connect', () => {
    if (_activeChatId) _socket.emit('chat:join', { conversationId: _activeChatId });
  });
  _socket.on('message:new', (message) => appendMsg(message));
  _socket.on('notification:new', (n) => showToast(n.title || 'New notification', 'info'));
  _socket.on('error', ({ message }) => console.error('[ExpertChat][Socket]', message));
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
