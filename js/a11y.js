/* ──────────────────────────────────────────────────────────────────
   js/a11y.js
   ──────────────────────────────────────────────────────────────────
   Accessibility helpers that are easier to inject at runtime than to
   thread through 20 hand-maintained HTML pages.

     1. Skip-link
        Injects <a class="skip-link" href="#main">Skip to content</a>
        as the first focusable element of <body>. Hidden off-screen
        until focused (CSS in css/base.css). Tabbing once from page
        load reveals it; pressing Enter jumps to <main>.

   Why this lives in JS:
       Adding `<a class="skip-link">…</a>` + `id="main"` to every page
       would mean 20 hand-edits, with #146-style "forgot one" risk.
       This runs once per page, on DOMContentLoaded, idempotently.

   Load order:
       <script src="/js/a11y.js" defer></script>
   ────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  function init() {
    var main = document.querySelector('main');
    if (!main) return;                            // 404, og-generator
    if (document.querySelector('.skip-link')) return; // idempotent

    // Make <main> programmatically focusable so the skip-link can
    // hand focus over. tabindex=-1 means "focusable via JS only, not
    // in the natural tab order".
    if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
    if (!main.id) main.id = 'main';

    var link = document.createElement('a');
    link.className = 'skip-link';
    link.href = '#' + main.id;
    link.textContent = 'Skip to content';
    // When the user activates the link, also explicitly call .focus()
    // on <main>. Some browsers don't focus the target after a hash
    // navigation even when tabindex is set; this guarantees it.
    link.addEventListener('click', function (e) {
      e.preventDefault();
      // The hash change still happens so back-button history is sane.
      history.replaceState(null, '', '#' + main.id);
      main.focus({ preventScroll: false });
      main.scrollIntoView({ behavior: 'auto', block: 'start' });
    });

    document.body.insertBefore(link, document.body.firstChild);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
