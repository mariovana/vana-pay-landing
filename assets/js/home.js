/* vana pay landing — home. */
(function () {
  // El mock del hero ES la calculadora (feedback real: todos intentaban
  // tocarlo). Slider de monto Q100–Q3,000; estimado de referencia con
  // VP.paguitos() (fee máximo) y la regla real del producto para el
  // número de paguitos (3 si <Q300, 5 si no).
  var range = document.getElementById("mockRange");
  if (range) {
    var renderCalc = function () {
      var price = Number(range.value);
      var est = window.VP.paguitos(price, null);
      document.getElementById("mockPrice").textContent = window.VP.money(price);
      document.getElementById("mockPagLabel").textContent =
        "Tus " + est.n + " paguitos quincenales";
      var rows = "";
      for (var i = 0; i < est.n; i++) {
        rows +=
          '<div class="mock-row' + (i === 0 ? " paid" : "") + '">' +
          (i === 0 ? '<span class="mock-check">✓</span>' : '<span class="mock-dot"></span>') +
          '<span class="when">' + (i === 0 ? "Hoy" : "En " + i * 15 + " días") + "</span>" +
          '<span class="amt">~' + window.VP.money(est.per) + "</span></div>";
      }
      document.getElementById("mockRows").innerHTML = rows;
    };
    range.addEventListener("input", renderCalc);
    renderCalc();
  }

  // Cutouts de producto flotando con parallax (data/floats.json, generado
  // por build_data desde assets/img/floats/). Viven ESTRICTAMENTE en los
  // gutters laterales junto a la columna de 1120px: si el gutter libre no
  // alcanza, no se inyectan (ni se descargan) — así jamás caen encima de
  // cards, buscador, banner ni ofertas, en ningún ancho de pantalla.
  var HERO_PICKS = ["tenis-nike", "airpods-pro", "apple-watch",
    "audifonos-jbl", "bocina-jbl", "tenis-puma-retro"];

  (function () {
    var gutter = (window.innerWidth - 1120) / 2;
    if (gutter < 140) return;
    fetch(window.VP.ROOT + "data/floats.json" + window.VP.VQ)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var all = d.floats || [];
        if (!all.length) return;

        // los curados primero, para que abran la página
        var ordered = [];
        HERO_PICKS.forEach(function (k) {
          var hit = all.filter(function (s) { return s.indexOf(k) >= 0; })[0];
          if (hit && ordered.indexOf(hit) < 0) ordered.push(hit);
        });
        all.forEach(function (s) {
          if (ordered.indexOf(s) < 0) ordered.push(s);
        });

        var rail = document.createElement("div");
        rail.className = "page-floats";
        document.body.appendChild(rail);

        // si la ventana se angosta después de cargar, el rail se esconde
        window.addEventListener("resize", function () {
          var g = (window.innerWidth - 1120) / 2;
          rail.style.display = g < 140 ? "none" : "";
        });

        // esperar a que los grids dinámicos definan la altura final
        setTimeout(function () {
          var h = document.body.scrollHeight;
          var start = 140, gap = 620;
          var maxW = Math.min(170, Math.floor(gutter) - 28);
          var n = Math.min(ordered.length,
            Math.max(0, Math.floor((h - start - 520) / gap)));
          var html = "";
          for (var i = 0; i < n; i++) {
            var side = i % 2 ? "right" : "left";
            var w = Math.min(maxW, 104 + ((i * 37) % 60));
            var rot = ((i * 53) % 24) - 12;
            html += '<img class="pf ' + (i % 2 ? "pf-down" : "pf-up") +
              '" src="' + window.VP.ROOT + ordered[i] + '" alt="" loading="lazy" style="' +
              side + ":14px;top:" + (start + i * gap) + "px;width:" + w +
              "px;--rot:" + rot + 'deg">';
          }
          rail.innerHTML = html;
        }, 600);
      })
      .catch(function () {});
  })();

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

    // Banner de vana pay chat: un CTA prellenado por tienda del piloto
    // (chatEnabled viene de build_data → ampliar el piloto es solo data).
    var pilot = document.getElementById("pilotStores");
    if (pilot) {
      pilot.innerHTML = data.merchants.filter(function (m) { return m.chatEnabled; })
        .map(function (m) {
          return '<a class="pilot-btn" data-wa-context="pilot-banner" data-wa-slug="' + m.slug +
            '" href="' + window.VP.chatMerchantLink(m.name) + '" target="_blank" rel="noopener">' +
            '<img src="' + window.VP.ROOT + m.logo + '" alt="">' +
            "<span><b>Comprar en " + m.name + "</b><small>por vana pay chat</small></span>" +
            '<svg class="ico"><use href="#i-wa"/></svg></a>';
        }).join("");
    }

    // Super search con sugerencias (comercios + vana pay chat).
    var q = document.querySelector("#homeSearch input");
    if (q && window.VP.superSearch) window.VP.superSearch(q, data);

    // Re-armar los observers para el contenido recién renderizado.
    if (window.VPanim) window.VPanim.arm();
  });
})();
