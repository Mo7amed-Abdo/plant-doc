document.addEventListener('DOMContentLoaded', () => {
  if (typeof requireAuth === 'function') {
    if (!requireAuth('farmer')) return;
  }

  const state = {
    overall_rating: 0,
    category_ratings: {
      ai_diagnosis_accuracy: null,
      expert_support: null,
      treatment_effectiveness: null,
      speed_performance: null,
    },
    tags: new Set(),
    comment: '',
    impact: '',
  };

  initOverallStars();
  initCategoryCards();
  initChips();
  initComment();
  initImpact();
  initSubmit();

  function initOverallStars() {
    const wrap = document.getElementById('overall-stars');
    const hint = document.getElementById('overall-hint');
    const emoji = document.getElementById('overall-emoji');
    if (!wrap) return;

    wrap.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-value]');
      if (!btn) return;
      state.overall_rating = Number(btn.getAttribute('data-value'));
      renderStars(wrap, state.overall_rating, 'text-primary', 'text-outline', 'text-4xl');
      if (hint) hint.textContent = ratingHint(state.overall_rating);
      if (emoji) emoji.textContent = ratingEmoji(state.overall_rating);
    });

    renderStars(wrap, state.overall_rating, 'text-primary', 'text-outline', 'text-4xl');
  }

  function initCategoryCards() {
    document.querySelectorAll('[data-category]').forEach((card) => {
      const key = card.getAttribute('data-category');
      const starsWrap = card.querySelector('.pd-cat-stars');
      if (!key || !starsWrap) return;

      // Render 5 stars
      starsWrap.innerHTML = Array.from({ length: 5 }).map((_, i) => (
        `<button type="button" class="pd-star-sm" data-value="${i + 1}">
          <span class="material-symbols-outlined text-sm text-outline">star</span>
        </button>`
      )).join('');

      starsWrap.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-value]');
        if (!btn) return;
        const val = Number(btn.getAttribute('data-value'));
        state.category_ratings[key] = val;
        renderStars(starsWrap, val, 'text-primary', 'text-outline', 'text-sm');
      });

      renderStars(starsWrap, state.category_ratings[key] || 0, 'text-primary', 'text-outline', 'text-sm');
    });
  }

  function initChips() {
    const wrap = document.getElementById('tag-chips');
    if (!wrap) return;
    wrap.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-tag]');
      if (!btn) return;
      const tag = btn.getAttribute('data-tag');
      if (!tag) return;

      const selected = state.tags.has(tag);
      if (selected) state.tags.delete(tag);
      else state.tags.add(tag);

      btn.classList.toggle('bg-primary', !selected);
      btn.classList.toggle('text-white', !selected);
      btn.classList.toggle('text-primary', selected);
    });
  }

  function initComment() {
    const textarea = document.getElementById('feedback-comment');
    const counter = document.getElementById('comment-counter');
    if (!textarea || !counter) return;

    const update = () => {
      state.comment = textarea.value || '';
      counter.textContent = `${state.comment.length} / 500`;
    };
    textarea.addEventListener('input', update);
    update();
  }

  function initImpact() {
    const buttons = document.querySelectorAll('.pd-impact[data-impact]');
    if (!buttons.length) return;

    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const impact = btn.getAttribute('data-impact') || '';
        state.impact = impact;
        buttons.forEach((b) => {
          b.classList.remove('bg-primary', 'text-white');
          b.classList.add('bg-surface-container-high', 'text-on-surface-variant');
        });
        btn.classList.remove('bg-surface-container-high', 'text-on-surface-variant');
        btn.classList.add('bg-primary', 'text-white');
      });
    });
  }

  function initSubmit() {
    const btn = document.getElementById('submit-feedback');
    if (!btn) return;

    btn.addEventListener('click', async () => {
      if (!state.overall_rating) return showToast('Please select an overall rating', 'error');
      btn.disabled = true;
      btn.style.opacity = '0.75';
      try {
        const payload = {
          overall_rating: state.overall_rating,
          category_ratings: state.category_ratings,
          tags: Array.from(state.tags),
          comment: state.comment,
          impact: state.impact,
        };
        await api.post('/feedback/plantdoc', payload);
        showToast('Thanks! Your feedback was submitted.', 'success');
        setTimeout(() => (window.location.href = '/frontend/farmer/ordertracking.html'), 900);
      } catch (err) {
        showToast(err.message || 'Failed to submit feedback', 'error');
      } finally {
        btn.disabled = false;
        btn.style.opacity = '1';
      }
    });
  }

  function renderStars(container, value, onCls, offCls, sizeCls) {
    const stars = container.querySelectorAll('span.material-symbols-outlined');
    stars.forEach((s, idx) => {
      const filled = idx < value;
      s.className = `material-symbols-outlined ${sizeCls} ${filled ? onCls : offCls} cursor-pointer transition-transform hover:scale-110`;
      s.style.fontVariationSettings = filled ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24";
    });
  }

  function ratingEmoji(n) {
    if (n >= 5) return '😍';
    if (n === 4) return '😊';
    if (n === 3) return '🙂';
    if (n === 2) return '😕';
    return '😞';
  }

  function ratingHint(n) {
    const map = { 1: 'Very poor', 2: 'Poor', 3: 'Okay', 4: 'Good', 5: 'Excellent' };
    return map[n] || 'Tap a star to rate';
  }
});
