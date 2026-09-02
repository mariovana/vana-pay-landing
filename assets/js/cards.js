/* vana pay landing — render compartido de cards de comercio y oferta.
 * La unidad de discovery es SIEMPRE el comercio, nunca el producto. */
(function () {
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  var MODAL_LABEL = { tienda: "En tienda", online: "En línea", whatsapp: "Por chat" };

  // TRES formas de comprar: en tienda, en línea y por chat (WhatsApp, la
  // vía conversacional de ventas). Dentro de "por chat", el piloto de
  // PERSONAL SHOPPER (chatEnabled: Dressy, CAT, Adoc) — ahí te atiende un
  // agente de vana pay chat. Se muestra como capa extra, no como 4a vía.
  window.VP.modalityBadges = function (m) {
    var out = [];
    Object.keys(m.modalities).forEach(function (k) {
      if (MODAL_LABEL[k]) out.push('<span class="badge">' + MODAL_LABEL[k] + "</span>");
    });
    if (m.chatEnabled) out.push('<span class="badge chat">Personal shopper</span>');
    return out.join("");
  };

  // Card de comercio: toda la card es un link a la página del comercio.
  window.VP.merchantCardHTML = function (m) {
    var root = window.VP.ROOT;
    return (
      '<a class="mcard" href="' + root + "comercios/" + esc(m.slug) +
        '/" aria-label="Comprar en ' + esc(m.name) + ' con vana pay">' +
        '<div class="mcard-logo"><img loading="lazy" src="' + root + esc(m.logo) + '" alt="' + esc(m.name) + '"></div>' +
        '<div class="mcard-name">' + esc(m.name) + "</div>" +
        '<div class="mcard-cat">' + esc((m.categories || [])[0] || "") + "</div>" +
        '<div class="badges">' + window.VP.modalityBadges(m) + "</div>" +
      "</a>"
    );
  };

  // Card grande de marca (ref. Klarna "brands you love"): media pastel con
  // el logo del comercio, chip flotante con su beneficio (oferta activa o
  // "en paguitos") y tarjeta blanca con logo + nombre + modalidades.
  var PASTELS = ["t1", "t2", "t3", "t4", "t5"];
  window.VP.brandCardHTML = function (m, offer, i) {
    var root = window.VP.ROOT;
    var chip = offer
      ? '<span class="brandcard-chip">' + esc(offer.amount) + " de descuento</span>"
      : '<span class="brandcard-chip soft">en paguitos</span>';
    var meta = (m.categories || [])[0] || "";
    if (m.chatEnabled) meta += (meta ? " · " : "") + "Personal shopper";
    // Con foto de mkt: la imagen llena la media (los fondos blancos se
    // funden con el pastel via mix-blend). Sin foto: tile blanco con logo.
    var media = m.photo
      ? '<img class="bc-photo" loading="lazy" src="' + root + esc(m.photo) + '" alt="">'
      : '<img class="bc-tile" loading="lazy" src="' + root + esc(m.logo) + '" alt="">';
    return (
      '<a class="brandcard" href="' + root + "comercios/" + esc(m.slug) + '/">' +
        '<div class="brandcard-media ' + PASTELS[i % PASTELS.length] + '">' +
          media + chip +
        "</div>" +
        '<div class="brandcard-info">' +
          '<span class="brandcard-logo"><img loading="lazy" src="' + root + esc(m.logo) + '" alt=""></span>' +
          "<div><b>" + esc(m.name) + "</b><span>" + esc(meta) + "</span></div>" +
        "</div>" +
      "</a>"
    );
  };

  window.VP.offerCardHTML = function (o, merchantsBySlug) {
    var root = window.VP.ROOT;
    var m = o.merchantSlug ? merchantsBySlug[o.merchantSlug] : null;
    var badges = (o.modalities || []).map(function (k) {
      return '<span class="badge">' + (MODAL_LABEL[k] || k) + "</span>";
    }).join("");
    var href = m ? root + "comercios/" + esc(m.slug) + "/" : root + "donde-comprar/";
    // Con imagen de la oferta (scrapeada del sitio actual): card estilo
    // brand card — foto arriba, chip con el monto, logo del comercio abajo.
    var media = o.image
      ? '<div class="ocard-media"><img loading="lazy" src="' + root + esc(o.image) + '" alt="">' +
        '<span class="brandcard-chip">' + esc(o.amount) + "</span></div>"
      : "";
    var logo = m ? '<img class="ocard-logo" loading="lazy" src="' + root + esc(m.logo) + '" alt="">' : "";
    return (
      '<a class="ocard' + (o.image ? " has-media" : "") + '" href="' + href + '">' +
        media +
        '<div class="ocard-body">' +
          '<div class="ocard-head">' + logo +
            '<span class="ocard-merchant">' + esc(o.merchantName) + "</span></div>" +
          (o.image ? "" : '<span class="ocard-amount">' + esc(o.amount) + "</span>") +
          '<span class="ocard-cond">' + (o.image ? "<b>" + esc(o.amount) + "</b> " : "") + esc(o.condition) + "</span>" +
          '<div class="badges">' + badges + "</div>" +
        "</div>" +
      "</a>"
    );
  };

  window.VP.fetchData = function () {
    return Promise.all([
      fetch(window.VP.merchantsUrl()).then(function (r) { return r.json(); }),
      fetch(window.VP.ofertasUrl()).then(function (r) { return r.json(); }),
    ]).then(function (res) {
      var bySlug = {};
      res[0].merchants.forEach(function (m) { bySlug[m.slug] = m; });
      return { merchants: res[0].merchants, ofertas: res[1].ofertas, bySlug: bySlug };
    });
  };
})();
