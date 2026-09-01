/* vana pay landing — directorio de comercios.
 * Regla heredada de vana-shop: el buscador FILTRA en vivo pero no hace
 * scroll ni abre WhatsApp; el estado vacío es el que ofrece el chat. */
(function () {
  var state = { q: "", mod: "", cat: "" };
  var DATA = null;

  var params = new URLSearchParams(location.search);
  state.q = (params.get("q") || "").trim();
  state.cat = params.get("cat") || "";

  var $q = document.getElementById("q");
  var $grid = document.getElementById("grid");
  var $count = document.getElementById("count");
  var $empty = document.getElementById("empty");
  $q.value = state.q;

  var MODS = [
    { key: "", label: "Todas" },
    { key: "tienda", label: "En tienda" },
    { key: "online", label: "En línea" },
    { key: "whatsapp", label: "WhatsApp" },
    { key: "chat", label: "vana pay chat" },
  ];

  function norm(s) {
    return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  function pasa(m) {
    if (state.mod === "chat" && !m.chatEnabled) return false;
    if (state.mod && state.mod !== "chat" && !m.modalities[state.mod]) return false;
    if (state.cat && (m.categories || []).indexOf(state.cat) < 0) return false;
    if (state.q) {
      var hay = norm(m.name + " " + (m.categories || []).join(" ") + " " + (m.keywords || ""));
      var terms = norm(state.q).split(/\s+/).filter(Boolean);
      for (var i = 0; i < terms.length; i++) {
        if (hay.indexOf(terms[i]) < 0) return false;
      }
    }
    return true;
  }

  function render() {
    var list = DATA.merchants.filter(pasa);
    $grid.innerHTML = list.map(window.VP.merchantCardHTML).join("");
    $count.textContent = list.length
      ? list.length + " comercio" + (list.length === 1 ? "" : "s")
      : "";
    $empty.classList.toggle("show", !list.length);
  }

  function chips(el, items, get, set) {
    el.innerHTML = items.map(function (it) {
      var on = get() === it.key ? " on" : "";
      return '<button type="button" class="chip' + on + '" data-k="' + it.key + '">' + it.label + "</button>";
    }).join("");
    el.querySelectorAll(".chip").forEach(function (b) {
      b.addEventListener("click", function () {
        set(get() === b.dataset.k ? "" : b.dataset.k);
        chips(el, items, get, set);
        render();
      });
    });
  }

  window.VP.fetchData().then(function (data) {
    DATA = data;

    chips(document.getElementById("modChips"), MODS,
      function () { return state.mod; },
      function (v) { state.mod = v; });

    var counts = {};
    data.merchants.forEach(function (m) {
      (m.categories || []).forEach(function (c) { counts[c] = (counts[c] || 0) + 1; });
    });
    var cats = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })
      .map(function (c) { return { key: c, label: c }; });
    cats.unshift({ key: "", label: "Todas las categorías" });
    chips(document.getElementById("catChips"), cats,
      function () { return state.cat; },
      function (v) { state.cat = v; });

    $q.addEventListener("input", function () {
      state.q = $q.value.trim();
      render();
    });

    // Super search: sugerencias + resultado prominente de vana pay chat
    // (el grid de abajo sigue filtrando en vivo, como siempre).
    if (window.VP.superSearch) window.VP.superSearch($q, data);

    render();
  });
})();
