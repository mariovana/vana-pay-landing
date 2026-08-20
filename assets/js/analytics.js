/* vana pay landing — analytics.
 *
 * El sitio Webflow actual carga GTM (GTM-MHLZLXJ) y el container inyecta el
 * resto (gtag AW-743651183 / G-GYGJRMDXNE, FB pixel, Bing, Clarity
 * tgfsd2lcew). Aquí se replica solo el container: una fuente de verdad.
 * PENDIENTE (ver CLAUDE.md): confirmar con quien administre GTM que el
 * container puede disparar desde este origin; Webflow además inyectaba un
 * segundo Clarity (vplu4gpwl0) que aquí NO se replica.
 */
(function () {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ "gtm.start": new Date().getTime(), event: "gtm.js" });
  var s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtm.js?id=GTM-MHLZLXJ";
  document.head.appendChild(s);

  // Instrumentación propia: todo click a WhatsApp (vana pay chat o WhatsApp
  // del comercio) empuja un evento con contexto. Delegado en document para
  // cubrir CTAs renderizados después.
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest && e.target.closest("a[href*='wa.me'],a[href*='api.whatsapp.com']");
    if (!a) return;
    window.dataLayer.push({
      event: "wa_click",
      waContext: a.getAttribute("data-wa-context") || "generic",
      waSlug: a.getAttribute("data-wa-slug") || "",
    });
  });
})();
