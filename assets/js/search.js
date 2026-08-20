/* vana pay landing — super search.
 * Sugerencias en vivo bajo el buscador: escribe "airpods" / "tenis" /
 * "estufa" y ve en qué comercios lo consigues (match sobre nombre +
 * keywords de merchants.json) + SIEMPRE un resultado prominente de
 * vana pay chat con el query en el mensaje. Se usa en home y directorio.
 * Sin dependencias; VP.superSearch(input, data) lo engancha. */
(function () {
  function norm(s) {
    return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function score(m, terms) {
    var name = norm(m.name);
    var hay = name + " " + norm((m.categories || []).join(" ")) + " " + norm(m.keywords || "");
    var total = 0;
    for (var i = 0; i < terms.length; i++) {
      var t = terms[i];
      if (name.indexOf(t) === 0) total += 3;
      else if (name.indexOf(t) >= 0) total += 2;
      else if (hay.indexOf(t) >= 0) total += 1;
      else return 0; // todos los términos deben matchear
    }
    return total;
  }

  window.VP.superSearch = function (input, data) {
    var row = input.closest(".searchrow");
    var drop = document.createElement("div");
    drop.className = "ss-drop";
    row.appendChild(drop);

    function close() { drop.classList.remove("open"); }

    function render() {
      var q = input.value.trim();
      if (q.length < 2) { close(); return; }
      var terms = norm(q).split(/\s+/).filter(Boolean);
      var hits = data.merchants
        .map(function (m) { return { m: m, s: score(m, terms) }; })
        .filter(function (x) { return x.s > 0; })
        .sort(function (a, b) { return b.s - a.s || a.m.order - b.m.order; })
        .slice(0, 5);

      // Resultado prominente de vana pay chat — SIEMPRE presente.
      var chatMsg = "Hola, quiero comprar *" + q + "* con vana pay. ¿Me ayudas?";
      var html =
        '<a class="ss-chat" data-wa-context="supersearch" href="' +
        window.VP.waRaw(chatMsg) + '" target="_blank" rel="noopener">' +
        '<svg class="ico"><use href="#i-wa"/></svg>' +
        "<span>Te ayudamos a comprar <b>" + esc(q) + "</b> — pídelo en vana pay chat</span></a>";

      html += hits.map(function (x) {
        var m = x.m;
        return (
          '<a class="ss-item" href="' + window.VP.ROOT + "comercios/" + esc(m.slug) + '/">' +
            '<img loading="lazy" src="' + window.VP.ROOT + esc(m.logo) + '" alt="">' +
            "<span><span class='n'>" + esc(m.name) + "</span><br>" +
            "<span class='m'>Lo consigues aquí con vana pay</span></span>" +
            '<svg class="ico go"><use href="#i-arrow"/></svg>' +
          "</a>"
        );
      }).join("");

      drop.innerHTML = html;
      drop.classList.add("open");
    }

    input.addEventListener("input", render);
    input.addEventListener("focus", render);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
    });
    document.addEventListener("click", function (e) {
      if (!row.contains(e.target)) close();
    });
  };
})();
