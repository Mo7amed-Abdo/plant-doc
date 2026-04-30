let currentProfile = null;
let pendingAvatarFile = null;
let pendingAvatarPreviewUrl = null;
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth('expert')) return;
  populateSidebarUser();
  setupLogout();
  setupForms();
  await loadProfile();
});

async function loadProfile() {
  try {
    const profile = (await api.get('/expert/profile')).data;
    currentProfile = profile;
    applyProfileToView(profile);
    persistProfileSession(profile);
  } catch (error) {
    console.error('[expert.profile.load] error:', error);
    showToast('Failed to load profile', 'error');
  }
}

function applyProfileToView(profile) {
  setVal('full_name', profile.full_name || '');
  setVal('email', profile.email || '');
  setVal('phone', profile.phone || '');
  setVal('location', profile.location || '');
  setVal('bio', profile.bio || '');
  setVal('years_experience', profile.years_experience ?? 0);
  setVal('specialization', profile.specialization || '');

  setText('[data-profile-name]', profile.full_name || 'Expert');
  setText('[data-profile-specialization]', profile.specialization || 'Expert');
  setText('[data-profile-location]', profile.location || 'Location not set');
  setText('[data-stat="cases-reviewed"]', profile.cases_reviewed || 0);
  setText('[data-stat="accuracy-rate"]', `${profile.accuracy_rate || 0}%`);
  setText('[data-stat="years-experience"]', profile.years_experience ?? 0);

  syncExpertiseTags(profile.expertise_tags || []);
  updateProfileImages(profile.avatar || profile.profileImage || profile.imageUrl || '');
}

function setupForms() {
  const saveBtn = document.getElementById('save-btn');
  saveBtn?.addEventListener('click', saveProfile);

  document.getElementById('discard-btn')?.addEventListener('click', () => {
    if (!currentProfile) return;
    pendingAvatarFile = null;
    resetPendingPreview();
    applyProfileToView(currentProfile);
    showToast('Changes discarded', 'info');
  });

  const avatarInput = document.getElementById('avatar-input');
  document.querySelectorAll('[data-avatar-upload],[data-profile-avatar]').forEach((element) => {
    element.style.cursor = 'pointer';
    element.addEventListener('click', () => avatarInput?.click());
  });

  avatarInput?.addEventListener('change', handleAvatarSelection);

  // Security & Password
  const securityForm = document.getElementById('password-form') || document.querySelector('[data-form="security"]');
  if (securityForm) {
    securityForm.addEventListener('submit', handlePasswordChange);
  } else {
    // Expert profile page uses inputs without a form wrapper; bind via the Save button if present.
    document.getElementById('update-password-btn')?.addEventListener('click', handlePasswordChange);
  }
}

async function saveProfile() {
  const saveBtn = document.getElementById('save-btn');
  setBtnLoad(saveBtn, true, 'Saving...');

  const formData = new FormData();
  formData.append('full_name', getVal('full_name'));
  formData.append('phone', getVal('phone'));
  formData.append('location', getVal('location'));
  formData.append('bio', getVal('bio'));
  formData.append('years_experience', getVal('years_experience'));
  formData.append('expertise_tags', JSON.stringify(getExpertiseTags()));

  if (pendingAvatarFile) {
    formData.append('avatar', pendingAvatarFile);
  }

  try {
    const response = await api.put('/expert/profile', formData);
    console.log('[expert.profile.save] response:', response);

    currentProfile = response.data;
    persistProfileSession(currentProfile);
    applyProfileToView(currentProfile);

    pendingAvatarFile = null;
    resetPendingPreview();

    await loadProfile();
    showToast('Profile updated successfully', 'success');
  } catch (error) {
    console.error('[expert.profile.save] error:', error);
    showToast(error.message || 'Failed to save profile', 'error');
  } finally {
    setBtnLoad(saveBtn, false, 'Save Changes');
  }
}

function handleAvatarSelection(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  event.target.value = '';

  const err = validateAvatarFile(file);
  if (err) { showToast(err, 'error'); return; }

  pendingAvatarFile = file;
  resetPendingPreview();
  pendingAvatarPreviewUrl = URL.createObjectURL(file);

  updateProfileImages(pendingAvatarPreviewUrl);
  showToast('Image selected. Save changes to upload it.', 'info');
}

function updateProfileImages(src) {
  const initials = (getVal('full_name') || currentProfile?.full_name || 'E')
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'E';
  const fallback = initialsAvatarDataUrl(initials);

  document.querySelectorAll('[data-profile-avatar],[data-user-avatar]').forEach((element) => {
    if (element.tagName !== 'IMG') return;
    element.onerror = null;
    element.src = fallback;
    if (src) {
      element.src = src;
      element.onerror = () => {
        element.onerror = null;
        element.src = fallback;
      };
    }
  });
}

