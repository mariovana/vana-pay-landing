/* vana pay landing — animaciones de scroll (ref. Klarna).
 * Dos patrones: .reveal (fade-up al entrar al viewport, una vez) y
 * .wl-item (la línea centrada en el viewport se "enciende" con .lit).
 * Con prefers-reduced-motion todo queda estático via html.no-anim. */
(function () {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !("IntersectionObserver" in window)) {
    document.documentElement.classList.add("no-anim");
    return;
  }

  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });

  // word-list: exactamente UN ítem encendido — el más cercano al centro
  // del viewport mientras la lista sea visible (ref. Klarna).
  var wlItems = [];
  var ticking = false;

  function litUpdate() {
    ticking = false;
    if (!wlItems.length) return;
    var center = window.innerHeight / 2;
    var best = null, bestD = Infinity;
    wlItems.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return;
      var d = Math.abs((r.top + r.bottom) / 2 - center);
      if (d < bestD) { bestD = d; best = el; }
    });
    wlItems.forEach(function (el) {
      el.classList.toggle("lit", el === best);
    });
  }

  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(litUpdate);
    }
  }

  function arm(root) {
    (root || document).querySelectorAll(".reveal:not(.in)").forEach(function (el) {
      io.observe(el);
    });
    wlItems = Array.prototype.slice.call(document.querySelectorAll(".wl-item"));
    litUpdate();
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  arm();
  window.VPanim = { arm: arm };
})();
