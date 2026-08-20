/* vana pay landing — render compartido de cards de comercio y oferta.
 * La unidad de discovery es SIEMPRE el comercio, nunca el producto. */
(function () {
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  var MODAL_LABEL = { tienda: "En tienda", online: "En línea", whatsapp: "WhatsApp" };

  window.VP.modalityBadges = function (m, withChat) {
    var out = Object.keys(m.modalities).map(function (k) {
      return '<span class="badge">' + MODAL_LABEL[k] + "</span>";
    });
    // El badge de chat solo cuando la card no trae ya el botón verde.
    if (m.chatEnabled && withChat !== false) {
      out.push('<span class="badge chat">vana pay chat</span>');
    }
    return out.join("");
  };

  // Card de comercio: el área del comercio linkea a su página; el botón de
  // vana pay chat (si aplica) es un atajo directo, separado del link.
  window.VP.merchantCardHTML = function (m) {
    var root = window.VP.ROOT;
    var chat = m.chatEnabled
      ? '<a class="btn btn-chat btn-sm" data-wa-context="merchant-card" data-wa-slug="' + esc(m.slug) +
        '" href="' + window.VP.chatMerchantLink(m.name) + '" target="_blank" rel="noopener">' +
        '<svg class="ico"><use href="#i-wa"/></svg> Pedir por chat</a>'
      : "";
    return (
      '<div class="mcard">' +
        '<a href="' + root + "comercios/" + esc(m.slug) + '/" aria-label="Comprar en ' + esc(m.name) + ' con vana pay">' +
          '<div class="mcard-logo"><img loading="lazy" src="' + root + esc(m.logo) + '" alt="' + esc(m.name) + '"></div>' +
          '<div class="mcard-name" style="margin-top:10px">' + esc(m.name) + "</div>" +
          '<div class="mcard-cat">' + esc((m.categories || [])[0] || "") + "</div>" +
        "</a>" +
        '<div class="badges">' + window.VP.modalityBadges(m, false) + "</div>" +
        '<div class="mcard-cta">' + chat + "</div>" +
      "</div>"
    );
  };

  window.VP.offerCardHTML = function (o, merchantsBySlug) {
    var root = window.VP.ROOT;
    var m = o.merchantSlug ? merchantsBySlug[o.merchantSlug] : null;
    var badges = (o.modalities || []).map(function (k) {
      return '<span class="badge">' + (MODAL_LABEL[k] || k) + "</span>";
    }).join("");
    var href = m ? root + "comercios/" + esc(m.slug) + "/" : root + "donde-comprar/";
    return (
      '<a class="ocard" href="' + href + '">' +
        '<span class="ocard-merchant">' + esc(o.merchantName) + "</span>" +
        '<span class="ocard-amount">' + esc(o.amount) + "</span>" +
        '<span class="ocard-cond">' + esc(o.condition) + "</span>" +
        '<div class="badges">' + badges + "</div>" +
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
