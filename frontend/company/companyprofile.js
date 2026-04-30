// companyprofile.js
let currentProfile = null;
let pendingLogoFile = null;
let pendingLogoPreviewUrl = null;
let _isDirty = false;
let _beforeUnloadBound = false;

const MAX_LOGO_BYTES = 5 * 1024 * 1024;

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth('company')) return;
  populateSidebarUser();
  setupLogout();
  setupForms();
  setupLogoUpload();
  setupRetry();
  setupPasswordToggles();
  setHeaderLoading(true);
  await loadProfile();
});

async function loadProfile() {
  try {
    setProfileErrorVisible(false);
    const p = (await api.get('/company/profile')).data;
    currentProfile = p;
    applyProfileToView(p);
    persistProfileSession(p);
    setHeaderLoading(false);
    bindDirtyTracking();
  } catch (e) {
    console.error('[company.profile.load] error:', e);
    showToast('Failed to load profile', 'error');
    setHeaderLoading(false);
    setProfileErrorVisible(true);
  }
}

function applyProfileToView(p) {
  setVal('company-name', p.company_name || '');
  setVal('contact-number', p.company_phone || '');
  setVal('email', p.company_email || p.email || '');
  setVal('street-address', p.company_address || p.address || '');
  setVal('description', p.description || '');

  setText('[data-profile-name]', p.company_name || 'Company');
  setText('[data-profile-email]', p.company_email || p.email || '');
  setText('[data-profile-location]', p.company_address || p.address || 'Not set');
  setText('[data-profile-joined]', p.joined_at ? `Joined ${formatDate(p.joined_at)}` : 'Joined');

  // Header skeleton -> show real content
  document.querySelectorAll('[data-skel-name],[data-skel-email]').forEach((el) => el.classList.add('hidden'));
  document.querySelectorAll('[data-profile-name],[data-profile-email]').forEach((el) => el.classList.remove('hidden'));

  const inits = initialsFromName(p.company_name || p.full_name || 'C');
  updateLogoImages(p.logo || '', inits);

  const badge = document.getElementById('verified-badge');
  if (badge) badge.style.display = p.is_verified ? 'inline-flex' : 'none';

  // Reset dirty UI after applying saved profile
  setDirty(false);
  clearFieldHighlights();
}

function setupForms() {
  const detailsForm = document.getElementById('company-details-form');
  if (detailsForm) {
    const saveBtn = detailsForm.querySelector('button[type="submit"]');
    detailsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      setBtnLoad(saveBtn, true, 'Save Details');
      try {
        const fd = new FormData();
        const fields = {
          'company-name': 'company_name',
          'contact-number': 'company_phone',
          'street-address': 'address',
          'email': 'email',
          'description': 'description',
        };

        Object.entries(fields).forEach(([id, key]) => {
          const el = document.getElementById(id) || document.querySelector(`[name="${id}"]`);
          if (!el) return;
          fd.append(key, (el.value || '').trim());
        });

        if (pendingLogoFile) fd.append('logo', pendingLogoFile);

        await api.put('/company/profile', fd);
        showToast('Profile updated!', 'success');

        const res = await api.get('/company/profile');
        currentProfile = res.data;
        persistProfileSession(currentProfile);
        applyProfileToView(currentProfile);
        clearPendingLogo();
      } catch (err) {
        console.error('[company.profile.save] error:', err);
        showToast(err.message || 'Update failed', 'error');
      } finally {
        setBtnLoad(saveBtn, false, 'Save Details');
      }
    });
  }

  document.getElementById('discard-btn')?.addEventListener('click', () => {
    if (!currentProfile) return;
    clearPendingLogo();
    applyProfileToView(currentProfile);
    showToast('Changes discarded', 'info');
  });

  const pwf = document.getElementById('password-form') || document.querySelector('[data-form="security"]');
  if (pwf) {
    pwf.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = pwf.querySelector('button[type="submit"]');
      const cur = pwf.querySelector('[name="current_password"],#currentPassword,#current-password')?.value;
      const nw = pwf.querySelector('[name="new_password"],#newPassword,#new-password')?.value;
      const conf = pwf.querySelector('[name="confirm_password"],#confirmPassword,#confirm-password')?.value;
      if (!cur || !nw) { showToast('Fill all fields', 'error'); return; }
      if (nw !== conf) { showToast('Passwords do not match', 'error'); return; }
      if (nw.length < 8) { showToast('Min 8 characters', 'error'); return; }

      setBtnLoad(btn, true, 'Update Password');
      try {
        await api.post('/auth/change-password', { current_password: cur, new_password: nw });
        showToast('Password changed!', 'success');
        pwf.reset();
      } catch (err) {
        showToast(err.message || 'Failed', 'error');
      } finally {
        setBtnLoad(btn, false, 'Update Password');
      }
    });
  }
}

