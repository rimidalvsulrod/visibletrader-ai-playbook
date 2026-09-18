document.getElementById("year").textContent = new Date().getFullYear();

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Cursor-follow spotlight on CTAs
document.querySelectorAll(".cta").forEach((el) => {
  el.addEventListener("pointermove", (e) => {
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  });
});

function countUp(el) {
  const target = Number(el.dataset.count);
  const prefix = el.dataset.prefix || "";
  if (reduceMotion) { el.textContent = prefix + target; return; }
  const duration = 1400;
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 4);
    el.textContent = prefix + Math.round(target * eased);
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const io = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add("in");
    entry.target.querySelectorAll("[data-count]").forEach(countUp);
    io.unobserve(entry.target);
  });
}, { threshold: 0.2 });

document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
