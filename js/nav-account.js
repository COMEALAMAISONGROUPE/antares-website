/* ──────────────────────────────────────────────────────────────────
   js/nav-account.js
   ──────────────────────────────────────────────────────────────────
   Swaps the desktop nav's "Log in" link for "Account" when the user
   has an active session with the auth API.

   Why this lives here:
     The same 615-byte inline <script> was previously copy-pasted into
     15 pages. The next change to login UX would have meant editing
     15 files (and probably forgetting one — see PR #146).

   How it's used:
     <script src="/js/nav-account.js" defer></script>
     <a id="nav-account" class="nav-account" href="./auth">Log in</a>

     The script no-ops if #nav-account is not in the DOM, so it's
     safe to load on /auth and /account themselves (they don't have
     the desktop nav link).

   Strategy:
     1. On load, optimistically read localStorage('antares.signed-in')
        and update the link if the flag is set. This avoids the
        "Log in" → "Account" flicker for returning users.
     2. In parallel, hit /api/auth/me to confirm or refute. The
        result is mirrored back to localStorage so step 1 stays
        accurate.
   ────────────────────────────────────────────────────────────────── */
(function () {
  var el = document.getElementById('nav-account');
  if (!el) return;

  function setSignedIn() {
    el.textContent = 'Account';
    el.href = './account';
    el.setAttribute('aria-label', 'Account');
  }
  function setSignedOut() {
    el.textContent = 'Log in';
    el.href = './auth';
    el.setAttribute('aria-label', 'Log in');
  }

  try {
    if (localStorage.getItem('antares.signed-in') === '1') setSignedIn();
  } catch (_) { /* localStorage may be disabled (Safari private, etc.) */ }

  fetch('https://antares-extension.vercel.app/api/auth/me', { credentials: 'include' })
    .then(function (r) {
      if (r.ok) {
        setSignedIn();
        try { localStorage.setItem('antares.signed-in', '1'); } catch (_) {}
      } else {
        setSignedOut();
        try { localStorage.removeItem('antares.signed-in'); } catch (_) {}
      }
    })
    .catch(function () { /* offline — leave the optimistic state alone */ });
})();