function setupLogoUpload() {
  const input = document.getElementById('logo-input') || (() => {
    const i = document.createElement('input');
    i.type = 'file';
    i.id = 'logo-input';
    i.accept = 'image/*';
    i.style.display = 'none';
    document.body.appendChild(i);
    return i;
  })();

  document.querySelectorAll('#logo-upload-trigger, [data-profile-logo]').forEach((el) => {
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => input.click());
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        input.click();
      }
    });
  });

  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) return;
    input.value = '';

    const err = validateLogoFile(file);
    if (err) { showToast(err, 'error'); return; }

    pendingLogoFile = file;
    resetPendingPreview();
    pendingLogoPreviewUrl = URL.createObjectURL(file);

    const inits = initialsFromName(getVal('company-name') || currentProfile?.company_name || 'C');
    updateLogoImages(pendingLogoPreviewUrl, inits);
    setDirty(true);
    showToast('Logo selected. Save details to upload it.', 'info');
  });
}

function setupRetry() {
  document.querySelector('[data-profile-retry]')?.addEventListener('click', () => loadProfile());
}

function setProfileErrorVisible(on) {
  const el = document.querySelector('[data-profile-error]');
  if (!el) return;
  el.classList.toggle('hidden', !on);
}

function setHeaderLoading(on) {
  document.querySelectorAll('[data-skel-name],[data-skel-email]').forEach((el) => el.classList.toggle('hidden', !on));
  document.querySelectorAll('[data-profile-name],[data-profile-email]').forEach((el) => el.classList.toggle('hidden', on));
  const emailEl = document.querySelector('[data-profile-email]');
  if (emailEl && on) emailEl.textContent = '';
}

function bindDirtyTracking() {
  if (!currentProfile) return;

  const fieldMap = {
    'company-name': (p) => p.company_name || '',
    'contact-number': (p) => p.company_phone || '',
    'email': (p) => p.company_email || p.email || '',
    'street-address': (p) => p.company_address || p.address || '',
    'description': (p) => p.description || '',
  };

  const checkDirty = () => {
    const dirty = Object.keys(fieldMap).some((id) => {
      const el = document.getElementById(id);
      if (!el) return false;
      const current = (el.value || '').trim();
      const base = String(fieldMap[id](currentProfile) || '').trim();
      const isChanged = current !== base;
      highlightField(el, isChanged);
      return isChanged;
    }) || Boolean(pendingLogoFile);
    setDirty(dirty);
  };

  Object.keys(fieldMap).forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', checkDirty);
    el.addEventListener('change', checkDirty);
  });

  checkDirty();
}

