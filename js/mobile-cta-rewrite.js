/* ──────────────────────────────────────────────────────────────────
   js/mobile-cta-rewrite.js
   ──────────────────────────────────────────────────────────────────
   Antares is a Chrome extension — you cannot install it from an
   iPhone or Android browser. Yet every "Install →" CTA on the site
   points at /install and renders the same blunt copy on both
   devices. A mobile user tapping "Install" lands on a page that
   asks them to "Click 'Add to Chrome'" — a button that, on iOS
   Safari, doesn't exist.

   This script rewrites the CTA copy on mobile only so the call to
   action matches what the user can actually do: open the site on
   a desktop browser. The link still points at /install so the user
   can preview the install steps if they want, but the prominent
   action they see is honest.

   Desktop is untouched — the script bails out above 760px viewport.
   /install itself is also skipped: the user is already on the page
   they were going to be redirected to, so rewriting the nav CTA
   there to "Open on desktop ↗" would be confusing.

   Loaded via:
     <script src="/js/mobile-cta-rewrite.js" defer></script>
   ────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  // Desktop short-circuit
  if (window.matchMedia('(min-width: 761px)').matches) return;

  // Don't rewrite on /install — the page is the destination anyway,
  // re-stating the prompt would be confusing.
  var path = location.pathname.replace(/\/+$/, '').toLowerCase();
  if (/\/install(\.html)?$/.test(path)) return;

  // Match links that point at our own /install page. We accept the
  // three variants the codebase ships (./install, /install,
  // install.html) and explicitly reject anything else (notably
  // chrome.google.com/webstore links, which already do the right
  // thing).
  var rx = /^(\.\/)?install(\.html)?(\?|#|$)/i;

  document.querySelectorAll('a[href]').forEach(function (a) {
    var href = (a.getAttribute('href') || '').trim();
    var normalised = href.replace(/^\.?\/+/, '');
    if (!rx.test(href) && !rx.test(normalised)) return;

    var text = (a.textContent || '').trim();
    if (!/install/i.test(text)) return;

    // Preserve the link's classes/styling — we just swap the copy.
    a.textContent = 'Open on desktop ↗';
    a.setAttribute('data-mobile-rewritten', 'install');
  });

  // Pricing tier buttons: the Pro and Yearly tiers open a checkout
  // modal that calls window.open() → NOWPayments. Popups are
  // unreliable on mobile (iOS Safari often blocks; Android opens
  // the URL but the in-tab UX is rough). Rewrite + disable the
  // click so we redirect the user to desktop instead of letting
  // them hit a broken flow.
  document.querySelectorAll('button.tier-cta.primary, button.tier-cta.purple').forEach(function (btn) {
    btn.textContent = 'Subscribe on desktop ↗';
    btn.setAttribute('data-mobile-rewritten', 'tier-cta');
    // Capture-phase listener so we beat the inline handler attached
    // by pricing.html's own checkout script.
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }, true);
  });
})();
