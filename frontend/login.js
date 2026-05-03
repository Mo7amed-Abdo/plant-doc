// login.js
document.addEventListener('DOMContentLoaded', () => {
  if (Auth.isLoggedIn()) { redirectToDashboard(Auth.getRole()); return; }

  const guestBtn = document.getElementById('continue-guest');
  if (guestBtn) {
    guestBtn.addEventListener('click', (e) => {
      e.preventDefault();
      Auth.setGuest();
      window.location.href = '/frontend/farmer/farmerdashboard.html';
    });
  }

  const form    = document.querySelector('form');
  const emailEl = document.getElementById('email');
  const passEl  = document.getElementById('password');
  const submitEl = form.querySelector('button[type="submit"], a[type="submit"]');

  // The HTML submit is an <a> tag
  if (submitEl?.tagName === 'A') {
    submitEl.addEventListener('click', e => { e.preventDefault(); handleLogin(); });
  }
  form.addEventListener('submit', e => { e.preventDefault(); handleLogin(); });

  // Password visibility
  document.querySelectorAll('[data-icon="visibility"]').forEach(icon => {
    icon.style.cursor = 'pointer';
    icon.addEventListener('click', () => {
      const inp = icon.closest('.relative').querySelector('input');
      if (!inp) return;
      inp.type = inp.type === 'password' ? 'text' : 'password';
      icon.textContent = inp.type === 'password' ? 'visibility' : 'visibility_off';
    });
  });

  async function handleLogin() {
    const email    = emailEl?.value.trim();
    const password = passEl?.value;
    if (!email || !password) { showToast('Please enter your email and password', 'error'); return; }

    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      Auth.setSession(res.data);
      showToast('Welcome back!', 'success');
      setTimeout(() => redirectToDashboard(res.data.user.role), 600);
    } catch (err) {
      showToast(err.message || 'Invalid credentials', 'error');
    } finally { setLoading(false); }
  }

  function setLoading(on) {
    if (!submitEl) return;
    submitEl.style.opacity = on ? '0.7' : '1';
    if (submitEl.tagName === 'A') submitEl.textContent = on ? 'Logging in…' : 'Login';
    else { submitEl.disabled = on; submitEl.textContent = on ? 'Logging in…' : 'Login'; }
  }
});
