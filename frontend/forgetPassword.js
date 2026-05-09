document.addEventListener('DOMContentLoaded', () => {
  const requestForm = document.getElementById('reset-request-form');
  const confirmForm = document.getElementById('reset-confirm-form');
  const emailEl = document.getElementById('email');
  const codeEl = document.getElementById('code');
  const newPassEl = document.getElementById('new_password');
  const confirmNewPassEl = document.getElementById('confirm_new_password');

  if (!requestForm || !confirmForm) return;

  requestForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailEl?.value.trim();
    if (!email) return showToast('Please enter your email', 'error');

    setFormLoading(requestForm, true, 'Sending…');
    try {
      const res = await api.post('/auth/password-reset/request', { email });
      const code = res?.data?.code;
      showToast('If the email exists, a reset code was issued.', 'success');
      if (code) showToast(`Dev reset code: ${code}`, 'info');

      // Step 2
      confirmForm.classList.remove('hidden');
      requestForm.querySelector('button[type="submit"]')?.setAttribute('disabled', 'disabled');
      codeEl?.focus();
    } catch (err) {
      showToast(err.message || 'Failed to request reset', 'error');
    } finally {
      setFormLoading(requestForm, false, 'Send Reset Link');
    }
  });

  confirmForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailEl?.value.trim();
    const code = codeEl?.value.trim();
    const new_password = newPassEl?.value || '';
    const confirm_password = confirmNewPassEl?.value || '';

    if (!email || !code || !new_password) return showToast('Please fill all fields', 'error');
    if (new_password.length < 8) return showToast('Password must be at least 8 characters', 'error');
    if (new_password !== confirm_password) return showToast('Passwords do not match', 'error');

    setFormLoading(confirmForm, true, 'Resetting…');
    try {
      await api.post('/auth/password-reset/confirm', { email, code, new_password });
      showToast('Password reset successful. Please login.', 'success');
      setTimeout(() => (window.location.href = 'login.html'), 800);
    } catch (err) {
      showToast(err.message || 'Reset failed', 'error');
    } finally {
      setFormLoading(confirmForm, false, 'Reset Password');
    }
  });

  function setFormLoading(form, on, label) {
    const btn = form.querySelector('button[type="submit"]');
    if (!btn) return;
    btn.disabled = !!on;
    btn.style.opacity = on ? '0.7' : '1';
    btn.textContent = label;
  }
});

