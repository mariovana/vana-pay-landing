/* vana pay landing — home. */
(function () {
  // CTA genérico de vana pay chat en "Formas de comprar".
  var ways = document.getElementById("waysChat");
  if (ways) {
    ways.href = window.VP.chatGenericLink();
    ways.target = "_blank";
    ways.rel = "noopener";
  }

  // Los montos del ejemplo salen de VP.paguitos() para que la fórmula del
  // paguito seguro viva en un solo lugar (los Q del HTML son fallback).
  var q = window.VP.paguitos(1500, null); // {n:5, per:408} con fee máximo
  document.querySelectorAll(".mock-row .amt, .pagui-line .amt").forEach(function (el) {
    if (el.textContent.trim()) el.textContent = window.VP.money(q.per);
  });

  window.VP.fetchData().then(function (data) {
    // Comercios destacados como brand cards (ref. Klarna): el chip muestra
    // la oferta activa del comercio si la tiene.
    var offerBySlug = {};
    data.ofertas.forEach(function (o) {
      if (o.merchantSlug && !offerBySlug[o.merchantSlug]) offerBySlug[o.merchantSlug] = o;
    });
    var grid = document.getElementById("homeGrid");
    var destacados = data.merchants.filter(function (m) { return m.featured; });
    if (!destacados.length) destacados = data.merchants.slice(0, 8);
    grid.innerHTML = destacados.slice(0, 8).map(function (m, i) {
      return window.VP.brandCardHTML(m, offerBySlug[m.slug], i);
    }).join("");

    // Marquee de logos (ref. Klarna): pista duplicada para el loop infinito.
    var mq = document.getElementById("homeMarquee");
    if (mq) {
      var logos = data.merchants.slice(0, 18).map(function (m) {
        return '<span class="mq-logo"><img loading="lazy" src="' +
          window.VP.ROOT + m.logo + '" alt=""></span>';
      }).join("");
      mq.innerHTML = logos + logos;
    }

    // Chips de categoría → directorio filtrado.
    var counts = {};
    data.merchants.forEach(function (m) {
      (m.categories || []).forEach(function (c) { counts[c] = (counts[c] || 0) + 1; });
    });
    var cats = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    document.getElementById("homeChips").innerHTML = cats.slice(0, 8).map(function (c) {
      return '<a class="chip" href="donde-comprar/?cat=' + encodeURIComponent(c) + '">' + c + "</a>";
    }).join("");

    // Ofertas (fila horizontal).
    document.getElementById("homeOfertas").innerHTML =
      data.ofertas.slice(0, 8).map(function (o) {
        return window.VP.offerCardHTML(o, data.bySlug);
      }).join("");

    // Re-armar los observers para el contenido recién renderizado.
    if (window.VPanim) window.VPanim.arm();
  });
})();
