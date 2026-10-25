/* Shared helpers: i18n, menu loading, CSV + PDF-text parser. Plain script (works from file://). */
(function (G) {
  var T = {
    add: ["Añadir", "Add"], cart: ["Carrito", "Cart"], note: ["Nota (opcional)", "Note (optional)"],
    empty: ["Tu carrito está vacío", "Your cart is empty"], checkout: ["Pagar", "Checkout"],
    mock: ["Pago simulado — no se cobra nada", "Mock payment — nothing is charged"],
    sent: ["¡Pedido enviado a cocina!", "Order sent to kitchen!"], upload: ["Subir carta", "Upload menu"],
    review: ["Revisar platos", "Review dishes"], save: ["Guardar carta", "Save menu"],
    table: ["Mesa", "Table"], subtotal: ["Subtotal", "Subtotal"], iva: ["IVA incluido (10%)", "VAT included (10%)"], send: ["Enviar pedido", "Send order"], payall: ["Pagar todo", "Pay all"],
    split: ["Dividir cuenta", "Split the bill"], equal: ["Partes iguales", "Equal split"], byitems: ["Por platos", "By items"], custom: ["Importes libres", "Custom amounts"],
    people: ["Personas", "People"], payshare: ["Pagar mi parte", "Pay my share"], payrest: ["Pagar el resto", "Pay the rest"],
    unassigned: ["Sin asignar: {x}", "Unassigned: {x}"], remaining: ["Restante: {x}", "Remaining: {x}"], paidof: ["Pagado {a} de {t}", "Paid {a} of {t}"],
    pending: ["Pendiente", "Pending"], paid: ["Pagado", "Paid"], locked: ["Modo bloqueado tras el primer pago", "Mode locked after first payment"],
    overtotal: ["La suma supera el total", "Amounts exceed the total"], allpaid: ["Cuenta pagada. ¡Gracias!", "Bill paid. Thank you!"],
    zeroamt: ["Los importes deben ser mayores que 0", "Amounts must be greater than 0"], mustsum: ["La suma debe ser igual al total", "Amounts must add up to the total"],
    addperson: ["+ Persona", "+ Person"], person: ["Persona", "Person"], cancel: ["Cancelar", "Cancel"], order: ["Pedido", "Order"], badamt: ["Importe no válido", "Invalid amount"],
    unit: ["ud.", "unit"], cancelround: ["Cancelar ronda", "Cancel round"], cancelpending: ["Cancelación pendiente", "Cancel pending"],
    cancelrejected: ["Cancelación no aceptada", "Cancel not accepted"], cancelask: ["¿Pedir a cocina que cancele esta ronda?", "Ask the kitchen to cancel this round?"],
    sentrounds: ["Rondas enviadas", "Sent rounds"], paywait: ["Hay una cancelación pendiente: espera la respuesta de cocina para pagar.", "A cancellation is pending: wait for the kitchen before paying."], toshare: ["Para compartir", "To share"], sharedgrp: ["Compartido", "Shared"], you: ["tú", "you"],
    readonly: ["Solo lectura (otro comensal)", "Read-only (another guest)"], switch: ["Cambiar comensal", "Switch guest"], guestname: ["¿Cómo te llamas?", "What's your name?"],
    round: ["Ronda {n}", "Round {n}"], changed: ["Otro comensal cambió el pedido", "Another guest changed the order"],
    sendall: ["Enviar el pedido de toda la mesa", "Send the whole table's order"], nothingsent: ["Aún no se ha enviado ningún pedido.", "No order has been sent yet."], shared: ["compartido", "shared"], choose: ["Elige ración", "Choose a portion"],
    picktable: ["Mesa ? — elige tu mesa", "Table ? — pick your table"], tablehelp: ["Elige el número de tu mesa (1–30).", "Choose your table number (1–30)."],
    total: ["Total", "Total"], remove: ["Quitar", "Remove"], back: ["Volver", "Back"], menu: ["Carta", "Menu"],
    pay: ["Pagar", "Pay"], processing: ["Procesando…", "Processing…"],
    neworder: ["Nuevo pedido", "New order"], kitchen: ["Cocina", "Kitchen"], done: ["Hecho", "Done"],
    noorders: ["Sin pedidos pendientes", "No pending orders"], showdone: ["Mostrar hechos", "Show done"],
    clear: ["Borrar todo", "Clear all"], portion: ["Ración", "Portion"], from: ["desde", "from"],
    method: ["Método de pago", "Payment method"], print: ["Imprimir", "Print"]
  };
  var lang = localStorage.getItem("lang") || "es";
  var U = G.U = {
    lang: function () { return lang; },
    setLang: function (l) { lang = l; localStorage.setItem("lang", l); },
    t: function (k) { var v = T[k]; return v ? v[lang === "en" ? 1 : 0] : k; },
    // localized field with ES fallback
    L: function (o) { if (!o) return ""; if (typeof o === "string") return o; return (lang === "en" && o.en) ? o.en : (o.es || o.en || ""); },
    eur: function (n) { return (Math.round(n * 100) / 100).toLocaleString(lang === "en" ? "en-IE" : "es-ES", { style: "currency", currency: "EUR" }); },
    esc: function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); },
    getMenu: function () {
      try { var m = JSON.parse(localStorage.getItem("menu")); if (m && m.dishes && m.dishes.length) return m; } catch (e) {}
      return G.MENU;
    },
    defaultChips: function () { return G.MENU ? G.MENU.chips : {}; },
    num: function (s) { s = String(s).trim().replace("€", "").trim().replace(",", "."); return /^\d+(\.\d{1,2})?$/.test(s) ? parseFloat(s) : NaN; },
    variants: function (a, b) {
      return [{ id: "half", name: { es: "Media", en: "Half" }, price: a }, { id: "full", name: { es: "Entera", en: "Full" }, price: b }];
    },
    slug: function (s) { return String(s).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 24) || "cat"; }
  };

  /* DOM helper: U.h(tag, {attrs}, ...children). Strings become text nodes (never innerHTML). */
  U.h = function (tag, a) {
    var el = document.createElement(tag); a = a || {};
    Object.keys(a).forEach(function (k) { var v = a[k]; if (v == null || v === false) return;
      if (k === "class") el.className = v; else if (k === "text") el.textContent = v; else if (k === "value") el.value = v;
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? "" : v); });
    for (var i = 2; i < arguments.length; i++) (function ap(c) { if (c == null || c === false) return; if (Array.isArray(c)) return c.forEach(ap);
      el.appendChild(typeof c === "object" ? c : document.createTextNode(String(c))); })(arguments[i]);
    return el;
  };
  U.cents = function (n) { return Math.round(n * 100); };
  U.eurC = function (c) { return U.eur(c / 100); };

  /* ---------- PDF text -> rows ----------
     Row shape: {category,name,name_en,desc,desc_en,variants:[{label_es,label_en,price}],labelsAssumed,chips,conf,reason} */
  var P = "€?\\s*(\\d{1,3}(?:[.,]\\d{1,2})?)\\s*€?";
  var PRICE_RE = new RegExp("^(.*?\\S)\\s+" + P + "\\s*(?:\\/\\s*" + P + ")?\\s*$");
  var SKIP_RE = /(www\.|@|https?:|iva incluido|al[eé]rgenos|^\s*·)/i;
  U.mkVariants = function (prices, les, len) {
    les = les || []; len = len || [];
    if (prices.length === 1) return [{ label_es: les[0] || "", label_en: len[0] || "", price: prices[0] }];
    var D = [["Media", "Half"], ["Entera", "Full"]];
    return prices.map(function (p, k) {
      var d = prices.length === 2 ? D[k] : ["Opción " + (k + 1), "Option " + (k + 1)];
      return { label_es: les[k] || d[0], label_en: len[k] || d[1], price: p };
    });
  };
  U.parseMenuLines = function (lines) {
    var rows = [], cat = "", pendingCat = null, last = null;
    lines = lines.map(function (l) { return l.replace(/[ \t\u00a0]+/g, " ").trim(); }).filter(Boolean);
    lines.forEach(function (l) {
      // \u0001 prefix = outdented line (from itemsToLines layout): treat as heading/category
      if (l.charAt(0) === "\u0001") { l = l.slice(1).trim(); if (l && !SKIP_RE.test(l) && l.length <= 60) { pendingCat = l; last = null; return; } }
      if (SKIP_RE.test(l)) { last = null; return; }
      var m = l.match(PRICE_RE);
      if (m && !/^[\d\s.,\/€]+$/.test(m[1])) {
        if (pendingCat) { cat = pendingCat; pendingCat = null; }
        var prices = [U.num(m[2])]; if (m[3]) prices.push(U.num(m[3]));
        var conf = "high", reason = "";
        if (!cat) { conf = "low"; reason = "no category"; }
        if (m[1].length < 3 || m[1].length > 90) { conf = "low"; reason = "odd length"; }
        if (prices.some(isNaN)) { conf = "low"; reason = "price"; }
        if (/\d\s*\/\s*$/.test(m[1])) { conf = "low"; reason = "3+ prices: review manually"; }
        last = { category: cat || "Sin categoría", name: m[1].replace(/^[-*•·»«.+,\s]+/, "").replace(/[.\s…]+$/, ""), name_en: "", desc: "", desc_en: "",
          variants: U.mkVariants(prices), labelsAssumed: prices.length > 1, chips: [], conf: conf, reason: reason };
        rows.push(last); return;
      }
      // no price: continuation of the previous dish name (lowercase start or previous ends with comma)
      if (last && (/^[a-záéíóúñüç]/.test(l) || /,$/.test(last.name))) { last.name += " " + l; return; }
      if (l.length <= 50 && /^[A-ZÁÉÍÓÚÑ¿¡"“]/.test(l)) { pendingCat = l; last = null; return; }
      if (last) { last.conf = "low"; last.reason = "unparsed line after"; }
    });
    return rows;
  };

  /* Group pdf.js textContent items into visual lines */
  U.itemsToLines = function (items) {
    var rows = [];
    items.forEach(function (it) {
      if (!it.str || !it.str.trim()) return;
      var y = it.transform[5], x = it.transform[4];
      var r = rows.find(function (r) { return Math.abs(r.y - y) < 3; });
      if (!r) { r = { y: y, parts: [] }; rows.push(r); }
      r.parts.push({ x: x, s: it.str, w: it.width || 0 });
    });
    rows.sort(function (a, b) { return b.y - a.y; });
    var cnt = {}, mode = null;
    rows.forEach(function (r) { r.minX = Math.min.apply(null, r.parts.map(function (p) { return p.x; })); var k = Math.round(r.minX / 4); cnt[k] = (cnt[k] || 0) + 1; });
    Object.keys(cnt).forEach(function (k) { if (mode == null || cnt[k] > cnt[mode]) mode = k; });
    return rows.map(function (r) {
      // Some PDFs draw text twice (fill + outline) or emit overlapping fragments ("16", "6/", "/ 22").
      // Merge by x order; when a fragment overlaps what we have, append only the part not already present.
      r.parts.sort(function (a, b) { return a.x - b.x || b.w - a.w; });
      var out = "", end = null;
      r.parts.forEach(function (p) {
        if (end == null) { out = p.s; end = p.x + p.w; return; }
        if (p.x < end - 1) {
          var s2 = p.s, k = Math.min(out.length, s2.length), ov = 0;
          if (out.indexOf(s2) >= 0) { end = Math.max(end, p.x + p.w); return; }
          for (; k > 0; k--) if (out.slice(-k) === s2.slice(0, k)) { ov = k; break; }
          if (!ov && (out.indexOf(s2) >= 0 || !s2.trim())) { end = Math.max(end, p.x + p.w); return; }
          out += s2.slice(ov);
        } else { var gap = p.x - end; if (gap > 1 && !/\s$/.test(out)) out += gap > 12 ? "\t" : " "; else if (gap > 12) out = out.replace(/\s+$/, "") + "\t"; out += p.s; }
        end = Math.max(end, p.x + p.w);
      });
      return (rows.length > 8 && r.minX < mode * 4 - 8 ? "\u0001" : "") + out;
    });
  };

  /* CSV parsing (header required). Returns {rows, errors:[{row,msg}]} */
  U.parseCSV = function (text) {
    var recs = [], cur = [], f = "", q = false, fq = [], quoted = false, qrow = [];
    text = text.replace(/^\uFEFF/, "");
    var first = text.split(/\r?\n/)[0] || "";
    var D = (first.split(";").length > first.split(",").length) ? ";" : ",";
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') { q = true; quoted = true; }
      else if (c === D) { cur.push(f); qrow.push(quoted); f = ""; quoted = false; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; cur.push(f); qrow.push(quoted); cur.q = qrow; recs.push(cur); cur = []; qrow = []; f = ""; quoted = false; }
      else f += c;
    }
    if (f || cur.length) { cur.push(f); qrow.push(quoted); cur.q = qrow; recs.push(cur); }
    recs = recs.filter(function (r) { return r.join("").trim(); });
    var head = (recs.shift() || []).map(function (h) { return h.trim().toLowerCase(); });
    var need = ["category", "name_es", "price"], errors = [], rows = [];
    if (need.some(function (n) { return head.indexOf(n) < 0; })) return { rows: [], errors: [{ row: 1, msg: "Header must include category,name_es,price" }] };
    var split = function (v) { return v ? v.split("|").map(function (x) { return x.trim(); }) : []; };
    recs.forEach(function (r, i) {
      var o = {}; head.forEach(function (h, j) { o[h] = (r[j] || "").trim(); });
      var pi = head.indexOf("price"), pq = r.q && r.q[pi];
      var rawP = o.price.replace(/€/g, "").trim();
      // decision 4: comma decimals only with ';' separator or a quoted field
      var commaBad = D === "," && !pq && /\d,\d/.test(rawP);
      var prices = rawP.split("/").map(U.num), les = split(o.variant_labels_es), len = split(o.variant_labels_en);
      var msgs = [];
      if (!o.category) msgs.push("category");
      if (!o.name_es) msgs.push("name_es");
      if (!rawP || prices.some(isNaN) || commaBad) msgs.push("price");
      if (prices.length > 2) msgs.push("3+ prices: review manually");
      if (r.length > head.length) msgs.push("too many columns");
      if ((les.length && les.length !== prices.length) || (len.length && len.length !== prices.length)) msgs.push("variant label count ≠ price count");
      var assumed = prices.length > 1 && (!les.length || les.length !== prices.length);
      rows.push({ category: o.category, name: o.name_es, name_en: o.name_en || "", desc: o.description_es || "", desc_en: o.description_en || "",
        variants: U.mkVariants(prices, les, len), labelsAssumed: assumed, chips: split(o.chips).filter(Boolean),
        conf: msgs.length ? "low" : "high", reason: msgs.length ? "CSV row " + (i + 1) + ": " + msgs.join(", ") : "" });
      if (msgs.length) errors.push({ row: i + 1, msg: msgs.join(", ") });
    });
    return { rows: rows, errors: errors, delimiter: D };
  };
})(typeof window !== "undefined" ? window : globalThis);
