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
  try {
    if (qs.get("agent") === "1") localStorage.setItem("vp.agent", VP.AGENT_DEV_URL || "http://localhost:8010");
    if (qs.get("agent") === "0") localStorage.removeItem("vp.agent");
  } catch (e) { /* sin storage: solo VP.AGENT_URL */ }
  var AGENT_URL = VP.AGENT_URL || "";
  try { AGENT_URL = localStorage.getItem("vp.agent") || AGENT_URL; } catch (e) { /* noop */ }
  if (!AGENT_URL) return;
  AGENT_URL = AGENT_URL.replace(/\/+$/, "");

  var STORES = VP.AGENT_STORES || ["dressy"];
  var STORE_NAME = VP.AGENT_STORE_NAME || "Dressy";
  var MONEY = function (v) { return "Q" + Number(v).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };

  // ---- sesión ---------------------------------------------------------------
  function rand() {
    var a = new Uint8Array(16); (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }
  var sid;
  try { sid = sessionStorage.getItem("vp.chat.sid"); } catch (e) { /* noop */ }
  if (!sid) { sid = rand(); try { sessionStorage.setItem("vp.chat.sid", sid); } catch (e) { /* noop */ } }

  function track(name, params) {
    var p = params || {};
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(Object.assign({ event: name, chatStore: STORES[0] }, p));
    if (typeof window.clarity === "function") { try { window.clarity("event", name); } catch (e) { /* noop */ } }
  }

  // ---- DOM ----------------------------------------------------------------------
  var ICON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm3 5v2h10V9H7zm0 4v2h7v-2H7z"/></svg>';
  var fab = document.createElement("button");
  fab.type = "button"; fab.className = "vpc-fab btn-neon"; fab.setAttribute("aria-label", "Abrir el chat del personal shopper");
  fab.innerHTML = ICON + '<span class="vpc-fab-txt">Personal shopper<small>en ' + esc(STORE_NAME) + "</small></span>";

  var panel = document.createElement("section");
  panel.className = "vpc-panel"; panel.hidden = true; panel.setAttribute("aria-label", "vana pay chat");
  panel.innerHTML =
    '<header class="vpc-head">' +
      '<img src="' + (VP.ROOT || "") + 'assets/img/logo-vanapay.svg" alt="vana pay">' +
      '<div><b>vana pay chat</b><small>Tu personal shopper en ' + esc(STORE_NAME) + "</small></div>" +
      '<button type="button" class="vpc-close" aria-label="Cerrar">&times;</button>' +
    "</header>" +
    '<p class="vpc-note">' + esc(STORE_NAME) + " es la tienda. vana pay es tu forma de pago.</p>" +
    '<div class="vpc-log" role="log" aria-live="polite"></div>' +
    '<div class="vpc-chips"></div>' +
    '<form class="vpc-form"><input type="text" maxlength="1000" autocomplete="off" placeholder="Escribe qué buscas" aria-label="Mensaje"><button type="submit">Enviar</button></form>' +
    '<p class="vpc-foot">Prototipo. Tus paguitos exactos los verás al pagar con vana pay.</p>';

  document.body.appendChild(fab);
  document.body.appendChild(panel);

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
    // Texto plano con negritas **x** y saltos de línea; nada más.
    return esc(text).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
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

  function open(ctx) {
    panel.hidden = false;
    document.documentElement.classList.add("vpc-open");
    if (!greeted) {
      greeted = true;
      add(fmt("Hola, soy tu personal shopper de vana pay en " + STORE_NAME + ". Cuéntame qué buscas y te ayudo a encontrarlo, elegir talla o color y llegar al pago."));
      setChips(["Busco un hoodie", "Quiero un vestido", "Ver bolsos"]);
    }
    track("chat_open", { chatContext: ctx || "fab" });
    setTimeout(function () { input.focus(); }, 50);
  }
  function close() {
    panel.hidden = true;
    document.documentElement.classList.remove("vpc-open");
  }

  fab.addEventListener("click", function () { open("fab"); });
  panel.querySelector(".vpc-close").addEventListener("click", close);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !panel.hidden) close(); });

  // Los CTAs del piloto de esta tienda abren el widget en vez de WhatsApp.
  // Fase de captura para que el listener de wa_click (analytics.js) no cuente
  // el clic como salida a WhatsApp.
  var onPilotPage = STORES.some(function (s) { return location.pathname.indexOf("/comercios/" + s + "/") >= 0; });
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[data-pilot], a[data-wa-slug], .chatbox a.btn-chat");
    if (!a) return;
    var slug = a.getAttribute("data-pilot") || a.getAttribute("data-wa-slug") || (onPilotPage ? STORES[0] : "");
    if (STORES.indexOf(slug) < 0) return;
    e.preventDefault(); e.stopPropagation();
    open(a.getAttribute("data-wa-context") || "pilot-cta");
  }, true);

  // ---- envío y stream ------------------------------------------------------------
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text || busy) return;
    input.value = "";
    send(text);
  });

  function setChips(list) {
    chips.innerHTML = "";
    (list || []).forEach(function (c) {
      var label = typeof c === "string" ? c : (c.label || c.text || c.title || "");
      var message = typeof c === "string" ? c : (c.message || c.prompt || c.query || label);
      if (!label) return;
      var b = document.createElement("button");
      b.type = "button"; b.className = "vpc-chip"; b.textContent = label;
      b.addEventListener("click", function () { if (!busy) send(message); });
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

    fetch(AGENT_URL + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sid, message: text })
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
      typing(false);
      add(fmt("No pude conectar con el personal shopper. " + (err && err.message ? err.message : "")), "err");
    }).then(function () {
      typing(false);
      busy = false; sendBtn.disabled = false; input.disabled = false; input.focus();
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
    if (component === "present_products" || component === "present_comparison") {
      var items = p.items || p.picks || p.products || [];
      if (!items.length) return;
      if (p.title) add(fmt(p.title), "sys");
      var row = document.createElement("div"); row.className = "vpc-cards";
      items.forEach(function (it) {
        var prod = it.product || it;
        var card = document.createElement("div");
        card.className = "vpc-card" + (prod.in_stock === false ? " out" : "");
        var opts = prod.option_values ? Object.keys(prod.option_values).map(function (k) { return prod.option_values[k]; }).join(" · ")
                 : prod.options ? Object.keys(prod.options).map(function (k) { return k + ": " + prod.options[k].join("/"); }).join(" · ") : "";
        card.innerHTML =
          '<div class="vpc-img">' + (prod.image_url ? '<img src="' + esc(prod.image_url) + '" alt="" loading="lazy">' : "") + "</div>" +
          '<div class="vpc-body">' +
            '<div class="vpc-title">' + esc(prod.title) + "</div>" +
            '<div class="vpc-price">' + (prod.price != null ? MONEY(prod.price) : "") + (prod.in_stock === false ? " · agotado" : "") + "</div>" +
            (opts ? '<div class="vpc-opts">' + esc(opts) + "</div>" : "") +
            (it.reason ? '<div class="vpc-reason">' + esc(it.reason) + "</div>" : "") +
            '<button type="button">Lo quiero</button>' +
          "</div>";
        card.querySelector("button").addEventListener("click", function () {
          if (!busy) send("Quiero " + prod.title + (prod.option_values ? "" : ". ¿Qué tallas y colores hay?"));
        });
        row.appendChild(card);
      });
      addNode(row);
    } else if (component === "checkout") {
      renderCheckout(p);
    } else if (component === "present_suggestions") {
      setChips(p.suggestions || p.items || p.chips || []);
    } else if (component === "present_guide" || component === "present_plan") {
      if (p.title) add(fmt(p.title), "sys");
    }
  }

  function renderCart(cart) {
    var items = cart.items || [];
    var count = cart.item_count != null ? cart.item_count : items.reduce(function (n, i) { return n + (i.quantity || 0); }, 0);
    var subtotal = cart.subtotal != null ? cart.subtotal : items.reduce(function (n, i) { return n + (i.price || 0) * (i.quantity || 0); }, 0);
    var el = log.querySelector(".vpc-cart") || document.createElement("div");
    el.className = "vpc-cart";
    el.innerHTML = ICON + "<span>Carrito en " + esc(STORE_NAME) + ": " + count + (count === 1 ? " artículo" : " artículos") + "</span><b>" + MONEY(subtotal) + "</b>";
    addNode(el);
  }

  function renderCheckout(p) {
    var cart = p.cart || {};
    var items = cart.items || [];
    var handoff = (p.handoffs || [])[0];
    var box = document.createElement("div"); box.className = "vpc-checkout";
    var subtotal = cart.subtotal != null ? cart.subtotal : items.reduce(function (n, i) { return n + (i.price || 0) * (i.quantity || 0); }, 0);
    box.innerHTML =
      "<h4>Tu compra en " + esc(STORE_NAME) + "</h4>" +
      "<ul>" + items.map(function (i) {
        return "<li><span>" + i.quantity + " x " + esc(i.title) + "</span><span>" + MONEY((i.price || 0) * (i.quantity || 1)) + "</span></li>";
      }).join("") + "</ul>" +
      '<div class="vpc-total"><span>Total</span><span>' + MONEY(subtotal) + "</span></div>" +
      (handoff
        ? '<a class="vpc-pay" href="' + esc(handoff.url) + '" target="_blank" rel="noopener">' + esc(handoff.label || ("Pagar con vana pay en " + STORE_NAME)) + "</a>" +
          "<small>Vas al checkout de " + esc(STORE_NAME) + ". Ahí eliges vana pay como forma de pago y ves tus paguitos según tu perfil. El primer paguito se paga hoy.</small>"
        : "<small>Aún no hay un enlace de pago. Agrega algo al carrito primero.</small>");
    var a = box.querySelector(".vpc-pay");
    if (a) a.addEventListener("click", function () { track("chat_checkout", { chatItems: items.length }); });
    addNode(box);
  }
})();
