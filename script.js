/* NAV — shrink & frost on scroll */
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 50);
}, { passive: true });

/* SCROLL REVEAL */
const revealObserver = new IntersectionObserver(
  entries => entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('in-view');
      revealObserver.unobserve(e.target);
    }
  }),
  { threshold: 0.1, rootMargin: '0px 0px -60px 0px' }
);
document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

/* HERO PARALLAX — title drifts subtly on scroll */
const heroTitle = document.getElementById('heroTitle');
window.addEventListener('scroll', () => {
  if (!heroTitle) return;
  const y = window.scrollY;
  if (y < window.innerHeight) {
    heroTitle.style.transform = `translateY(${y * 0.12}px)`;
  }
}, { passive: true });
