/* ──────────────────────────────────────────────────────────────────
   js/hero-effects.js
   ──────────────────────────────────────────────────────────────────
   Three small visual effects bundled together because they all want
   to run as soon as the hero is on screen, and they were already
   shipping in a single IIFE across /engine, /features, /sources:

     1. PARTICLES — a 30-particle canvas overlay that drifts and
        connects neighbours within CN px; gently pushes away from
        the cursor when it's near.
     2. CURSOR GLOW — a soft mint halo that follows the mouse, used
        sparingly to keep the dark UI feeling alive on desktop.
     3. REVEAL OBSERVER — fades in any element with class="reveal"
        when it scrolls into the viewport.

   Why this is one file: extracting them separately would mean three
   network requests for the same three pages. They run together,
   they ship together. Mobile pages without these effects (anything
   without #particles-canvas, etc.) don't load this file at all.

   How to opt in:
     <canvas id="particles-canvas"></canvas>
     <div class="cursor-glow" id="cursor-glow"></div>
     <script src="/js/hero-effects.js" defer></script>

   Each block is independently guarded (`if (!el) return;`) so the
   file is safe to load on a page that ships only one of the three.
   ────────────────────────────────────────────────────────────────── */
;(function () {
  // Mobile (<761 px) hides #particles-canvas and .cursor-glow via
  // css/mobile-fixes.css, but the JS would still attach a mousemove
  // listener and run a 60 fps RAF on an invisible canvas — 30
  // particles × ~29 neighbour checks per frame = ~50 k distance
  // calculations per second for nothing visible. Skip on mobile.
  //
  // Same logic for users with prefers-reduced-motion: skip the
  // continuous particle animation and the cursor-glow chase.
  var hasMM = typeof window.matchMedia === 'function';
  var isMobile = hasMM && window.matchMedia('(max-width: 760px)').matches;
  var prefersReduced = hasMM && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var canvas = document.getElementById('particles-canvas');
  if (!canvas) return;
  if (isMobile || prefersReduced) {
    // Either mobile (where CSS hides the canvas) or a user who's
    // explicitly opted out of motion. The canvas stays present but
    // empty — no paint cost since draw() never runs.
    return;
  }

  var ctx = canvas.getContext('2d'),
      particles = [],
      C = 30,        // particle count
      MR = 120,      // mouse radius
      MF = 0.8,      // mouse force
      CN = 110,      // connect-neighbour radius
      mouse = { x: -9999, y: -9999, a: false };

  var COLS = [
    [0, 255, 157], [0, 255, 200], [0, 200, 130],
    [255, 255, 255], [120, 255, 200],
  ];

  function rs() { canvas.width = innerWidth; canvas.height = innerHeight; }
  addEventListener('resize', rs); rs();

  document.addEventListener('mousemove', function (e) {
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.a = true;
  });
  document.addEventListener('mouseleave', function () { mouse.a = false; });

  function mk() {
    var c = COLS[Math.random() * COLS.length | 0];
    return {
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      r: Math.random() * 1.5 + 0.5,
      c: c,
      a: Math.random() * 0.25 + 0.08,
    };
  }
  for (var i = 0; i < C; i++) particles.push(mk());

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      if (mouse.a) {
        var dx = p.x - mouse.x, dy = p.y - mouse.y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < MR) {
          var f = MF * (1 - d / MR);
          p.vx += dx / d * f;
          p.vy += dy / d * f;
        }
      }
      p.x += p.vx; p.y += p.vy;
      p.vx *= 0.99; p.vy *= 0.99;
      // Wrap-around so we never run out of particles on screen.
      if (p.x < 0) p.x = canvas.width;
      if (p.x > canvas.width) p.x = 0;
      if (p.y < 0) p.y = canvas.height;
      if (p.y > canvas.height) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(' + p.c.join(',') + ',' + p.a + ')';
      ctx.fill();
      // Connect neighbouring particles with a faint line.
      for (var j = i + 1; j < particles.length; j++) {
        var q = particles[j];
        var dx2 = p.x - q.x, dy2 = p.y - q.y;
        var d2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
        if (d2 < CN) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.strokeStyle = 'rgba(0,229,176,' + (0.06 * (1 - d2 / CN)) + ')';
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  }
  draw();

  // ── 2. CURSOR GLOW ──
  var glow = document.getElementById('cursor-glow');
  if (glow) {
    document.addEventListener('mousemove', function (e) {
      glow.style.left = e.clientX + 'px';
      glow.style.top = e.clientY + 'px';
      glow.style.opacity = '1';
    });
    document.addEventListener('mouseleave', function () {
      glow.style.opacity = '0';
    });
  }

})();
