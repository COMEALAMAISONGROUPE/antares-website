/* ──────────────────────────────────────────────────────────────────
   js/faq-accordion.js
   ──────────────────────────────────────────────────────────────────
   Collapse the FAQ on mobile so the page is a scannable list of
   questions instead of 9 screens of dense Q&A.

   What the desktop already ships:
     <div class="qa">
       <h3>Question text</h3>
       <p>Answer text — sometimes multiple paragraphs / code / lists.</p>
     </div>

   What we want on mobile:
     - Only the <h3> is visible by default.
     - Tap the <h3> (or its caret) to reveal the answer.
     - Tap again to collapse.

   Desktop is untouched — this script no-ops above 760px viewport.
   CSS for the visual states lives in css/mobile-fixes.css.

   Loaded via:
     <script src="/js/faq-accordion.js" defer></script>
   ────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  function init() {
    // Only run the accordion on mobile. Desktop keeps every answer open.
    if (window.matchMedia('(min-width: 761px)').matches) return;

    var items = document.querySelectorAll('.qa');
    if (!items.length) return;

    items.forEach(function (qa) {
      var h3 = qa.querySelector('h3');
      if (!h3) return;

      // Collapsed by default. The CSS hides any sibling of <h3> when
      // the parent has the .qa-collapsed class.
      qa.classList.add('qa-collapsed');

      // Make the heading itself the click target (full-width tap zone
      // is friendlier than a tiny caret on a phone).
      h3.setAttribute('role', 'button');
      h3.setAttribute('tabindex', '0');
      h3.setAttribute('aria-expanded', 'false');
      h3.style.cursor = 'pointer';

      function toggle() {
        var willOpen = qa.classList.contains('qa-collapsed');
        qa.classList.toggle('qa-collapsed', !willOpen);
        h3.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      }
      h3.addEventListener('click', toggle);
      // Keyboard accessibility — Enter and Space activate the
      // disclosure, matching the native <details>/<summary> contract.
      h3.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
