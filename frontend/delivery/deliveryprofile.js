// deliveryprofile.js
document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth('delivery')) return;
  populateSidebarUser(); setupLogout();
  await loadProfile();
  setupForms(); setupLogoUpload();
});

async function loadProfile() {
  try {
    const p = (await api.get('/delivery/profile')).data;
    // Company details fields
    setVal('company-name',   p.company_name);
    setVal('contact-number', p.company_phone || p.phone || '');
    setVal('email',          p.company_email || p.email || '');
    setVal('street-address', p.company_address || '');
    setVal('description',    p.description || '');
    // Personal (owner) fields
    setVal('full_name',      p.full_name);
    setVal('phone',          p.phone || '');

    // Display / sidebar
    setText('[data-profile-name]',    p.company_name || p.full_name);
    setText('[data-profile-role]',    'Delivery Company');
    setText('[data-profile-email]',   p.company_email || p.email || '');
    const inits = (p.company_name || p.full_name || 'DC').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    setText('[data-profile-initials]', inits);
    if (p.logo) {
      document.querySelectorAll('[data-profile-avatar], [data-profile-logo], img.company-logo').forEach(img => {
        if (img.tagName === 'IMG') img.src = p.logo;
      });
    }
  } catch (e) {
    showToast('Failed to load profile', 'error');
  }
}

function setupForms() {
  // Wire all "Save" buttons / form submits in the page
  document.querySelectorAll('form, [data-form]').forEach(form => {
    // Skip password form — handled separately below
    if (form.id === 'password-form' || form.dataset.form === 'security') return;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"], button.save-btn, button:not([type="button"])');
      setBtnLoad(btn, true);
      try {
        const fd = new FormData();
        const fieldMap = {
          'company-name':   'company_name',
          'contact-number': 'company_phone',
          'email':          'company_email',
          'street-address': 'company_address',
          'description':    'description',
          'full_name':      'full_name',
          'phone':          'phone',
        };
        Object.entries(fieldMap).forEach(([id, key]) => {
          const v = getVal(id) || getVal(key);
          if (v) fd.append(key, v);
        });
        const li = document.getElementById('logo-input');
        if (li?.files[0]) fd.append('logo', li.files[0]);
        await api.put('/delivery/profile', fd);
        showToast('Profile updated!', 'success');
        // Refresh sidebar
        const res = await api.get('/delivery/profile');
        Auth.setSession({ token: Auth.getToken(), user: res.data });
        populateSidebarUser();
      } catch (err) {
        showToast(err.message || 'Update failed', 'error');
      } finally {
        setBtnLoad(btn, false, 'Save Details');
      }
    });
  });

  // Password form
  const pwf = document.getElementById('password-form') || document.querySelector('[data-form="security"]');
  if (pwf) {
    pwf.addEventListener('submit', async e => {
      e.preventDefault();
      const btn  = pwf.querySelector('button[type="submit"]');
      const cur  = pwf.querySelector('[name="current_password"], #current-password, #currentPassword')?.value;
      const nw   = pwf.querySelector('[name="new_password"],     #new-password,     #newPassword')?.value;
      const conf = pwf.querySelector('[name="confirm_password"], #confirm-password, #confirmPassword')?.value;
      if (!cur || !nw)       { showToast('Fill in all fields', 'error');          return; }
      if (nw !== conf)       { showToast('Passwords do not match', 'error');       return; }
      if (nw.length < 8)    { showToast('Minimum 8 characters', 'error');         return; }
      setBtnLoad(btn, true);
      try {
        await api.post('/auth/change-password', { current_password: cur, new_password: nw });
        showToast('Password changed!', 'success');
        pwf.reset();
      } catch (err) {
        showToast(err.message || 'Failed to change password', 'error');
      } finally {
        setBtnLoad(btn, false, 'Update Password');
      }
    });
  }
}

function setupLogoUpload() {
  // Create hidden file input if not present
  const li = document.getElementById('logo-input') || (() => {
    const i = document.createElement('input');
    i.type = 'file'; i.id = 'logo-input'; i.accept = 'image/*';
    i.style.display = 'none';
    document.body.appendChild(i);
    return i;
  })();

  // Clicking the avatar/logo triggers file picker
  document.querySelectorAll('[data-profile-avatar], [data-profile-logo], [data-avatar-upload]').forEach(el => {
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => li.click());
  });

  // Camera icon overlay button (if present in HTML)
  document.querySelectorAll('button[data-upload-logo], .upload-logo-btn').forEach(btn => {
    btn.addEventListener('click', () => li.click());
  });

  li.addEventListener('change', () => {
    if (!li.files[0]) return;
    const url = URL.createObjectURL(li.files[0]);
    document.querySelectorAll('[data-profile-avatar], [data-profile-logo], img.company-logo').forEach(img => {
      if (img.tagName === 'IMG') img.src = url;
    });
    showToast('Logo preview updated — save profile to apply', 'info');
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const getVal = k => (document.getElementById(k) || document.querySelector(`[name="${k}"]`))?.value?.trim() || '';
const setVal = (k, v) => {
  const el = document.getElementById(k) || document.querySelector(`[name="${k}"]`);
  if (el && v != null) el.value = v;
};
const setText = (sel, txt) => document.querySelectorAll(sel).forEach(el => el.textContent = txt || '');
const setBtnLoad = (btn, on, label = 'Save') => {
  if (!btn) return;
  btn.disabled = on;
  btn.textContent = on ? 'Saving…' : label;
};
