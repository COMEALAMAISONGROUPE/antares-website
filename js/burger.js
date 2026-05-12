/* ──────────────────────────────────────────────────────────────────
   burger.js
   ──────────────────────────────────────────────────────────────────
   Drop-in mobile burger menu. Reads the desktop <nav> .links and
   .nav-actions of the host page (no matter the surrounding wrapper
   — <header><nav>, plain <nav>, .nav-inner...) and injects:
     1. A burger button (hamburger / X icon) into the <nav>.
     2. A fullscreen drawer (<div class="mobile-menu">) into <body>.

   The injected markup mirrors what live pages (index, pricing, etc.)
   already ship inline, so the styles in css/mobile-fixes.css apply
   identically. Pages that already ship the burger inline are skipped
   so we don't double-inject.

   Load order in <head>:
     <link rel="stylesheet" href="/css/mobile-fixes.css">
     <script src="/js/burger.js" defer></script>
   ────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  function init() {
    // If the page already ships a .nav-burger markup (15 of the pages
    // patched by PR #146 do, inline), don't inject a second one — but
    // DO wire it ourselves if it isn't already responding. Pages we
    // load this script on need their burger functional regardless of
    // whether the inline <script> ran. Idempotency is guarded by the
    // data-burger-wired attribute.
    var existing = document.querySelector('.nav-burger');
    if (existing) {
      if (existing.dataset.burgerWired === '1') return;
      wireExistingBurger(existing);
      existing.dataset.burgerWired = '1';
      return;
    }

    var nav = document.querySelector('header nav, nav .nav-inner, nav');
    if (!nav) return;

    // Find the link group the desktop nav uses. We try .links first;
    // if absent, fall back to the nav itself (so we still grab top-
    // level <a> children).
    var linksGroup = nav.querySelector('.links');
    var sourceLinks = linksGroup
      ? linksGroup.querySelectorAll('a')
      : nav.querySelectorAll(':scope > a:not(.brand)');
    if (!sourceLinks.length) return;

    // Optional CTA group (Log in / Install) — only some pages have it.
    var actionsGroup = nav.querySelector('.nav-actions');

    // ── Burger button ─────────────────────────────────────────────
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nav-burger';
    btn.setAttribute('aria-label', 'Open menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'mobile-menu');
    btn.innerHTML = '<span></span><span></span><span></span>';

    // Append the burger to the nav that hosts the links so its
    // position relative to .links is correct (right side of the bar).
    var navHost = linksGroup ? linksGroup.parentElement : nav;
    navHost.appendChild(btn);

    // ── Drawer ────────────────────────────────────────────────────
    var menu = document.createElement('div');
    menu.className = 'mobile-menu';
    menu.id = 'mobile-menu';
    menu.setAttribute('aria-hidden', 'true');

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'mobile-close';
    closeBtn.setAttribute('aria-label', 'Close menu');
    closeBtn.innerHTML = '&times;';

    var mobileLinks = document.createElement('nav');
    mobileLinks.className = 'mobile-links';
    mobileLinks.setAttribute('aria-label', 'Mobile navigation');
    sourceLinks.forEach(function (src) {
      var a = document.createElement('a');
      a.href = src.getAttribute('href') || '#';
      a.textContent = (src.textContent || '').trim();
      mobileLinks.appendChild(a);
    });

    menu.appendChild(closeBtn);
    menu.appendChild(mobileLinks);

    if (actionsGroup) {
      var mobileActions = document.createElement('div');
      mobileActions.className = 'mobile-actions';
      actionsGroup.querySelectorAll('a').forEach(function (src) {
        var a = document.createElement('a');
        a.href = src.getAttribute('href') || '#';
        a.textContent = (src.textContent || '').trim();
        // Preserve the install-CTA vs login-link distinction the inline
        // version uses, so the styles in css/mobile-fixes.css apply.
        a.className = src.classList.contains('nav-cta') ? 'm-install' : 'm-login';
        mobileActions.appendChild(a);
      });
      menu.appendChild(mobileActions);
    }

    document.body.appendChild(menu);

    // ── Behaviour ─────────────────────────────────────────────────
    function setOpen(open) {
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      menu.setAttribute('aria-hidden', open ? 'false' : 'true');
      menu.classList.toggle('open', open);
      document.body.classList.toggle('menu-open', open);
    }
    btn.addEventListener('click', function () {
      setOpen(!menu.classList.contains('open'));
    });
    closeBtn.addEventListener('click', function () {
      setOpen(false);
    });
    mobileLinks.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { setOpen(false); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.classList.contains('open')) setOpen(false);
    });

    // Highlight the current page in the drawer.
    var here = location.pathname.replace(/\/$/, '').replace(/\.html$/, '') || '/';
    mobileLinks.querySelectorAll('a').forEach(function (a) {
      var href = (a.getAttribute('href') || '').replace(/^\.\//, '/').replace(/\.html$/, '');
      if (href === here || (here === '/' && href === '/')) a.classList.add('active');
    });
  }

  /* Wire a burger that's already in the DOM (inline-markup pages) so
     it actually responds to taps. The inline version on most pages
     already runs its own toggle script — but on a couple of pages
     that script silently fails (faq.html most visibly). Re-wiring
     from a single source of truth fixes those and is idempotent
     thanks to the data-burger-wired flag set by the caller.
     We replace the button node first so any stale handlers attached
     by the inline script are dropped (the new clean clone gets fresh
     handlers below). The drawer / closeBtn / links are left in place
     — adding extra listeners there is harmless because their effect
     is idempotent toggling. */
  function wireExistingBurger(originalBtn) {
    var menu = document.getElementById('mobile-menu');
    if (!menu) return;

    var btn = originalBtn.cloneNode(true);
    originalBtn.parentNode.replaceChild(btn, originalBtn);

    var closeBtn = menu.querySelector('.mobile-close');
    var links = menu.querySelectorAll('a');

    function setOpen(open) {
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      menu.setAttribute('aria-hidden', open ? 'false' : 'true');
      menu.classList.toggle('open', open);
      document.body.classList.toggle('menu-open', open);
    }
    btn.addEventListener('click', function () {
      setOpen(!menu.classList.contains('open'));
    });
    if (closeBtn) {
      closeBtn.addEventListener('click', function () { setOpen(false); });
    }
    links.forEach(function (a) {
      a.addEventListener('click', function () { setOpen(false); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.classList.contains('open')) setOpen(false);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
