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

  // Microsoft Clarity (proyecto yc713x0sp6, Mario 2026-09-02). Va AQUÍ y no
  // en Framer: la landing corre dentro de un iframe cross-origin y un tag en
  // la página padre no puede grabar lo que pasa adentro. Snippet oficial,
  // async; funciona igual inyectado desde este script que en el <head>.
  (function (c, l, a, r, i, t, y) {
    c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
    t = l.createElement(r); t.async = 1; t.src = "https://www.clarity.ms/tag/" + i;
    y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
  })(window, document, "clarity", "script", "yc713x0sp6");

  // Instrumentación propia: todo click a WhatsApp (vana pay chat o WhatsApp
  // del comercio) empuja un evento con contexto. Delegado en document para
  // cubrir CTAs renderizados después.
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest && e.target.closest("a[href*='wa.me'],a[href*='api.whatsapp.com']");
    if (!a) return;
    var ctx = a.getAttribute("data-wa-context") || "generic";
    var slug = a.getAttribute("data-wa-slug") || "";
    window.dataLayer.push({ event: "wa_click", waContext: ctx, waSlug: slug });
    // mismo evento en Clarity, para filtrar grabaciones por CTA/tienda
    if (window.clarity) {
      window.clarity("event", "wa_click");
      window.clarity("set", "wa_context", ctx);
      if (slug) window.clarity("set", "wa_slug", slug);
    }
  });
})();
