/* vana pay landing — configuración central */
window.VP = {
  // Número oficial de WhatsApp de vana (el mismo que atiende vana shop):
  // +502 3140 0058. Formato wa.me: código de país + número, sin "+" ni
  // espacios. Cambiar aquí en un solo lugar; todos los CTAs lo derivan.
  WA_NUMBER: "50231400058",

  // App de vana pay.
  APP_URL: "https://pay.vana.gt/",
  SIGNUP_URL: "https://pay.vana.gt/registro",

  // Prototipo del personal shopper IA (branch proto/chat-widget). Vacío en
  // producción: sin URL no se carga ningún widget y los CTAs siguen a
  // WhatsApp. En dev, ?agent=1 guarda http://localhost:8010 en localStorage
  // ("vp.agent") y aparece el widget; ?agent=0 lo apaga.
  AGENT_URL: "",
  AGENT_DEV_URL: "http://localhost:8010",
  AGENT_STORES: ["dressy"],
  AGENT_STORE_NAME: "Dressy",

  // Raíz del sitio, derivada del src de este script. Las páginas de comercio
  // viven anidadas (/comercios/<slug>/), así que las rutas a data/ y assets/
  // no pueden ser relativas a la página: se calculan desde aquí.
  // El ?v=N del script es el cache-buster y se propaga a los datos.
  ROOT: (function () {
    var src = document.currentScript && document.currentScript.src;
    return src ? src.replace(/assets\/js\/config\.js.*$/, "") : "";
  })(),
  VQ: (function () {
    var src = document.currentScript && document.currentScript.src;
    var m = src && src.match(/\?v=[\w.]+/);
    return m ? m[0] : "";
  })(),

  merchantsUrl: function () { return window.VP.ROOT + "data/merchants.json" + window.VP.VQ; },
  ofertasUrl: function () { return window.VP.ROOT + "data/ofertas.json" + window.VP.VQ; },
  asset: function (path) { return window.VP.ROOT + path; },

  // Q con separador de miles, sin decimales.
  money: function (v) {
    return "Q" + Math.round(Number(v)).toLocaleString("es-GT");
  },

  // Peor fee posible por número de paguitos (mismo modelo que vana shop:
  // 3: máximo entre comercios; 5: peor segmento de riesgo E1).
  FEES_MAX: { 3: 0.13, 5: 0.36 },

  // PAGUITO SEGURO — misma fórmula y política que vana shop (config.js de
  // vana-shop es la referencia): el paguito real es dinámico por usuario y
  // el sitio no sabe quién es el visitante, así que se muestra el PEOR caso
  // (fee máximo, enganche 0). Al entrar a su cuenta el paguito baja o queda
  // igual, nunca sube. No hardcodear esta cuenta en ningún otro lado.
  paguitos: function (price, fees) {
    price = Number(price);
    var n = price < 300 ? 3 : 5;
    var fee = fees && fees[n] != null ? Number(fees[n]) : window.VP.FEES_MAX[n];
    return { n: n, per: Math.ceil(price * (1 + fee) / n) };
  },

  // Mensajes para vana pay chat (WhatsApp de vana). Sin emojis: según el
  // dispositivo llegan como caracteres rotos por el encoding del link wa.me.
  // Sin montos de paguito: los agentes no cotizan paguitos (son dinámicos
  // por usuario). El framing es SIEMPRE "comprar en <comercio> con vana pay"
  // — vana pay es el método de pago, no la tienda.
  chatMerchantMessage: function (name) {
    return "Hola, quiero comprar en *" + name + "* con vana pay. ¿Me ayudas?";
  },
  chatMerchantLink: function (name) {
    return window.VP.waRaw(window.VP.chatMerchantMessage(name));
  },

  chatGenericMessage: function () {
    return "Hola, quiero comprar con vana pay. ¿Me ayudas?";
  },
  chatGenericLink: function () {
    return window.VP.waRaw(window.VP.chatGenericMessage());
  },

  chatOfferMessage: function (merchantName, resumen) {
    return "Hola, vi la oferta de *" + merchantName + "* (" + resumen +
      ") y quiero comprar con vana pay. ¿Me ayudas?";
  },
  chatOfferLink: function (merchantName, resumen) {
    return window.VP.waRaw(window.VP.chatOfferMessage(merchantName, resumen));
  },

  waRaw: function (msg) {
    return "https://wa.me/" + window.VP.WA_NUMBER + "?text=" + encodeURIComponent(msg);
  },

  // Chat con la tienda: el WhatsApp propio del comercio (te atiende alguien
  // de la tienda). Distinto de vana pay chat (agente de vana, solo piloto).
  merchantWaLink: function (phone) {
    return "https://wa.me/" + phone + "?text=" +
      encodeURIComponent("Hola, quiero comprar un producto y pagarlo con vana pay.");
  },

  // Salida al e-commerce del comercio, con atribución uniforme (las URLs se
  // guardan limpias en merchants.json; el utm se agrega solo aquí).
  merchantSiteLink: function (url) {
    return url + (url.indexOf("?") < 0 ? "?" : "&") + "utm_source=vanapay";
  },
};
