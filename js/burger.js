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
    // Four states to handle:
    //
    //   1. button + drawer both exist (e.g. /index)
    //      → just wire (idempotent) and return.
    //   2. button exists but drawer is missing (PR #146 outlier:
    //      shipped the inline JS that referenced #mobile-menu but
    //      not the drawer DIV itself — that's why /faq and /proof
    //      burgers do nothing in production).
    //      → drop the orphan button + inject a fresh pair.
    //   3. drawer exists but no button (no real-world case yet but
    //      defended for symmetry).
    //      → drop the orphan drawer + inject a fresh pair.
    //   4. neither exists (e.g. /auth, /account).
    //      → inject from scratch.
    var existingBtn = document.querySelector('.nav-burger');
    var existingMenu = document.getElementById('mobile-menu');

    if (existingBtn && existingMenu) {
      if (existingBtn.dataset.burgerWired === '1') return;
      wireExistingBurger(existingBtn);
      existingBtn.dataset.burgerWired = '1';
      return;
    }

    // Any partial state → reset to clean injection.
    if (existingBtn) existingBtn.remove();
    if (existingMenu) existingMenu.remove();

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

  /* Wire a burger that's already in the DOM (inline-markup pages).
     The previous version cloned the <button> to drop stale handlers
     and re-attached fresh ones — that survived /faq but the user
     still reports the burger as unresponsive on /faq AND /proof.

     This version uses event delegation: one capture-phase click
     listener on `document` that walks up from the event target with
     `closest('.nav-burger')`. Because the listener lives on document,
     it survives every possible mutation downstream — node clones,
     stacking-context overlays, re-renders by the inline script. It
     also stops the event in the capture phase so any conflicting
     bubble-phase handler on the burger itself never fires.

     The same pattern handles .mobile-close and the in-drawer links
     (close the drawer after tapping a link). Escape key closes too. */
  function wireExistingBurger(originalBtn) {
    var menu = document.getElementById('mobile-menu');
    if (!menu) return;

    function setOpen(open) {
      var burger = document.querySelector('.nav-burger');
      if (burger) burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      menu.setAttribute('aria-hidden', open ? 'false' : 'true');
      menu.classList.toggle('open', open);
      document.body.classList.toggle('menu-open', open);
    }

    // Capture-phase delegate — runs before any other click handler
    // that might be attached to the button by the inline script.
    document.addEventListener('click', function (e) {
      // Tap on the burger (or any descendant span).
      if (e.target.closest('.nav-burger')) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(!menu.classList.contains('open'));
        return;
      }
      // Tap on the drawer's close button.
      if (e.target.closest('.mobile-close')) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        return;
      }
      // Tap on a link inside the open drawer → close after the link
      // would navigate. We don't preventDefault here so the link
      // still fires.
      if (menu.classList.contains('open') && e.target.closest('.mobile-menu a')) {
        setOpen(false);
      }
    }, true);

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
