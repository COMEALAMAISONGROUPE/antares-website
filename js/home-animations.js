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
  function initTypewriter() {
    var section = document.querySelector('.cta-final');
    if (!section) return;
    var threat = section.querySelector('.cta-threat');
    var headline = section.querySelector('h2');
    if (!threat || !headline) return;

    if (prefersReduced) {
      // Land on the end state without the staircase: add all 4
      // marker classes so any other code (e.g. the audit) sees the
      // same DOM as a successful animation run.
      threat.classList.add('typewrite', 'typewrite-run', 'typewrite-done');
      headline.classList.add('typewrite', 'typewrite-headline', 'typewrite-run', 'typewrite-done');
      return;
    }

    // Tag the elements so the CSS knows to start them clipped.
    threat.classList.add('typewrite');
    headline.classList.add('typewrite', 'typewrite-headline');

    // Approximate the steps() value from the text length so the
    // staircase reveal lands one character at a time regardless of
    // copy length. Min 8 / max 60 keeps the cadence comfortable for
    // edge-case edits.
    function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
    var threatSteps = clamp((threat.textContent || '').trim().length, 8, 60);
    var headSteps = clamp((headline.textContent || '').trim().length, 8, 30);
    threat.style.setProperty('--steps', String(threatSteps));
    headline.style.setProperty('--steps', String(headSteps));

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        threat.classList.add('typewrite-run');
        // Fade the caret out once the threat line is done so the
        // headline's caret can take over without two cursors blinking
        // on screen at the same time.
        setTimeout(function () { threat.classList.add('typewrite-done'); }, 1200);
        // Start the headline once the threat line lands. 1.2s
        // matches the CSS transition; 100ms extra gives a beat
        // of silence before the punchline.
        setTimeout(function () {
          headline.classList.add('typewrite-run');
        }, 1300);
        setTimeout(function () { headline.classList.add('typewrite-done'); }, 2300);
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
