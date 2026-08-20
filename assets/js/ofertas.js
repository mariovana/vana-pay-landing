/* vana pay landing — listado de ofertas. */
(function () {
  window.VP.fetchData().then(function (data) {
    document.getElementById("grid").innerHTML =
      data.ofertas.map(function (o) {
        return window.VP.offerCardHTML(o, data.bySlug);
      }).join("");
  });
})();