function syncExpertiseTags(tags) {
  const container = document.getElementById('tags-container');
  const hiddenInput = document.getElementById('expertise_tags');
  if (!container || !hiddenInput) return;

  container.innerHTML = tags.length
    ? tags.map(renderTagChip).join('')
    : `<span class="text-sm text-on-surface-variant">No expertise tags yet.</span>`;

  hiddenInput.value = JSON.stringify(tags);
}

function renderTagChip(tag) {
  const safeTag = escapeHtml(tag);
  const encodedTag = encodeURIComponent(tag);
  return `<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary-container/10 text-primary border border-primary/20 text-sm font-medium" data-tag="${encodedTag}">
    ${safeTag}
    <button type="button" onclick="removeTag(decodeURIComponent('${encodedTag}'))" class="hover:text-error transition-colors">
      <span class="material-symbols-outlined text-[14px]">close</span>
    </button>
  </span>`;
}

function getExpertiseTags() {
  return Array.from(document.querySelectorAll('#tags-container [data-tag]'))
    .map((element) => element.getAttribute('data-tag'))
    .filter(Boolean)
    .map((tag) => decodeURIComponent(tag));
}

function persistProfileSession(profile) {
  const existingUser = Auth.getUser() || {};

  const mergedUser = {
    ...existingUser,
    full_name: profile.full_name,
    email: profile.email,
    phone: profile.phone,
    role: profile.role || existingUser.role,
    avatar: profile.avatar || profile.profileImage || profile.imageUrl || existingUser.avatar || null,
  };

  localStorage.setItem('plantdoc_user', JSON.stringify(mergedUser));
  localStorage.setItem('plantdoc_profile', JSON.stringify(profile));
  populateSidebarUser();
}

function resetPendingPreview() {
  if (pendingAvatarPreviewUrl) {
    URL.revokeObjectURL(pendingAvatarPreviewUrl);
    pendingAvatarPreviewUrl = null;
  }
}

function validateAvatarFile(file) {
  if (!file) return '';
  if (!file.type.startsWith('image/')) return 'Please select an image file';
  if (file.size > MAX_AVATAR_BYTES) return 'Image must be under 5MB';
  return '';
}

function initialsAvatarDataUrl(initials) {
  const safe = String(initials || 'E').slice(0, 2).toUpperCase();
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

async function handlePasswordChange(event) {
  if (event?.preventDefault) event.preventDefault();
  const cur = document.getElementById('currentPassword')?.value;
  const nw = document.getElementById('newPassword')?.value;
  const conf = document.getElementById('confirmPassword')?.value;
  if (!cur || !nw) { showToast('Fill all fields', 'error'); return; }
  if (nw !== conf) { showToast('Passwords do not match', 'error'); return; }
  if (nw.length < 8) { showToast('Min 8 characters', 'error'); return; }

  try {
    await api.post('/auth/change-password', { current_password: cur, new_password: nw });
    showToast('Password changed!', 'success');
    // clear inputs
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
  } catch (err) {
    showToast(err.message || 'Failed', 'error');
  }
}

function addTag() {
  const input = document.getElementById('new-tag');
  const value = input?.value?.trim();
  if (!value) return;

  const tags = getExpertiseTags();
  if (!tags.includes(value)) tags.push(value);
  syncExpertiseTags(tags);

  input.value = '';
}

function removeTag(tag) {
  const tags = getExpertiseTags().filter((item) => item !== tag);
  syncExpertiseTags(tags);
}

const getVal = (key) => document.querySelector(`[name="${key}"],#${key}`)?.value?.trim() || '';
const setVal = (key, value) => {
  const element = document.querySelector(`[name="${key}"],#${key}`);
  if (element) element.value = value ?? '';
};
const setText = (selector, value) => document.querySelectorAll(selector).forEach((element) => {
  element.textContent = value ?? '';
});

function setBtnLoad(button, isLoading, label = 'Save Changes') {
  if (!button) return;

  button.disabled = isLoading;
  button.innerHTML = isLoading
    ? '<span class="material-symbols-outlined text-[18px] animate-spin">autorenew</span> Saving...'
    : `<span class="material-symbols-outlined text-[18px]">save</span> ${label}`;
}

window.addTag = addTag;
window.removeTag = removeTag;
window.saveChanges = saveProfile;