function setDirty(on) {
  _isDirty = Boolean(on);
  const discardBtn = document.getElementById('discard-btn');
  if (discardBtn) {
    discardBtn.disabled = !_isDirty;
    discardBtn.classList.toggle('opacity-50', !_isDirty);
    discardBtn.classList.toggle('cursor-not-allowed', !_isDirty);
  }

  if (_isDirty && !_beforeUnloadBound) {
    _beforeUnloadBound = true;
    window.addEventListener('beforeunload', (e) => {
      if (!_isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    });
  }
}

function highlightField(inputEl, on) {
  // Prefer highlighting the wrapper if present (data-field-wrap), otherwise highlight the input itself.
  const wrap = document.querySelector(`[data-field-wrap="${inputEl.id}"]`) || inputEl.closest('[data-field-wrap]');
  const target = wrap || inputEl;
  target.classList.toggle('ring-2', on);
  target.classList.toggle('ring-primary/15', on);
  target.classList.toggle('border-primary', on);
}

function clearFieldHighlights() {
  document.querySelectorAll('[data-field-wrap]').forEach((el) => {
    el.classList.remove('ring-2', 'ring-primary/15', 'border-primary');
  });
  ['company-name','contact-number','email','street-address','description'].forEach((id) => {
    const el = document.getElementById(id);
    el?.classList.remove('ring-2', 'ring-primary/15', 'border-primary');
  });
}

function setupPasswordToggles() {
  const ids = ['currentPassword', 'newPassword', 'confirmPassword'];
  ids.forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;
    const wrap = input.parentElement;
    if (!wrap) return;
    if (wrap.querySelector(`[data-pw-toggle="${id}"]`)) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.pwToggle = id;
    btn.setAttribute('aria-label', 'Show or hide password');
    btn.className = 'px-3 bg-surface-container-low text-on-surface-variant hover:text-primary transition-colors border-l border-outline-variant';
    btn.innerHTML = '<span class="material-symbols-outlined text-[18px]">visibility</span>';
    wrap.appendChild(btn);

    btn.addEventListener('click', () => {
      const isPw = input.type === 'password';
      input.type = isPw ? 'text' : 'password';
      const icon = btn.querySelector('.material-symbols-outlined');
      if (icon) icon.textContent = isPw ? 'visibility_off' : 'visibility';
    });
  });
}

function validateLogoFile(file) {
  if (!file) return '';
  if (!file.type.startsWith('image/')) return 'Please select an image file';
  if (file.size > MAX_LOGO_BYTES) return 'Image must be under 5MB';
  return '';
}

function resetPendingPreview() {
  if (pendingLogoPreviewUrl) {
    URL.revokeObjectURL(pendingLogoPreviewUrl);
    pendingLogoPreviewUrl = null;
  }
}

function clearPendingLogo() {
  pendingLogoFile = null;
  resetPendingPreview();
}

function persistProfileSession(profile) {
  localStorage.setItem('plantdoc_profile', JSON.stringify(profile));

  // Keep sidebar user card in sync without breaking existing auth session.
  const existingUser = Auth.getUser() || {};
  const mergedUser = {
    ...existingUser,
    full_name: profile.company_name || profile.full_name || existingUser.full_name,
    role: profile.role || existingUser.role,
    avatar: profile.logo || existingUser.avatar || null,
  };
  localStorage.setItem('plantdoc_user', JSON.stringify(mergedUser));
  populateSidebarUser();
}

function initialsFromName(name) {
  return (String(name || 'C'))
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'C';
}

function initialsAvatarDataUrl(initials) {
  const safe = String(initials || 'C').slice(0, 2).toUpperCase();
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e8f5e9"/>
      <stop offset="1" stop-color="#c8e6c9"/>
    </linearGradient>
  </defs>
  <rect width="96" height="96" rx="48" fill="url(#g)"/>
  <text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle"
        font-family="Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="30"
        font-weight="700" fill="#0f5132">${safe}</text>
</svg>`.trim();
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function updateLogoImages(src, initials) {
  const fallback = initialsAvatarDataUrl(initials || 'C');
  document.querySelectorAll('[data-profile-logo],[data-user-avatar]').forEach((el) => {
    if (el.tagName !== 'IMG') return;
    el.onerror = null;
    el.src = fallback;
    if (src) {
      el.src = src;
      el.onerror = () => {
        el.onerror = null;
        el.src = fallback;
      };
    }
  });
}

// Returns '' for existing inputs with empty value; returns null when the element doesn't exist.
const getVal = (k) => {
  const el = document.getElementById(k) || document.querySelector(`[name="${k}"]`);
  if (!el) return null;
  return (el.value || '').trim();
};
const setVal = (k, v) => {
  const el = document.getElementById(k) || document.querySelector(`[name="${k}"]`);
  if (el && v != null) el.value = v;
};
const setText = (sel, txt) => document.querySelectorAll(sel).forEach(el => (el.textContent = txt || ''));
const setBtnLoad = (btn, on, label = 'Save') => {
  if (!btn) return;
  if (!btn.dataset.pdOriginalHtml) btn.dataset.pdOriginalHtml = btn.innerHTML;
  btn.disabled = on;
  if (on) {
    btn.innerHTML = `<span class="material-symbols-outlined text-[18px] animate-spin">progress_activity</span> ${label || 'Saving...'}`;
    return;
  }
  btn.innerHTML = btn.dataset.pdOriginalHtml;
};
