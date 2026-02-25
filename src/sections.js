// ─── Scroll reveal ────────────────────────────────────────────────
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12 }
);

document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));

// ─── Counter animation ────────────────────────────────────────────
function animateCounter(el) {
  const target   = parseFloat(el.dataset.target);
  const decimals = parseInt(el.dataset.decimal ?? '0', 10);
  const duration = 1400;
  const start    = performance.now();

  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    // cubic ease-out
    const ease = 1 - Math.pow(1 - progress, 3);
    el.textContent = (ease * target).toFixed(decimals);
    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

const statsObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.querySelectorAll('.count').forEach(animateCounter);
        statsObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.3 }
);

const statsStrip = document.querySelector('.stats-strip');
if (statsStrip) statsObserver.observe(statsStrip);
