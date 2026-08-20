/* vana pay landing — home. */
(function () {
  // CTA genérico de vana pay chat en "Formas de comprar".
  var ways = document.getElementById("waysChat");
  if (ways) {
    ways.href = window.VP.chatGenericLink();
    ways.target = "_blank";
    ways.rel = "noopener";
  }
  var banner = document.getElementById("bannerChat");
  if (banner) banner.href = window.VP.chatGenericLink();

  // Los montos del ejemplo salen de VP.paguitos() para que la fórmula del
  // paguito seguro viva en un solo lugar (los Q del HTML son fallback).
  var q = window.VP.paguitos(1500, null); // {n:5, per:408} con fee máximo
  document.querySelectorAll(".mock-row .amt, .pagui-line .amt").forEach(function (el) {
    if (el.textContent.trim()) el.textContent = window.VP.money(q.per);
  });

  // Cutouts de producto flotando con parallax (top notch ✨). Vienen de
  // data/floats.json (build_data los lee de assets/img/floats/). Solo se
  // inyectan en pantallas anchas — así mobile ni siquiera los descarga.
  // Hero: 6 curados. Resto: distribuidos por los laterales de toda la
  // página (≥1440px, donde hay gutter libre junto a la columna de 1120px).
  var HERO_PICKS = ["tenis-nike", "airpods-pro", "apple-watch",
    "audifonos-jbl", "bocina-jbl", "tenis-puma-retro"];

  if (window.matchMedia("(min-width:1150px)").matches) {
    fetch(window.VP.ROOT + "data/floats.json" + window.VP.VQ)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var all = d.floats || [];
        if (!all.length) return;

        var hero = [];
        HERO_PICKS.forEach(function (k) {
          var hit = all.filter(function (s) { return s.indexOf(k) >= 0; })[0];
          if (hit) hero.push(hit);
        });
        all.forEach(function (s) {
          if (hero.length < 6 && hero.indexOf(s) < 0) hero.push(s);
        });

        var host = document.getElementById("heroFloats");
        if (host) {
          host.innerHTML = hero.map(function (src, i) {
            return '<img class="float f' + (i + 1) + '" src="' +
              window.VP.ROOT + src + '" alt="" loading="lazy">';
          }).join("");
        }

        // laterales del resto de la página
        if (!window.matchMedia("(min-width:1440px)").matches) return;
        var rest = all.filter(function (s) { return hero.indexOf(s) < 0; });
        var rail = document.createElement("div");
        rail.className = "page-floats";
        document.body.appendChild(rail);
        function layout() {
          var h = document.body.scrollHeight;
          var start = window.innerHeight + 200;   // debajo del hero
          var gap = 780;
          var n = Math.min(rest.length, Math.max(0, Math.floor((h - start - 600) / gap)));
          var html = "";
          for (var i = 0; i < n; i++) {
            var side = i % 2 ? "right" : "left";
            var w = 110 + ((i * 37) % 50);        // 110–160px, determinista
            var rot = ((i * 53) % 24) - 12;       // −12°..12°
            html += '<img class="pf ' + (i % 2 ? "pf-down" : "pf-up") +
              '" src="' + window.VP.ROOT + rest[i] + '" alt="" loading="lazy" style="' +
              side + ":28px;top:" + (start + i * gap) + "px;width:" + w +
              "px;--rot:" + rot + 'deg">';
          }
          rail.innerHTML = html;
        }
        // esperar a que los grids dinámicos definan la altura final
        setTimeout(layout, 600);
      })
      .catch(function () {});
  }

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

    // Super search con sugerencias (comercios + vana pay chat).
    var q = document.querySelector("#homeSearch input");
    if (q && window.VP.superSearch) window.VP.superSearch(q, data);

    // Re-armar los observers para el contenido recién renderizado.
    if (window.VPanim) window.VPanim.arm();
  });
})();
