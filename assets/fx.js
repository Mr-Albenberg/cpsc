// Light visual effects: cursor glow, scroll reveals, count-ups, tilt. No libraries, no work while idle.
(function () {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(pointer: fine)').matches;
  const page = location.pathname.split('/').pop() || 'index.html';
  const lite = page === 'scan.html'; // keep the scanner as light as possible

  // 1) Cursor spotlight on cards/tiles/buttons: sets --mx/--my on the hovered element only
  if (finePointer && !reduce) {
    let raf = 0, target = null, ev = null;
    document.addEventListener('pointermove', (e) => {
      ev = e; target = e.target.closest?.('.glow, .card, .tile, .sponsor, .panel, .price-card, .ticket, .member-card, .btn, .cta-band');
      if (!target || raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0; if (!target) return;
        const r = target.getBoundingClientRect();
        target.style.setProperty('--mx', (ev.clientX - r.left) + 'px');
        target.style.setProperty('--my', (ev.clientY - r.top) + 'px');
      });
    }, { passive: true });
  }

  if (lite) return;

  // 3) Count-up for the stats row (1941, 1,000+, 7–8, #2)
  const counters = document.querySelectorAll('.stats b');
  if (counters.length && !reduce && 'IntersectionObserver' in window) {
    const run = (b) => {
      const txt = b.textContent, m = txt.match(/\d[\d,]*/);
      if (!m) return;
      const end = parseInt(m[0].replace(/,/g, ''), 10), from = end > 1000 && end < 2100 ? end - 60 : 0;
      const t0 = performance.now(), dur = 650;
      const step = (t) => {
        const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        const v = Math.round(from + (end - from) * e);
        b.textContent = txt.replace(m[0], end >= 10000 || m[0].includes(',') ? v.toLocaleString() : String(v));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    const io2 = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { run(en.target); io2.unobserve(en.target); } }), { threshold: 0.6 });
    counters.forEach((b) => io2.observe(b));
  }

  // 4) Gentle 3D tilt on tiles, sponsor logos and the member card (mouse only)
  if (finePointer && !reduce) {
    let cur = null, raf = 0, pos = null;
    const reset = (el) => { el.style.transition = ''; el.style.transform = ''; };
    document.addEventListener('pointermove', (e) => {
      const el = e.target.closest?.('.tile, .sponsor, .member-card, .price-card');
      if (cur && cur !== el) reset(cur);
      cur = el; pos = e;
      if (!el || raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0; if (!cur) return;
        cur.style.transition = 'transform .08s linear';
        const r = cur.getBoundingClientRect();
        const x = (pos.clientX - r.left) / r.width - 0.5, y = (pos.clientY - r.top) / r.height - 0.5;
        const max = cur.classList.contains('member-card') ? 5 : 7;
        cur.style.transform = `perspective(900px) rotateX(${(-y * max).toFixed(2)}deg) rotateY(${(x * max).toFixed(2)}deg) translateY(-3px)`;
      });
    }, { passive: true });
    document.addEventListener('pointerleave', () => cur && reset(cur), true);
  }

  // 5) Header lifts with a glow once you scroll
  const header = () => document.querySelector('.site-header');
  let ticking = false;
  addEventListener('scroll', () => {
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => { header()?.classList.toggle('scrolled', scrollY > 8); ticking = false; });
  }, { passive: true });
})();
