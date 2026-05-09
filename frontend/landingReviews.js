document.addEventListener('DOMContentLoaded', () => {
  const cards = Array.from(document.querySelectorAll('[data-pd-review]'));
  if (!cards.length || typeof api === 'undefined') return;

  load().catch(() => null);

  async function load() {
    const res = await api.get('/feedback/plantdoc/recent?limit=3');
    const items = res?.data;
    if (!Array.isArray(items) || !items.length) return;

    items.slice(0, cards.length).forEach((item, idx) => {
      const card = cards[idx];
      const starsWrap = card.querySelector('[data-pd-stars]');
      const quote = card.querySelector('[data-pd-quote]');
      const avatar = card.querySelector('[data-pd-avatar]');
      const author = card.querySelector('[data-pd-author]');
      const rating = Number(item.overall_rating) || 0;
      const comment = String(item.comment || '').trim();

      if (starsWrap) starsWrap.innerHTML = renderStars(rating, card.getAttribute('data-stars-color') || 'text-primary');
      if (quote) quote.textContent = comment ? `"${comment}"` : '"Great experience with PlantDoc."';
      if (author) author.textContent = String(item.author_name || 'Farmer');
      if (avatar && item.author_avatar) avatar.src = item.author_avatar;
    });
  }

  function renderStars(n, cls) {
    const filled = Math.max(0, Math.min(5, n));
    return Array.from({ length: 5 }).map((_, i) => {
      const isFill = i < filled;
      const fillSetting = isFill ? "'FILL' 1" : "'FILL' 0";
      const color = isFill ? cls : 'text-outline';
      return `<span class="material-symbols-outlined ${color}" style="font-variation-settings: ${fillSetting}, 'wght' 400, 'GRAD' 0, 'opsz' 24;">star</span>`;
    }).join('');
  }
});
