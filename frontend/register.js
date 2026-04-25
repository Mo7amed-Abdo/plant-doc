// register.js
document.addEventListener('DOMContentLoaded', () => {
  if (Auth.isLoggedIn()) { redirectToDashboard(Auth.getRole()); return; }

  const form      = document.querySelector('form');
  const submitBtn = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const full_name = (document.getElementById('fullName') || document.getElementById('full_name'))?.value.trim();
    const email     = document.getElementById('email')?.value.trim();
    const password  = document.getElementById('password')?.value;
    const confirm   = document.getElementById('confirmPassword')?.value;
    const role      = document.getElementById('role')?.value;

    if (!full_name || !email || !password || !role) { showToast('Please fill in all required fields', 'error'); return; }
    if (!['farmer','expert','company','delivery'].includes(role)) { showToast('Please select a valid role', 'error'); return; }
    if (password !== confirm) { showToast('Passwords do not match', 'error'); return; }
    if (password.length < 8)  { showToast('Password must be at least 8 characters', 'error'); return; }

    submitBtn.disabled = true; submitBtn.textContent = 'Creating account…';
    try {
      const body = new FormData();
      body.append('full_name', full_name);
      body.append('email',     email);
      body.append('password',  password);
      body.append('role',      role);

      // Optional role-specific fields
      const extras = ['phone','location','specialization','years_experience','expertise_tags','company_name','company_address','company_phone','company_email','company_description'];
      extras.forEach(k => { const el = document.getElementById(k); if (el?.value.trim()) body.append(k, el.value.trim()); });

      const res = await api.post('/auth/register', body);
      Auth.setSession(res.data);
      showToast('Account created!', 'success');
      setTimeout(() => redirectToDashboard(res.data.user.role), 700);
    } catch (err) {
      showToast(err.message || 'Registration failed', 'error');
      submitBtn.disabled = false; submitBtn.textContent = 'Create Account';
    }
  });

  // Password toggles
  document.querySelectorAll('[data-icon="visibility"]').forEach(icon => {
    icon.style.cursor = 'pointer';
    icon.addEventListener('click', () => {
      const inp = icon.closest('.relative').querySelector('input');
      if (!inp) return;
      inp.type = inp.type === 'password' ? 'text' : 'password';
      icon.textContent = inp.type === 'password' ? 'visibility' : 'visibility_off';
    });
  });
});
