// deliveryprofile.js
document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth('delivery')) return;
  populateSidebarUser();
  setupLogout();
  await loadProfile();
  setupForms();
  setupLogoUpload();
});

async function loadProfile() {
  try {
    const p = (await api.get('/delivery/profile')).data;

    setVal('company-name', p.company_name);
    setVal('contact-number', p.company_phone || p.phone || '');
    setVal('email', p.company_email || p.email || '');
    setVal('street-address', p.company_address || '');
    setVal('description', p.description || '');
    setVal('full_name', p.full_name);
    setVal('phone', p.phone || '');

    setText('[data-profile-name]', p.company_name || p.full_name);
    setText('[data-company-name-card]', p.company_name || p.full_name);
    setText('[data-profile-role]', 'Delivery Company');
    setText('[data-profile-email]', p.company_email || p.email || '');

    const initials = (p.company_name || p.full_name || 'DC')
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
    setText('[data-profile-initials]', initials);

    if (p.logo) {
      document.querySelectorAll('[data-profile-avatar], [data-profile-logo], img.company-logo').forEach((img) => {
        if (img.tagName === 'IMG') img.src = p.logo;
      });
    }
  } catch (e) {
    showToast('Failed to load profile', 'error');
  }
}

function setupForms() {
  const submitCompanyDetails = async (btn) => {
    setBtnLoad(btn, true, 'Save Details');
    try {
      const fd = new FormData();
      const fieldMap = {
        'company-name': 'company_name',
        'contact-number': 'company_phone',
        email: 'email',
        'street-address': 'address',
        description: 'description',
        full_name: 'full_name',
        phone: 'phone',
      };

      Object.entries(fieldMap).forEach(([id, key]) => {
        const value = getVal(id) || getVal(key);
        if (value) fd.append(key, value);
      });

      const logoInput = document.getElementById('logo-input');
      if (logoInput?.files?.[0]) fd.append('logo', logoInput.files[0]);

      await api.put('/delivery/profile', fd);
      showToast('Profile updated!', 'success');

      const res = await api.get('/delivery/profile');
      Auth.setSession({ token: Auth.getToken(), user: res.data });
      populateSidebarUser();
      setText('[data-company-name-card]', res.data.company_name || res.data.full_name);
    } catch (err) {
      showToast(err.message || 'Update failed', 'error');
    } finally {
      setBtnLoad(btn, false, 'Save Details');
    }
  };

  document.querySelectorAll('form, [data-form]').forEach((form) => {
    if (form.id === 'password-form' || form.dataset.form === 'security') return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"], button.save-btn, button:not([type="button"])');
      await submitCompanyDetails(btn);
    });
  });

  const companyDetailsSection = document.getElementById('company-details');
  const detailsButton = companyDetailsSection?.querySelector('button');
  if (detailsButton) {
    detailsButton.addEventListener('click', async (e) => {
      e.preventDefault();
      await submitCompanyDetails(detailsButton);
    });
  }

  const pwForm = document.getElementById('password-form') || document.querySelector('[data-form="security"]');
  if (pwForm) {
    pwForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await submitPassword(pwForm);
    });
  } else {
    const securitySection = document.getElementById('security');
    const securityButton = securitySection?.querySelector('button');
    if (securityButton) {
      securityButton.addEventListener('click', async (e) => {
        e.preventDefault();
        await submitPassword(securitySection, securityButton);
      });
    }
  }
}

async function submitPassword(container, buttonOverride) {
  const btn = buttonOverride || container.querySelector('button[type="submit"], button');
  const cur = container.querySelector('[name="current_password"], #current-password, #currentPassword')?.value;
  const nw = container.querySelector('[name="new_password"], #new-password, #newPassword')?.value;
  const conf = container.querySelector('[name="confirm_password"], #confirm-password, #confirmPassword')?.value;

  if (!cur || !nw || !conf) {
    showToast('Fill in all fields', 'error');
    return;
  }
  if (nw !== conf) {
    showToast('Passwords do not match', 'error');
    return;
  }
  if (nw.length < 8) {
    showToast('Minimum 8 characters', 'error');
    return;
  }

  setBtnLoad(btn, true, 'Update Password');
  try {
    await api.post('/auth/change-password', { current_password: cur, new_password: nw });
    showToast('Password changed!', 'success');
    if (typeof container.reset === 'function') container.reset();
  } catch (err) {
    showToast(err.message || 'Failed to change password', 'error');
  } finally {
    setBtnLoad(btn, false, 'Update Password');
  }
}

function setupLogoUpload() {
  const logoInput = document.getElementById('logo-input') || (() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'logo-input';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);
    return input;
  })();

  let pickerOpen = false;
  const openPicker = (event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (pickerOpen) return;
    pickerOpen = true;
    logoInput.click();
    setTimeout(() => { pickerOpen = false; }, 300);
  };

  const clickTargets = new Set();
  document.querySelectorAll('[data-profile-avatar], [data-avatar-upload]').forEach((el) => clickTargets.add(el));
  document.querySelectorAll('[data-profile-logo]').forEach((el) => {
    clickTargets.add(el.closest('[data-avatar-upload]') || el);
  });

  clickTargets.forEach((el) => {
    el.style.cursor = 'pointer';
    el.addEventListener('click', openPicker);
  });

  document.querySelectorAll('button[data-upload-logo], .upload-logo-btn').forEach((btn) => {
    btn.addEventListener('click', openPicker);
  });

  logoInput.addEventListener('change', () => {
    if (!logoInput.files?.[0]) return;
    const url = URL.createObjectURL(logoInput.files[0]);
    document.querySelectorAll('[data-profile-avatar], [data-profile-logo], img.company-logo').forEach((img) => {
      if (img.tagName === 'IMG') img.src = url;
    });
    showToast('Logo preview updated - save profile to apply', 'info');
  });
}

const getVal = (key) => (document.getElementById(key) || document.querySelector(`[name="${key}"]`))?.value?.trim() || '';
const setVal = (key, value) => {
  const el = document.getElementById(key) || document.querySelector(`[name="${key}"]`);
  if (el && value != null) el.value = value;
};
const setText = (selector, text) => document.querySelectorAll(selector).forEach((el) => { el.textContent = text || ''; });
const setBtnLoad = (btn, isLoading, label = 'Save') => {
  if (!btn) return;
  btn.disabled = isLoading;
  btn.textContent = isLoading ? 'Saving...' : label;
};
