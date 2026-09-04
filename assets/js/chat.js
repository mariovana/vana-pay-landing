/* vana pay chat: widget del personal shopper (prototipo).
   Se activa SOLO si hay una URL del agente: VP.AGENT_URL (producción, hoy
   vacía) o localStorage "vp.agent" (dev: ?agent=1 la fija a VP.AGENT_DEV_URL,
   ?agent=0 la borra). Sin URL, este archivo no hace nada y los CTAs siguen
   yendo a WhatsApp.

   Protocolo: POST {AGENT_URL}/api/chat {session_id, message} -> SSE con
   eventos del blueprint (text_delta, tool_call, ui, cart_update, error,
   turn_complete). El checkout llega como ui/component=checkout con
   payload.handoffs[].url: el modelo nunca ve esa URL; aquí se vuelve botón. */
(function () {
  var VP = window.VP || {};
  var qs = new URLSearchParams(location.search);
  function allowedAgent(url) {
    try {
      var u = new URL(url);
      if (u.protocol !== "https:" && u.hostname !== "localhost" && u.hostname !== "127.0.0.1") return false;
      return (VP.AGENT_HOSTS || []).some(function (re) { return re.test(u.host); });
    } catch (e) { return false; }
  }
  try {
    var q = qs.get("agent");
    if (q === "1") localStorage.setItem("vp.agent", VP.AGENT_DEV_URL || "http://localhost:8010");
    else if (q === "0") localStorage.removeItem("vp.agent");
    else if (q && /^https?:\/\//.test(q) && allowedAgent(q)) localStorage.setItem("vp.agent", q.replace(/\/+$/, ""));
  } catch (e) { /* sin storage: solo VP.AGENT_URL */ }
  var AGENT_URL = VP.AGENT_URL || "";
  try { AGENT_URL = localStorage.getItem("vp.agent") || AGENT_URL; } catch (e) { /* noop */ }
  if (!AGENT_URL) return;
  AGENT_URL = AGENT_URL.replace(/\/+$/, "");

  var STORES = VP.AGENT_STORES || ["dressy"];
  var NAMES = VP.AGENT_STORE_NAMES || { dressy: "Dressy" };
  // "Dressy y CAT" / "Dressy, CAT y 4 tiendas más": la lista completa no cabe en la cabecera.
  function joinNames(list) {
    if (list.length <= 2) return list.join(" y ");
    if (list.length <= 3) return list.slice(0, -1).join(", ") + " y " + list[list.length - 1];
    return "tus tiendas afiliadas";
  }
  var ALL_NAMES = joinNames(STORES.map(function (s) { return NAMES[s] || s; }));
  var STORE_NAME = ALL_NAMES;              // texto de cabecera; cambia con el foco
  var focusSlug = "";                      // "" = todas las tiendas
  try { focusSlug = sessionStorage.getItem("vp.chat.store") || ""; } catch (e) { /* noop */ }
  function setFocus(slug) {
    focusSlug = STORES.indexOf(slug) >= 0 ? slug : "";
    try { sessionStorage.setItem("vp.chat.store", focusSlug); } catch (e) { /* noop */ }
    STORE_NAME = focusSlug ? NAMES[focusSlug] : ALL_NAMES;
    var sub = panel && panel.querySelector(".vpc-head small");
    if (sub) sub.textContent = focusSlug ? "Tu personal shopper en " + STORE_NAME : "Dime qué quieres comprar y te digo dónde pagarlo en paguitos";
    var note = panel && panel.querySelector(".vpc-note");
    if (note) note.textContent = (focusSlug ? NAMES[focusSlug] + " es la tienda." : "Compras en el comercio.") + " vana pay es tu forma de pago.";
  }
  // Miniaturas: el CDN de Shopify redimensiona con el sufijo _{ancho}x antes de la
  // extensión (las fotos originales de Dressy pesan hasta 1.7 MB).
  function thumb(url, w) {
    if (!url || url.indexOf("cdn.shopify.com") < 0) return url;
    return url.replace(/(\.[a-zA-Z0-9]+)(\?[^#]*)?$/, "_" + w + "x$1$2");
  }
  // Paguitos estimados: misma fórmula y política que el hero (VP.paguitos, paguito
  // seguro con fee máximo, estimado de referencia). Solo la interfaz lo muestra; el
  // agente nunca cotiza. A partir de Q300 el estimado va como precio principal.
  var PAGUI_MIN = 300;
  function paguiHTML(price, cls) {
    if (!(price > PAGUI_MIN) || !VP.paguitos) return "";
    var pg = VP.paguitos(price);
    return '<div class="' + (cls || "vpc-pagui") + '"><b>~' + VP.money(pg.per) + "</b> <small>x " + pg.n + " paguitos</small></div>";
  }
  var MONEY = function (v) { return "Q" + Number(v).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };

  // ---- sesión ---------------------------------------------------------------
  function rand() {
    var a = new Uint8Array(16); (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }
  var sid;
  try { sid = sessionStorage.getItem("vp.chat.sid"); } catch (e) { /* noop */ }
  if (!sid) { sid = rand(); try { sessionStorage.setItem("vp.chat.sid", sid); } catch (e) { /* noop */ } }

  // Perfil de la persona (para quién compra, tallas, género, presupuesto): vive en el dispositivo y
  // viaja al servidor con cada mensaje; el agente lo usa sin volver a preguntar.
  var profile = {};
  try { profile = JSON.parse(localStorage.getItem("vp.chat.profile") || "{}") || {}; } catch (e) { profile = {}; }
  function saveProfile(patch) {
    Object.keys(patch).forEach(function (k) { if (patch[k]) profile[k] = patch[k]; else delete profile[k]; });
    try { localStorage.setItem("vp.chat.profile", JSON.stringify(profile)); } catch (e) { /* noop */ }
    fetch(AGENT_URL + "/api/profile", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sid, profile: profile }) }).catch(function () { /* se reintenta con el próximo mensaje */ });
  }
  var identified = null;  // { first_name, disponible_q, demo } tras "Ya tengo vana pay"

  function track(name, params) {
    var p = params || {};
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(Object.assign({ event: name, chatStore: STORES[0] }, p));
    if (typeof window.clarity === "function") { try { window.clarity("event", name); } catch (e) { /* noop */ } }
  }

  // ---- DOM ----------------------------------------------------------------------
  var ICON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm3 5v2h10V9H7zm0 4v2h7v-2H7z"/></svg>';
  var fab = document.createElement("button");
  fab.type = "button"; fab.className = "vpc-fab"; fab.setAttribute("aria-label", "Abrir el chat del personal shopper");
  fab.innerHTML = '<span class="vpc-fab-ring" aria-hidden="true"></span>' + ICON +
    '<span class="vpc-fab-txt"><b>Compra por chat en paguitos</b><small>Tu personal shopper te ayuda a elegir y pagar</small></span>' +
    '<span class="vpc-fab-go" aria-hidden="true">&rsaquo;</span>' +
    '<span class="vpc-fab-dot" aria-hidden="true"></span>';

  // Burbujas de invitación: salen del bubble una por una (con "escribiendo" antes) hasta que
  // la persona abre el chat o las cierra. Una vez por sesión. Con reduced-motion, una sola
  // burbuja fija.
  var TEASERS = [
    "Hola, soy tu personal shopper. ¿Qué buscas hoy?",
    "Dime qué quieres comprar y te digo dónde pagarlo en paguitos.",
    "¿Nuevo en vana pay? Pregúntame qué es y qué necesitas para empezar."
  ];
  var teasers = document.createElement("div");
  teasers.className = "vpc-teasers"; teasers.hidden = true;
  teasers.innerHTML = '<button type="button" class="vpc-teasers-close" aria-label="Cerrar sugerencias">&times;</button><div class="vpc-teasers-list"></div>';
  var teaserTimers = [];
  function stopTeasers(remember) {
    teaserTimers.forEach(clearTimeout); teaserTimers = [];
    teasers.hidden = true;
    if (remember) { try { sessionStorage.setItem("vp.chat.teased", "1"); } catch (e) { /* noop */ } }
  }
  function pushTeaser(text, i) {
    var list = teasers.querySelector(".vpc-teasers-list");
    var b = document.createElement("div"); b.className = "vpc-teaser";
    b.innerHTML = '<img class="vpc-teaser-avatar" src="' + (VP.ROOT || "") + 'assets/img/favicon.svg" alt="">' +
      '<span class="vpc-teaser-body"><span class="vpc-teaser-typing"><i></i><i></i><i></i></span></span>';
    b.addEventListener("click", function () { open("teaser-" + (i + 1)); });
    list.appendChild(b);
    var maxBubbles = isMobile() ? 1 : 3;
    while (list.children.length > maxBubbles) list.removeChild(list.firstChild);
    var reduced = document.documentElement.classList.contains("no-anim");
    teaserTimers.push(setTimeout(function () {
      b.querySelector(".vpc-teaser-body").textContent = text;
      b.classList.add("is-text");
    }, reduced ? 0 : 900));
  }
  function startTeasers() {
    var teased = false;
    try { teased = sessionStorage.getItem("vp.chat.teased") === "1"; } catch (e) { /* noop */ }
    if (teased || !panel.hidden) return;
    teasers.hidden = false;
    if (document.documentElement.classList.contains("no-anim")) { pushTeaser(TEASERS[0], 0); return; }
    TEASERS.forEach(function (t, i) {
      teaserTimers.push(setTimeout(function () { pushTeaser(t, i); }, 1400 + i * 4200));
    });
  }
  teasers.querySelector(".vpc-teasers-close").addEventListener("click", function (e) {
    e.stopPropagation(); stopTeasers(true); track("chat_teaser_close");
  });

  var panel = document.createElement("section");
  panel.className = "vpc-panel"; panel.hidden = true; panel.setAttribute("aria-label", "vana pay chat");
  panel.innerHTML =
    '<header class="vpc-head">' +
      '<img src="' + (VP.ROOT || "") + 'assets/img/logo-vanapay.svg" alt="vana pay">' +
      '<div><b>vana pay chat</b><small>' + (focusSlug ? "Tu personal shopper en " + esc(STORE_NAME) : "Dime qué quieres comprar y te digo dónde pagarlo en paguitos") + "</small></div>" +
      '<button type="button" class="vpc-close" aria-label="Cerrar">&times;</button>' +
    "</header>" +
    '<p class="vpc-note">' + (focusSlug ? esc(STORE_NAME) + " es la tienda." : "Compras en el comercio.") + " vana pay es tu forma de pago.</p>" +
    '<div class="vpc-log" role="log" aria-live="polite"></div>' +
    '<div class="vpc-chips"></div>' +
    '<form class="vpc-form"><input type="text" maxlength="1000" autocomplete="off" placeholder="Escribe qué buscas" aria-label="Mensaje"><button type="submit">Enviar</button></form>' +
    '<p class="vpc-foot">Prototipo. Los paguitos son un estimado de referencia; los tuyos los verás al pagar con vana pay.</p>';

  document.body.appendChild(teasers);
  document.body.appendChild(fab);
  document.body.appendChild(panel);
  if (document.readyState === "complete") startTeasers();
  else window.addEventListener("load", startTeasers);

  var log = panel.querySelector(".vpc-log");
  var chips = panel.querySelector(".vpc-chips");
  var form = panel.querySelector(".vpc-form");
  var input = form.querySelector("input");
  var sendBtn = form.querySelector("button");
  var greeted = false;
  var busy = false;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmt(text) {
    // Texto plano con negritas **x**, saltos de línea y URLs como enlaces (el registro de vana pay
    // se muestra como botón). Nada más.
    var html = esc(text).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
    return html.replace(/(https?:\/\/[^\s<)]+?)([.,;:)]?)(?=\s|$)/g, function (m, url, tail) {
      var isSignup = /pay\.vana\.gt\/registro/.test(url);
      var label = isSignup ? "Crear mi cuenta de vana pay" : url.replace(/^https?:\/\//, "");
      return '<a class="vpc-link' + (isSignup ? " vpc-link-cta" : "") + '" href="' + url + '" target="_blank" rel="noopener">' + label + "</a>" + tail;
    });
  }
  function scrollLog() { log.scrollTop = log.scrollHeight; }
  function add(html, cls) {
    var el = document.createElement("div");
    el.className = "vpc-msg " + (cls || "bot");
    el.innerHTML = html;
    log.appendChild(el); scrollLog();
    return el;
  }
  function addNode(el) { log.appendChild(el); scrollLog(); return el; }

  var isMobile = function () { return window.matchMedia("(max-width: 719px)").matches; };
  var savedScroll = 0;
  // iOS con teclado: el viewport visible se encoge y Safari lo desplaza dentro del de layout. El
  // panel se ancla a ese viewport visible (top = offsetTop, height = height) y, si hay un campo
  // enfocado dentro del log, se mantiene a la vista en lugar de saltar al final del chat.
  var focusedField = null;
  function keepFocusedVisible() {
    if (focusedField && log.contains(focusedField)) {
      try { focusedField.scrollIntoView({ block: "center", behavior: "instant" }); } catch (e) { focusedField.scrollIntoView(); }
    } else {
      scrollLog();
    }
  }
  // adjustScroll: solo al abrir/cerrar el teclado o al enfocar. En los eventos de scroll del
  // viewport visible NO se toca el scroll del log: Safari los dispara mientras la persona
  // selecciona texto o mueve la lupa, y re-desplazar ahí cancela la selección (copiar/pegar).
  function fitViewport(adjustScroll) {
    if (panel.hidden || !isMobile()) { panel.style.height = ""; panel.style.top = ""; panel.classList.remove("vpc-kb"); return; }
    var vv = window.visualViewport;
    if (vv) {
      panel.style.height = Math.round(vv.height) + "px";
      panel.style.top = Math.round(vv.offsetTop) + "px";
      // Teclado abierto de verdad: el viewport visible perdió al menos 150 px de alto.
      panel.classList.toggle("vpc-kb", vv.height < window.innerHeight - 150);
    }
    if (adjustScroll) keepFocusedVisible();
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", function () { fitViewport(true); });
    window.visualViewport.addEventListener("scroll", function () { fitViewport(false); });
  }
  window.addEventListener("resize", function () { fitViewport(true); });
  panel.addEventListener("focusin", function (e) {
    var t = e.target;
    if (!(t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA"))) return;
    focusedField = t;
    if (!isMobile()) return;
    setTimeout(function () { fitViewport(true); }, 50); setTimeout(function () { fitViewport(true); }, 350); setTimeout(function () { fitViewport(true); }, 700);
  });
  panel.addEventListener("focusout", function () {
    setTimeout(function () {
      var a = document.activeElement;
      if (a && panel.contains(a) && (a.tagName === "INPUT" || a.tagName === "TEXTAREA")) return;
      focusedField = null; fitViewport(true);
    }, 250);
  });
  function lockPage() {
    if (!isMobile()) return;
    savedScroll = window.scrollY || 0;
    document.body.style.top = (-savedScroll) + "px";
    document.documentElement.classList.add("vpc-lock");
  }
  function unlockPage() {
    if (!document.documentElement.classList.contains("vpc-lock")) return;
    document.documentElement.classList.remove("vpc-lock");
    document.body.style.top = "";
    window.scrollTo(0, savedScroll);
  }

  function open(ctx, slug) {
    stopTeasers(true);
    if (slug !== undefined) setFocus(slug);
    panel.hidden = false;
    document.documentElement.classList.add("vpc-open");
    lockPage(); fitViewport(true);
    if (!greeted) {
      greeted = true;
      add(fmt(focusSlug
        ? "Hola, soy tu personal shopper de vana pay en " + STORE_NAME + ". Puedo ayudarte a encontrar algo y pagarlo en paguitos, o contarte cómo funciona vana pay y qué necesitas para tenerlo."
        : "Hola, soy tu personal shopper de vana pay. Te ayudo a encontrar lo que quieras comprar y a pagarlo en paguitos."));
      setChips(["¿Qué es vana pay?", "¿Qué necesito para tener vana pay?", "¿Cómo funcionan los paguitos?"].concat(focusSlug === "cat" ? ["Busco botas", "Ver mochilas"] : ["Lo más vendido", "Busco un regalo"]));
      renderQuickStart();
    }
    track("chat_open", { chatContext: ctx || "fab" });
    if (!isMobile()) setTimeout(function () { input.focus(); }, 50);
    if (!modeChecked) {
      modeChecked = true;
      fetch(AGENT_URL + "/health").then(function (r) { return r.json(); }).then(function (h) {
        if (h && h.mode === "demo") {
          add(fmt("Modo demo: respuestas con guion sobre el catálogo real de " + STORE_NAME + ", todavía sin IA."), "sys");
        }
        if (h && h.stores && h.stores.length) {
          h.stores.forEach(function (s) { NAMES[s.slug] = s.name; });
          ALL_NAMES = joinNames(h.stores.map(function (s) { return s.name; }));
          setFocus(focusSlug);
        }
        if (h && h.starters && h.starters.length && !busy && log.querySelectorAll(".vpc-msg.me").length === 0) {
          setChips(h.starters);
        }
      }).catch(function () { /* el primer mensaje mostrará el error */ });
    }
  }
  var modeChecked = false;
  function close() {
    panel.hidden = true;
    document.documentElement.classList.remove("vpc-open");
    unlockPage(); fitViewport(false);
  }

  fab.addEventListener("click", function () { open("fab", onPilotPage ? pageSlug : focusSlug); });
  // El buscador de la landing (search.js) abre el chat con la búsqueda ya hecha.
  window.VPChat = {
    active: true,
    open: function (ctx) { open(ctx || "api", focusSlug); },
    ask: function (text, ctx) { open(ctx || "search", ""); if (text && !busy) setTimeout(function () { send(text); }, 250); }
  };
  panel.querySelector(".vpc-close").addEventListener("click", close);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !panel.hidden) close(); });

  // Los CTAs de personal shopper de esta tienda abren el widget en vez de WhatsApp.
  // Fase de captura para que el listener de wa_click (analytics.js) no cuente
  // el clic como salida a WhatsApp.
  var pageSlug = STORES.filter(function (s) { return location.pathname.indexOf("/comercios/" + s + "/") >= 0; })[0] || "";
  var onPilotPage = !!pageSlug;
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[data-pilot], a[data-wa-slug], .chatbox a.btn-chat");
    if (!a) return;
    var slug = a.getAttribute("data-pilot") || a.getAttribute("data-wa-slug") || pageSlug;
    if (STORES.indexOf(slug) < 0) return;
    e.preventDefault(); e.stopPropagation();
    open(a.getAttribute("data-wa-context") || "pilot-cta", slug);
  }, true);

  // ---- envío y stream ------------------------------------------------------------
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text || busy) return;
    input.value = "";
    send(text);
  });

  function setChips(list, all) {
    chips.innerHTML = "";
    (all ? (list || []) : (list || []).slice(0, isMobile() ? 4 : 6)).forEach(function (c) {
      var label = typeof c === "string" ? c : (c.label || c.text || c.title || "");
      var message = typeof c === "string" ? c : (c.message || c.prompt || c.query || label);
      if (!label) return;
      var b = document.createElement("button");
      b.type = "button"; b.className = "vpc-chip"; b.textContent = label;
      b.addEventListener("click", function () {
        if (/^https?:\/\//.test(message)) { track("chat_link", { chatHref: message }); window.open(message, "_blank", "noopener"); return; }
        if (!busy) send(message);
      });
      chips.appendChild(b);
    });
  }

  function typing(on, label) {
    var t = log.querySelector(".vpc-typing");
    if (!on) { if (t) t.remove(); return; }
    if (!t) { t = document.createElement("div"); t.className = "vpc-typing"; log.appendChild(t); }
    t.innerHTML = "<i></i><i></i><i></i>" + (label ? " <span>" + esc(label) + "</span>" : "");
    scrollLog();
  }

  function send(text) {
    busy = true; sendBtn.disabled = true; input.disabled = true;
    setChips([]);
    add(fmt(text), "me");
    track("chat_message");
    var bot = null;     // burbuja de texto en curso
    var botText = "";
    typing(true, "Pensando");

    // Un corte de red (túnel, reinicio, señal) reintenta solo una vez tras 2 s; si vuelve a fallar,
    // muestra un aviso claro con botón para reintentar el mismo mensaje.
    function attempt(n) {
      return fetch(AGENT_URL + "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sid, message: text, store: focusSlug, profile: Object.keys(profile).length ? profile : null })
      }).then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        var reader = res.body.getReader();
        var dec = new TextDecoder();
        var buf = "";
        function pump() {
          return reader.read().then(function (r) {
            if (r.done) { flush(true); return; }
            buf += dec.decode(r.value, { stream: true });
            flush(false);
            return pump();
          });
        }
        function flush(final) {
          var frames = buf.split("\n\n");
          buf = final ? "" : frames.pop();
          frames.forEach(function (frame) {
            var type = "", data = "";
            frame.split("\n").forEach(function (line) {
              if (line.indexOf("event:") === 0) type = line.slice(6).trim();
              else if (line.indexOf("data:") === 0) data += line.slice(5).trim();
            });
            if (!type) return;
            var payload = {};
            try { payload = data ? JSON.parse(data) : {}; } catch (e) { payload = {}; }
            handle(type, payload);
          });
        }
        return pump();
      }).catch(function (err) {
        var network = !(err && /^HTTP \d+/.test(err.message || ""));
        if (network && n < 1) {
          typing(true, "Se cortó la conexión, reintentando");
          return new Promise(function (r) { setTimeout(r, 2000); }).then(function () { return attempt(n + 1); });
        }
        typing(false);
        var box = add(fmt(network
          ? "Se cortó la conexión con el personal shopper. Revisa tu señal y vuelve a intentar."
          : "El personal shopper no pudo responder ahora (" + err.message + ")."), "err");
        var retry = document.createElement("button");
        retry.type = "button"; retry.className = "vpc-chip vpc-retry"; retry.textContent = "Reintentar";
        retry.addEventListener("click", function () { if (!busy) { box.remove(); send(text); } });
        box.appendChild(retry);
      });
    }
    attempt(0).then(function () {
      typing(false);
      busy = false; sendBtn.disabled = false; input.disabled = false;
      if (!isMobile()) input.focus();
    });

    function handle(type, d) {
      if (type === "text_delta") {
        typing(false);
        if (!bot) { bot = add("", "bot"); botText = ""; }
        botText += d.text || "";
        bot.innerHTML = fmt(botText); scrollLog();
      } else if (type === "tool_call") {
        var label = ({
          search_products: "Buscando en " + STORE_NAME,
          get_product_details: "Revisando tallas y colores",
          add_to_cart: "Agregando al carrito",
          update_cart_item: "Actualizando el carrito",
          remove_from_cart: "Actualizando el carrito",
          get_cart: "Revisando el carrito",
          search_policies: "Consultando políticas de " + STORE_NAME,
          checkout: "Preparando tu pago"
        })[d.tool] || "Un momento";
        bot = null; typing(true, label);
      } else if (type === "progress") {
        typing(true, d.message || "Un momento");
      } else if (type === "ui") {
        typing(false); bot = null;
        renderUi(d.component, d.payload || {});
      } else if (type === "cart_update") {
        renderCart(d.cart || {});
      } else if (type === "error") {
        typing(false); bot = null;
        add(fmt(d.message || "Algo salió mal. Intenta de nuevo."), "err");
      } else if (type === "turn_complete") {
        typing(false);
        if (window.console && d.usage) console.debug("[vpc] turno", d.elapsed_ms + " ms", d.usage);
      }
    }
  }

  // ---- render de componentes -------------------------------------------------------
  function renderUi(component, p) {
    // El blueprint emite products/comparison/suggestions/checkout/guide/plan; el modo demo
    // usa los mismos nombres. Se aceptan también los "present_*" por compatibilidad.
    component = String(component || "").replace(/^present_/, "");
    if (component === "products" || component === "comparison") {
      var items = p.items || p.picks || p.products || [];
      if (!items.length) return;
      if (p.title) add(fmt(p.title), "sys");
      var row = document.createElement("div"); row.className = "vpc-cards" + (p.layout === "list" ? " vpc-cards-list" : "");
      items.forEach(function (it) {
        var prod = it.product || it;
        var card = document.createElement("div");
        card.className = "vpc-card" + (prod.in_stock === false ? " out" : "");
        var ov = prod.option_values ? Object.keys(prod.option_values).filter(function (k) { return k !== "Tienda"; }).map(function (k) { return prod.option_values[k]; }) : null;
        var opts = ov ? ov.join(" · ")
                 : prod.options ? Object.keys(prod.options).map(function (k) { return k + ": " + prod.options[k].join("/"); }).join(" · ") : "";
        card.innerHTML =
          '<div class="vpc-img">' + (prod.image_url ? '<img src="' + esc(thumb(prod.image_url, 480)) + '" alt="" loading="lazy">' : "") + "</div>" +
          '<div class="vpc-body">' +
            (prod.brand && STORES.length > 1 ? '<div class="vpc-store">' + esc(prod.brand) + "</div>" : "") +
            '<div class="vpc-title">' + esc(prod.title) + "</div>" +
            (prod.price > PAGUI_MIN
              ? paguiHTML(prod.price, "vpc-price vpc-price-pagui") + '<div class="vpc-fullprice">' + MONEY(prod.price) + " en total" + (prod.in_stock === false ? " · agotado" : "") + "</div>"
              : '<div class="vpc-price">' + (prod.price != null ? MONEY(prod.price) : "") + (prod.in_stock === false ? " · agotado" : "") + "</div>") +
            (opts ? '<div class="vpc-opts">' + esc(opts) + "</div>" : "") +
            (it.reason ? '<div class="vpc-reason">' + esc(it.reason) + "</div>" : "") +
            (p.layout === "list" ? "" : '<button type="button">Lo quiero</button>') +
          "</div>";
        var img = card.querySelector("img");
        if (img) img.addEventListener("error", function () { img.remove(); });
        var btn = card.querySelector("button");
        if (btn) btn.addEventListener("click", function () {
          if (!busy) send("Quiero " + prod.title + (prod.option_values ? "" : ". ¿Qué tallas y colores hay?"));
        });
        row.appendChild(card);
      });
      addNode(row);
    } else if (component === "merchants") {
      renderMerchants(p);
    } else if (component === "checkout") {
      renderCheckout(p);
    } else if (component === "suggestions") {
      setChips(p.suggestions || p.items || p.chips || []);
    } else if (component === "guide" || component === "plan") {
      if (p.title) add(fmt(p.title), "sys");
    }
  }

  // Arranque: una sola pregunta con dos botones. "Sí" pide el número y saluda por nombre; "No"
  // pasa la conversación al agente para acompañar a abrir la cuenta; "Solo quiero ver productos"
  // salta el paso. Las tallas y demás las pregunta el agente solo cuando hacen falta.
  // Sin cuenta: nada de mandar a registrarse; se muestra qué se puede comprar con vana pay.
  var CATEGORY_CHIPS = [
    { label: "Tenis", message: "Busco tenis" }, { label: "Ropa", message: "Busco ropa" },
    { label: "Zapatos", message: "Busco zapatos" }, { label: "Mochilas", message: "Busco una mochila" },
    { label: "Tecnología", message: "Busco tecnología" }, { label: "Relojes", message: "Busco un reloj" },
    { label: "Bocinas", message: "Busco bocinas" }, { label: "Audífonos", message: "Busco audífonos" },
    { label: "Belleza", message: "Busco belleza" }, { label: "Hogar", message: "Busco cosas para el hogar" }
  ];
  function offerCategories(intro) {
    add(fmt(intro), "bot");
    setChips(CATEGORY_CHIPS, true);
  }

  function renderQuickStart() {
    var card = document.createElement("div"); card.className = "vpc-quick";
    card.innerHTML =
      '<div class="vpc-quick-q">¿Ya tienes vana pay?</div>' +
      '<div class="vpc-quick-yn">' +
        '<button type="button" class="vpc-quick-yes">Sí, ya tengo</button>' +
        '<button type="button" class="vpc-quick-no">No, todavía no</button>' +
      "</div>" +
      '<button type="button" class="vpc-quick-skip">Solo quiero ver productos</button>' +
      '<div class="vpc-quick-idbox" hidden>' +
        '<label>Tu número de vana pay</label>' +
        '<div class="vpc-phone-row"><span class="vpc-phone-cc">+502</span>' +
        '<input type="tel" inputmode="numeric" maxlength="9" placeholder="5555 5555" autocomplete="tel-national" aria-label="Teléfono"></div>' +
        '<button type="button" class="vpc-pay vpc-quick-go">Continuar</button>' +
        '<small>Solo lo usamos para reconocer tu cuenta.</small>' +
        '<div class="vpc-phone-err" hidden></div>' +
      "</div>";
    var idbox = card.querySelector(".vpc-quick-idbox");
    card.querySelector(".vpc-quick-skip").addEventListener("click", function () { track("chat_onboard", { chatAnswer: "skip" }); card.remove(); });
    card.querySelector(".vpc-quick-no").addEventListener("click", function () {
      track("chat_onboard", { chatAnswer: "no" });
      card.remove();
      offerCategories("Sin problema, igual puedes ver todo lo que se compra con vana pay en paguitos. ¿Qué te interesa?");
    });
    card.querySelector(".vpc-quick-yes").addEventListener("click", function () {
      track("chat_onboard", { chatAnswer: "yes" });
      card.querySelector(".vpc-quick-yn").hidden = true; card.querySelector(".vpc-quick-skip").hidden = true;
      card.querySelector(".vpc-quick-q").textContent = "Qué bien. Dime tu número y te reconozco.";
      idbox.hidden = false;
      var inp = idbox.querySelector("input");
      try { inp.value = sessionStorage.getItem("vp.chat.phone") || ""; } catch (e) { /* noop */ }
      inp.focus();
    });
    card.querySelector(".vpc-quick-go").addEventListener("click", function () {
      var input = idbox.querySelector("input"), err = idbox.querySelector(".vpc-phone-err");
      var digits = input.value.replace(/\D/g, "");
      if (!/^[2-7]\d{7}$/.test(digits)) { err.textContent = "Escribe un número de Guatemala de 8 dígitos."; err.hidden = false; return; }
      err.hidden = true; var go = card.querySelector(".vpc-quick-go"); go.disabled = true; go.textContent = "Buscando tu cuenta";
      try { sessionStorage.setItem("vp.chat.phone", digits); } catch (e) { /* noop */ }
      fetch(AGENT_URL + "/api/identify", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sid, phone: "+502" + digits }) })
        .then(function (r) { return r.ok ? r.json() : r.json().then(function (j) { throw new Error(j.detail || ("HTTP " + r.status)); }); })
        .then(function (j) {
          track("chat_identify", { chatFound: !!j.exists, chatDemo: !!j.demo });
          card.remove();
          if (j.exists) {
            identified = j;
            if (j.profile) saveProfile(j.profile);
            add(fmt("Hola " + j.first_name + ". Tu cuenta de vana pay está lista" + (j.disponible_q ? " y tienes **" + VP.money(j.disponible_q) + " disponibles** para comprar en paguitos" : "") + ". Dime qué buscas y te muestro lo que te alcanza con tu crédito." + (j.demo ? "\n\nPerfil de demostración." : "")), "bot");
            setChips(["Algo que me alcance con mi crédito", "Lo más vendido", "Busco un regalo"]);
          } else {
            offerCategories("No encontramos una cuenta con ese número, pero igual puedes ver todo lo que se compra con vana pay en paguitos. ¿Qué te interesa?");
          }
        })
        .catch(function (e) { err.textContent = "No pude verificar (" + (e && e.message ? e.message : "error") + "). Intenta de nuevo."; err.hidden = false; go.disabled = false; go.textContent = "Continuar"; });
    });
    addNode(card);
  }

  // Comercios afiliados a vana pay donde sí venden lo que pidió (respaldo cuando las tiendas
  // Shopify no lo tienen). El botón lleva a la página del comercio en esta landing, que ya
  // tiene sus formas de comprar; se abre en otra pestaña para no perder el chat.
  function renderMerchants(p) {
    var items = p.items || [];
    if (!items.length) return;
    add(fmt(p.note || ("Comercios afiliados a vana pay para \"" + (p.query || "") + "\"")), "sys");
    var row = document.createElement("div"); row.className = "vpc-cards vpc-merchants";
    items.forEach(function (m) {
      var card = document.createElement("a");
      card.className = "vpc-card vpc-merchant";
      card.href = (VP.ROOT || "") + (m.page || ("comercios/" + m.slug + "/"));
      card.target = "_blank"; card.rel = "noopener";
      card.innerHTML =
        '<div class="vpc-merchant-logo">' + (m.logo ? '<img src="' + esc((VP.ROOT || "") + m.logo) + '" alt="" loading="lazy">' : "") + "</div>" +
        '<div class="vpc-body">' +
          '<div class="vpc-title">' + esc(m.name) + "</div>" +
          (m.categories && m.categories.length ? '<div class="vpc-opts">' + esc(m.categories.join(" · ")) + "</div>" : "") +
          '<div class="vpc-mods">' + (m.modalities || []).map(function (x) { return "<span>" + esc(x) + "</span>"; }).join("") +
            (m.chat_enabled ? '<span class="is-chat">Personal shopper</span>' : "") + "</div>" +
          '<span class="vpc-merchant-cta">Ver cómo comprar</span>' +
        "</div>";
      card.addEventListener("click", function () { track("chat_merchant_click", { chatMerchant: m.slug }); });
      row.appendChild(card);
    });
    addNode(row);
  }

  function renderCart(cart) {
    var items = cart.items || [];
    var count = cart.item_count != null ? cart.item_count : items.reduce(function (n, i) { return n + (i.quantity || 0); }, 0);
    var subtotal = cart.subtotal != null ? cart.subtotal : items.reduce(function (n, i) { return n + (i.price || 0) * (i.quantity || 0); }, 0);
    var el = log.querySelector(".vpc-cart") || document.createElement("div");
    el.className = "vpc-cart";
    var thumbs = items.filter(function (i) { return i.image_url; }).slice(0, 3).map(function (i) {
      return '<img src="' + esc(thumb(i.image_url, 120)) + '" alt="" loading="lazy">';
    }).join("");
    el.innerHTML = '<span class="vpc-thumbs">' + (thumbs || ICON) + "</span><span>Carrito: " + count + (count === 1 ? " artículo" : " artículos") +
      (subtotal > PAGUI_MIN ? paguiHTML(subtotal, "vpc-cart-pagui") : "") + "</span><b>" + MONEY(subtotal) + "</b>";
    addNode(el);
  }

  function renderCheckout(p) {
    var cart = p.cart || {};
    var items = cart.items || [];
    var handoffs = p.handoffs || [];
    var single = handoffs.length === 1;
    var old = log.querySelector(".vpc-cart"); if (old) old.remove();  // el resumen del carrito sobra aquí
    var box = document.createElement("div"); box.className = "vpc-checkout";
    var subtotal = cart.subtotal != null ? cart.subtotal : items.reduce(function (n, i) { return n + (i.price || 0) * (i.quantity || 0); }, 0);
    function lines(list) {
      return "<ul>" + list.map(function (i) {
        return "<li>" + (i.image_url ? '<img src="' + esc(thumb(i.image_url, 120)) + '" alt="" loading="lazy">' : "") +
          '<span class="vpc-line-title">' + i.quantity + " x " + esc(i.title) + "</span><span class=\"vpc-line-price\">" + MONEY((i.price || 0) * (i.quantity || 1)) + "</span></li>";
      }).join("") + "</ul>";
    }
    function payBtn(h) {
      return '<a class="vpc-pay" href="' + esc(h.url) + '" target="_blank" rel="noopener" data-seller="' + esc(h.seller || "") + '">' +
        esc(h.label || ("Pagar con vana pay en " + (h.seller || STORE_NAME))) + "</a>";
    }
    var html = "";
    if (handoffs.length > 1) {
      html += "<h4>Tu compra: un pago por tienda</h4>";
      handoffs.forEach(function (h) {
        var mine = items.filter(function (i) { return (i.option_values || {}).Tienda === h.seller; });
        var sub = mine.reduce(function (n, i) { return n + (i.price || 0) * (i.quantity || 0); }, 0);
        html += '<div class="vpc-seller"><div class="vpc-seller-name">' + esc(h.seller) + "</div>" + lines(mine) +
          '<div class="vpc-total"><span>Total en ' + esc(h.seller) + "</span><span>" + MONEY(sub) + "</span></div>" +
          (sub > PAGUI_MIN ? '<div class="vpc-total-pagui"><span>Con vana pay</span>' + paguiHTML(sub, "vpc-pagui-inline") + "</div>" : "") + "</div>";
      });
    } else {
      var seller = handoffs[0] && handoffs[0].seller ? handoffs[0].seller : STORE_NAME;
      html += "<h4>Tu compra en " + esc(seller) + "</h4>" + lines(items) +
        '<div class="vpc-total"><span>Total</span><span>' + MONEY(subtotal) + "</span></div>" +
        (subtotal > PAGUI_MIN ? '<div class="vpc-total-pagui"><span>Con vana pay</span>' + paguiHTML(subtotal, "vpc-pagui-inline") + "</div>" : "");
    }
    if (!handoffs.length) {
      html += "<small>Aún no hay un enlace de pago. Agrega algo al carrito primero.</small>";
      box.innerHTML = html; addNode(box); return;
    }
    html += '<div class="vpc-paybtns">' + handoffs.map(payBtn).join("") + "</div>" +
    "<small class=\"vpc-checkout-foot\">" + (single
      ? "Vas al checkout de " + esc(seller) + ". Ahí eliges vana pay y ves tus paguitos según tu perfil; el primero se paga hoy."
      : "Cada botón abre el checkout de su tienda. Ahí eliges vana pay y ves tus paguitos según tu perfil; el primero se paga hoy.") + "</small>";
    box.innerHTML = html;

    // El registro de la compra (nota en el carrito, UTM, intención) sigue por debajo, sin pedir datos.
    var intentSent = null;
    function sendIntent() {
      if (intentSent) return intentSent;
      intentSent = fetch(AGENT_URL + "/api/checkout-intent", {
        method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
        body: JSON.stringify({ session_id: sid, phone: null })
      }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
      return intentSent;
    }
    function payWith(h, evt) {
      track("chat_checkout", { chatItems: items.length, chatSeller: h.seller || "" });
      if (evt) evt.preventDefault();
      var w = null;
      try { w = window.open("about:blank", "_blank"); } catch (err) { w = null; }
      var go = function () { if (w && !w.closed) { try { w.location.href = h.url; } catch (err) { location.assign(h.url); } } else { location.assign(h.url); } };
      var done = false;
      var finish = function () { if (!done) { done = true; go(); } };
      setTimeout(finish, 2500);
      sendIntent().then(finish, finish);
    }
    box.querySelectorAll(".vpc-paybtns .vpc-pay").forEach(function (a, i) {
      a.addEventListener("click", function (e) { payWith(handoffs[i], e); });
    });
    addNode(box);
  }
})();
