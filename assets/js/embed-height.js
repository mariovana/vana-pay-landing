/* vana shop — reporta la altura al contenedor padre (embed de Framer)
 *
 * Cuando el sitio corre dentro del <iframe> de Framer en www.vana.gt/shop,
 * el iframe no puede crecer solo. Acá medimos la altura real del contenido y
 * se la mandamos al padre por postMessage para que ajuste el alto del embed.
 *
 * Nunca se usa "*" como targetOrigin: cada mensaje va a un origen explícito,
 * así ningún otro sitio que nos embeba puede leerlo.
 */
(function () {
  "use strict";

  // Producción: orígenes fijos y conocidos.
  // OJO: vana.gt responde 308 → https://www.vana.gt, así que el origen real
  // donde corre la página de Framer es el de www. Mandar solo a "https://vana.gt"
  // haría que el mensaje se descarte en silencio.
  var STATIC_ORIGINS = [
    "https://www.vana.gt",
    "https://vana.gt"
  ];

  // Previews de Framer: la URL incluye un id de rama y cambia sola
  // (p.ej. stale-food-211646--mi-rama-ff4lbh6eb.framer.app), así que no se
  // puede hardcodear. En vez de eso se valida el origen real del padre contra
  // estos patrones y, si calza, se usa ese origen EXACTO como targetOrigin.
  // Sigue sin haber wildcard: nunca se manda a un origen no verificado.
  var ORIGIN_PATTERNS = [
    /^https:\/\/[a-z0-9-]+\.framer\.app$/i,      // previews por rama
    /^https:\/\/[a-z0-9-]+\.framer\.website$/i   // staging publicado
  ];

  /** Origen del contenedor que nos embebe, o null si no se puede determinar. */
  function detectParentOrigin() {
    try {
      if (location.ancestorOrigins && location.ancestorOrigins.length) {
        return location.ancestorOrigins[0];
      }
    } catch (e) { /* no soportado */ }
    if (document.referrer) {
      try { return new URL(document.referrer).origin; } catch (e) { /* inválido */ }
    }
    return null;
  }

  var PARENT_ORIGINS = (function () {
    var list = STATIC_ORIGINS.slice();
    var parent = detectParentOrigin();
    if (parent && list.indexOf(parent) === -1) {
      for (var i = 0; i < ORIGIN_PATTERNS.length; i++) {
        if (ORIGIN_PATTERNS[i].test(parent)) { list.push(parent); break; }
      }
    }
    return list;
  })();

  var lastHeight = -1;
  var scheduled = false;

  /**
   * Altura real del contenido, considerando documentElement y body.
   *
   * OJO — por qué no basta con Math.max(documentElement.scrollHeight, ...):
   * cuando el padre ya estiró el iframe a la altura que le reportamos, el
   * viewport interno pasa a medir eso, y scrollHeight / offsetHeight /
   * clientHeight de documentElement nunca bajan del viewport. La medición se
   * queda clavada en su máximo histórico y no puede encoger — al rotar el
   * teléfono o ensanchar la página quedaría un hueco vacío debajo para siempre.
   *
   * Por eso medimos la geometría real del contenido (el borde inferior más bajo
   * de los hijos de body, en coordenadas del documento), que sí sube y baja.
   * Cuando el contenido es más alto que el viewport da lo mismo que
   * scrollHeight; cuando es más bajo, da el valor correcto en vez del inflado.
   */
  function measureHeight() {
    var body = document.body;
    var doc = document.documentElement;
    if (!body) return doc ? doc.scrollHeight : 0;

    // body con height:auto colapsa al contenido, no se estira al viewport.
    var max = body.getBoundingClientRect().height;
    var scrollY = window.scrollY || window.pageYOffset || 0;

    for (var i = 0; i < body.children.length; i++) {
      var el = body.children[i];
      var cs = window.getComputedStyle(el);
      // Las barras fijas (la de compra en mobile) no aportan alto al documento.
      if (cs.position === "fixed") continue;
      var rect = el.getBoundingClientRect();
      if (!rect.height) continue;
      var marginBottom = parseFloat(cs.marginBottom) || 0;
      max = Math.max(max, rect.bottom + scrollY + marginBottom);
    }

    return Math.ceil(max);
  }

  function send() {
    scheduled = false;

    // Si no estamos embebidos no hay a quién avisarle.
    if (window.parent === window) return;

    var height = measureHeight();
    if (height === lastHeight) return; // no repetir si no cambió
    lastHeight = height;

    for (var i = 0; i < PARENT_ORIGINS.length; i++) {
      try {
        window.parent.postMessage(
          {
            type: "storefront-height",
            height: height
          },
          PARENT_ORIGINS[i]
        );
      } catch (e) {
        /* origen no coincide o padre inaccesible — se ignora */
      }
    }
  }

  /**
   * Pide un reporte de altura. Agrupa ráfagas (varias imágenes cargando,
   * filtros aplicándose, resize continuo) en un solo envío por frame.
   */
  function report() {
    if (scheduled) return;
    scheduled = true;
    if (window.requestAnimationFrame) requestAnimationFrame(send);
    else setTimeout(send, 16);
  }

  /**
   * Pide al contenedor que scrollee a una posición nuestra (en px desde el
   * inicio de nuestro documento). Necesario porque, cuando el padre ya estiró
   * el iframe a la altura completa, el iframe no tiene scroll propio: el que
   * scrollea es la página de Framer. Devuelve true si se envió.
   */
  function requestScroll(offsetY) {
    if (window.parent === window) return false;
    var offset = Math.max(0, Math.round(offsetY || 0));
    var sent = false;
    for (var i = 0; i < PARENT_ORIGINS.length; i++) {
      try {
        window.parent.postMessage(
          { type: "storefront-scroll", offset: offset },
          PARENT_ORIGINS[i]
        );
        sent = true;
      } catch (e) { /* origen no coincide */ }
    }
    return sent;
  }

  // Expuesto para que catalog.js / product.js avisen tras render asíncrono.
  window.VanaShopEmbed = {
    report: report,
    measureHeight: measureHeight,
    requestScroll: requestScroll
  };

  // --- Eventos del ciclo de vida ---
  document.addEventListener("DOMContentLoaded", report);
  window.addEventListener("load", report);
  window.addEventListener("resize", report);
  window.addEventListener("orientationchange", report);

  // Las imágenes cambian la altura al cargar. 'load' no burbujea, se captura.
  document.addEventListener("load", report, true);
  document.addEventListener("error", report, true); // imagen rota también cambia layout

  // Transiciones (bottom sheet de filtros, acordeones) terminan en otra altura.
  document.addEventListener("transitionend", report);

  // Las fuentes web reflowan el texto al cargar.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(report).catch(function () {});
  }

  // --- Observers ---
  function startObservers() {
    var target = document.body || document.documentElement;
    if (!target) return;

    // Cambios de tamaño del contenido (la señal más directa).
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(report);
      ro.observe(target);
      if (document.documentElement) ro.observe(document.documentElement);
    }

    // Contenido asíncrono: grid de productos, chips de filtros, PDP, carrusel.
    if (window.MutationObserver) {
      new MutationObserver(report).observe(target, {
        childList: true,
        subtree: true
      });
    }

    report(); // primer reporte en cuanto hay algo que medir
  }

  if (document.body) startObservers();
  else document.addEventListener("DOMContentLoaded", startObservers);

  // Red de seguridad para contenido que llega tarde (fetch de products.json,
  // imágenes del CDN de los comercios) sin depender solo de los observers.
  [250, 800, 2000].forEach(function (ms) {
    setTimeout(report, ms);
  });
})();
