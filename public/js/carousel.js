import { $, $$ } from './ui.js';

export function initCarousel(services) {
  const stage = $('#service-stage'); if (!stage) return;
  let current = 0;
  const cards = $$('.service-card', stage), dots = $$('.carousel-dots button');
  function update() {
    cards.forEach((card,index) => {
      let position = (index - current + cards.length) % cards.length;
      if (position > cards.length / 2) position -= cards.length;
      card.dataset.position = position;
      card.setAttribute('aria-hidden', String(position !== 0));
      card.inert = position !== 0;
    });
    dots.forEach((dot,index) => dot.setAttribute('aria-current', String(index === current)));
    $('#carousel-caption').textContent = `${services[current].title} — ${services[current].description}`;
    $('#carousel-count').textContent = `${String(current + 1).padStart(2,'0')} / ${String(cards.length).padStart(2,'0')}`;
  }
  const move = direction => { current = (current + direction + cards.length) % cards.length; update(); };
  $('#service-prev').addEventListener('click', () => move(-1));
  $('#service-next').addEventListener('click', () => move(1));
  dots.forEach((dot,index) => dot.addEventListener('click', () => { current = index; update(); }));
  $('#services').addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); move(event.key === 'ArrowLeft' ? -1 : 1); }
  });
  let start;
  stage.addEventListener('pointerdown', event => { start = event.clientX; });
  stage.addEventListener('pointerup', event => { if (start !== undefined && Math.abs(event.clientX - start) > 45) move(event.clientX < start ? 1 : -1); start = undefined; });
  stage.addEventListener('pointercancel', () => { start = undefined; });
  update();
}
