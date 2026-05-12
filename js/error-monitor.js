/* ──────────────────────────────────────────────────────────────────
   js/error-monitor.js
   ──────────────────────────────────────────────────────────────────
   Self-contained client-side error catcher. Catches:

     - window.onerror          (synchronous JS errors)
     - unhandledrejection      (promise rejections that nobody caught)
     - error event on document (failed resource loads — img, link,
                                script — captures phase so it bubbles
                                up even from descendant elements)

   Throttling:
     - Max 10 reports per page load (after that, silent drop)
     - 500ms minimum between reports (debounces a tight error loop)
     - In-memory dedupe by message+file+line so identical errors
       fire once per page

   Transport:
     - Tries `navigator.sendBeacon` first (survives page navigation)
     - Falls back to `fetch` with keepalive
     - Default endpoint is null → no network calls. To enable real
       reporting, set window.ANTARES_ERROR_ENDPOINT before this
       script loads, or edit the DEFAULT_ENDPOINT below to point at
       /api/error or a Sentry/Logflare ingest URL.

   Why this lives here, not in nav-account.js or burger.js:
     Those have specific responsibilities. The error monitor is
     cross-cutting — every page benefits, and it should run BEFORE
     any other JS so it can catch errors in those scripts too.

   Load order (first in <head>, no defer):
     <script src="/js/error-monitor.js"></script>
   ────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var DEFAULT_ENDPOINT = null; // set to '/api/error' or similar to enable
  var MAX_REPORTS = 10;
  var MIN_INTERVAL_MS = 500;

  var sent = 0;
  var lastSentAt = 0;
  var seen = Object.create(null);

  function endpoint() {
    return (typeof window !== 'undefined' && window.ANTARES_ERROR_ENDPOINT) ||
           DEFAULT_ENDPOINT;
  }

  function report(payload) {
    if (sent >= MAX_REPORTS) return;
    var now = Date.now();
    if (now - lastSentAt < MIN_INTERVAL_MS) return;

    // Dedupe by message + file + line. Identical errors only fire once.
    var key = (payload.message || '') + '|' + (payload.file || '') + '|' + (payload.line || '');
    if (seen[key]) return;
    seen[key] = true;

    sent++;
    lastSentAt = now;

    var url = endpoint();
    if (!url) {
      // No receiver wired up — log to console so devtools sees it
      // but don't burn a network request. Prefixed so it's filterable.
      // eslint-disable-next-line no-console
      console.warn('[antares-error-monitor]', payload);
      return;
    }

    var body = JSON.stringify({
      ...payload,
      url: location.href,
      ua: navigator.userAgent,
      at: new Date().toISOString(),
    });

    try {
      if (navigator.sendBeacon) {
        var blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon(url, blob);
        return;
      }
    } catch (_) { /* fall through to fetch */ }

    try {
      fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: body,
        keepalive: true,
      }).catch(function () { /* swallow — last thing we want is the
                               error reporter creating its own loop */ });
    } catch (_) { /* nothing more we can do */ }
  }

  window.addEventListener('error', function (e) {
    // Resource-load failures (img/link/script): e.target is the
    // failing element, e.message is empty, e.error is null.
    if (e.target && e.target !== window && e.target.tagName) {
      report({
        kind: 'resource-load',
        tag: e.target.tagName.toLowerCase(),
        src: e.target.src || e.target.href || '',
      });
      return;
    }
    // Synchronous JS errors.
    report({
      kind: 'error',
      message: (e.message || '').slice(0, 500),
      file: (e.filename || '').slice(0, 200),
      line: e.lineno || 0,
      col: e.colno || 0,
      stack: (e.error && e.error.stack ? e.error.stack : '').slice(0, 1000),
    });
  }, true); // capture phase so resource errors propagate

  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason || {};
    report({
      kind: 'unhandled-rejection',
      message: (typeof r === 'string' ? r : r.message || String(r)).slice(0, 500),
      stack: (r.stack || '').slice(0, 1000),
    });
  });
})();
