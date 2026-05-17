/* ──────────────────────────────────────────────────────────────────
   js/home-animations.js
   ──────────────────────────────────────────────────────────────────
   Two entrance animations specific to the home page, triggered once
   each via IntersectionObserver so they don't fire until the user
   scrolls the section into view:

     A1 — Counter tick-up on the "$2.8B" loss-strip number.
          The markup already ships <span id="loss-counter"
          data-target="2.8">0.0</span> waiting for a script to drive
          it; this is that script.

     B1 — Typewriter on the "ANTARES WILL." cta-final. The threat
          line types out in ~1.2 s, then the headline types out in
          ~1.0 s. Implemented with clip-path:inset() animated under
          steps() so the reveal lands character-by-character instead
          of as a smooth wipe.

   Both run on desktop AND mobile (no media-query gate). They depend
   only on the markup that's already in index.html — if the
   selectors don't match (page refactor, etc.) the script no-ops.

   Loaded via:
     <script src="/js/home-animations.js" defer></script>
   in the <head> of index.html.
   ────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  // Respect prefers-reduced-motion. Users with it set see the final
  // state immediately — counter shows "2.8", typewriter shows the
  // text without the staircase reveal. Same information, no motion.
  var prefersReduced = typeof window.matchMedia === 'function' &&
                       window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── A1: counter tick-up ─────────────────────────────────────── */
  function initCounter() {
    var el = document.getElementById('loss-counter');
    if (!el) return;

    var target = parseFloat(el.getAttribute('data-target') || '2.8');
    if (!isFinite(target) || target <= 0) return;

    if (prefersReduced) {
      el.textContent = target.toFixed(1);
      return;
    }

    // Lock the rendered width to the FINAL value so the number
    // doesn't reflow as the digits change (0.0 → 2.8 has the same
    // glyph count, so this is mostly defensive).
    el.style.minWidth = el.offsetWidth + 'px';
    el.style.display = 'inline-block';
    el.style.textAlign = 'right';
    el.textContent = '0.0';

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        run();
        observer.disconnect();
      });
    }, { threshold: 0.4 });
    observer.observe(el);

    function run() {
      var start = performance.now();
      var duration = 1600;
      function tick(now) {
        var raw = Math.min(1, (now - start) / duration);
        // easeOutExpo — feels like the number is "settling" rather
        // than counting linearly. Matches the visual weight of the
        // huge red glyph.
        var eased = raw === 1 ? 1 : 1 - Math.pow(2, -10 * raw);
        el.textContent = (eased * target).toFixed(1);
        if (raw < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }
  }

  /* ── B1: typewriter on the bottom cta-final ──────────────────── */
  // Only animates the .cta-threat (the "next rug pull won't warn you"
  // eyebrow). The H2 headline ("ANTARES WILL.") stays with its
  // inline-CSS .glitch effect untouched — the typewriter's clip-path
  // and ::after caret used to override the glitch's ::before/::after
  // pseudo-elements, breaking the colored-offset glitch on hover.
  function initTypewriter() {
    var section = document.querySelector('.cta-final');
    if (!section) return;
    var threat = section.querySelector('.cta-threat');
    if (!threat) return;

    if (prefersReduced) {
      threat.classList.add('typewrite', 'typewrite-run', 'typewrite-done');
      return;
    }

    threat.classList.add('typewrite');

    function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
    var threatSteps = clamp((threat.textContent || '').trim().length, 8, 60);
    threat.style.setProperty('--steps', String(threatSteps));

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        threat.classList.add('typewrite-run');
        setTimeout(function () { threat.classList.add('typewrite-done'); }, 1200);
        observer.disconnect();
      });
    }, { threshold: 0.35 });
    observer.observe(section);
  }

  function init() {
    initCounter();
    initTypewriter();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
