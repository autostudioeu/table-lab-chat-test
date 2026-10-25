/* Customer app + mock kitchen. Hash routes: #menu #dish/<id> #cart #checkout #ticket/<orderId> #table #kitchen
   All menu/user text is rendered via textContent (helper h()), never innerHTML. */
(function () {
  var t = U.t, app = document.getElementById("app");
  var MENU = U.getMenu();
  var dishById = {}; MENU.dishes.forEach(function (d) { dishById[d.id] = d; });

  /* ---- DOM helper: h(tag, {attrs}, children...) ; strings become text nodes ---- */
  function h(tag, attrs) {
    var el = document.createElement(tag), a = attrs || {};
    Object.keys(a).forEach(function (k) {
      var v = a[k]; if (v == null || v === false) return;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, v);
    });
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) return c.forEach(function (x) { add(el, x); });
    el.appendChild(typeof c === "object" ? c : document.createTextNode(String(c)));
  }
  // localized text + "ES" badge when EN requested but only ES exists (decision 10: always on)
  function txt(o, tag, cls) {
    var el = h(tag || "span", { class: cls }, U.L(o));
    if (U.lang() === "en" && o && !o.en && o.es) el.appendChild(h("span", { class: "badge", title: "Spanish only", text: "ES" }));
    return el;
  }
  function vLabel(v, lang) { return (lang || U.lang()) === "en" ? (v.label_en || v.label_es) : (v.label_es || v.label_en); }
  function minPrice(d) { return Math.min.apply(null, d.variants.map(function (v) { return v.price; })); }
  function fromLabel(p) { return U.lang() === "en" ? "from " + U.eur(p) : "desde " + U.eur(p); }

  /* ---- table (decision 7) ---- */
  function readTable() {
    var q = new URLSearchParams(location.search).get("table");
    var n = parseInt(q, 10);
    if (q && /^\d+$/.test(q) && n >= 1 && n <= 30) { sessionStorage.setItem("table", String(n)); return n; }
    var s = parseInt(sessionStorage.getItem("table"), 10);
    return s >= 1 && s <= 30 ? s : null;
  }
  var table = readTable();

  /* ---- shared table cart (group ordering, §2b) ---- */
  function st() { return table ? TableStore.read(table) : { lines: [], guests: [], rounds: [], round: 1, version: 0 }; }
  function me() { return table ? TableStore.guestId(table) : null; }
  function getCart() { return st().lines.filter(function (l) { return dishById[l.dishId] && dishById[l.dishId].variants[l.vi]; }); }
  function lineKey(l) { return [l.dishId, l.vi, l.chips.slice().sort().join("+"), l.note, l.owner].join("|"); }
  function linePrice(l) { var d = dishById[l.dishId]; return d && d.variants[l.vi] ? d.variants[l.vi].price : 0; }
  function cartTotal(c) { return Math.round(c.reduce(function (s, l) { return s + linePrice(l) * l.qty; }, 0) * 100) / 100; }
  function cartCount(c) { return c.reduce(function (s, l) { return s + l.qty; }, 0); }
  function ivaOf(total) { return Math.round((total - total / 1.10) * 100) / 100; }
  function canEdit(l) { return l.owner === "shared" || l.owner === me(); }
  var toastTimer;
  function toast(msg) {
    var el = document.getElementById("toast") || document.body.appendChild(h("div", { id: "toast", class: "toast", role: "status" }));
    el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.hidden = true; }, 3000);
  }
  /* edit a line by id inside a fresh transaction; if another guest removed it, show toast */
  function editLine(id, fn) {
    var ok = TableStore.tx(table, function (s) {
      var i = s.lines.findIndex(function (l) { return l.id === id; });
      if (i < 0) return false;
      fn(s.lines[i]); if (s.lines[i].qty <= 0) s.lines.splice(i, 1);
    });
    if (!ok) toast(t("changed"));
    render();
  }

  /* ---- chrome ---- */
  function header(title, backHash) {
    return h("header", { class: "top" },
      backHash ? h("a", { class: "btn ghost", href: backHash, "aria-label": t("back"), text: "←" }) : h("span", { class: "logo", text: MENU.restaurant || "Menu" }),
      h("h1", { text: title || "" }),
      h("a", { class: "btn ghost tablechip", href: "#table", "aria-label": t("table") }, t("table") + " " + (table || "?") + (table && TableStore.guest(table) ? " · " + TableStore.guest(table).name : "")),
      table && TableStore.guest(table) ? h("a", { class: "btn ghost small", href: "#guest", text: t("switch") }) : null,
      h("button", { class: "btn ghost", "aria-label": "Language / Idioma", onclick: function () { U.setLang(U.lang() === "es" ? "en" : "es"); render(); } },
        h("b", { text: U.lang() === "es" ? "ES" : "EN" }), " | " + (U.lang() === "es" ? "EN" : "ES")));
  }
  function cartBar() {
    var c = getCart(); if (!c.length) return null;
    return h("a", { class: "cartbar", href: "#cart" }, h("span", { text: t("cart") + " (" + cartCount(c) + ")" }), h("b", { text: U.eur(cartTotal(c)) }));
  }

  /* ---- screens ---- */
  function viewMenu() {
    var tabs = h("nav", { class: "tabs", "aria-label": "Categories" });
    var list = h("div", { class: "list" });
    MENU.categories.forEach(function (c) {
      var dishes = MENU.dishes.filter(function (d) { return d.cat === c.id; });
      if (!dishes.length) return;
      tabs.appendChild(h("a", { href: "#menu", class: "tab", onclick: function (e) { e.preventDefault(); document.getElementById("cat-" + c.id).scrollIntoView({ behavior: "smooth" }); } }, txt(c.name)));
      list.appendChild(txt(c.name, "h2", "cat")).id = "cat-" + c.id;
      dishes.forEach(function (d) {
        var multi = d.variants.length > 1;
        list.appendChild(h("div", { class: "card" },
          h("a", { class: "cardbody", href: "#dish/" + d.id },
            txt(d.name, "div", "dname"),
            U.L(d.desc) ? txt(d.desc, "div", "ddesc") : null,
            h("div", { class: "dprice", text: multi ? fromLabel(minPrice(d)) : U.eur(d.variants[0].price) })),
          h("a", { class: "btn add", href: "#dish/" + d.id, "aria-label": t("add") + ": " + U.L(d.name), text: "+" })));
      });
    });
    var warn = !table ? h("a", { class: "notice", href: "#table", text: t("picktable") }) : null;
    return [header(MENU.restaurant), warn, tabs, list, cartBar()];
  }

  function viewDish(id) {
    var d = dishById[id]; if (!d) { location.hash = "#menu"; return []; }
    var multi = d.variants.length > 1, vi = multi ? null : 0, qty = 1, chips = [], note = "";
    var addBtn = h("button", { class: "btn primary big" });
    var hint = h("div", { class: "hint", text: t("choose") });
    var qtyEl = h("span", { class: "qty", "aria-live": "polite" });
    var counter = h("small", { class: "counter" });
    function upd() {
      qtyEl.textContent = qty;
      var p = vi == null ? null : d.variants[vi].price * qty;
      addBtn.disabled = vi == null;
      addBtn.textContent = t("add") + (p != null ? " · " + U.eur(p) : "");
      hint.hidden = vi != null;
      counter.textContent = Array.from(note).length + "/80";
    }
    var seg = multi ? h("div", { class: "seg", role: "radiogroup", "aria-label": t("portion") }) : null;
    if (multi) d.variants.forEach(function (v, i) {
      var b = h("button", { class: "segbtn", role: "radio", "aria-checked": "false", onclick: function () {
        vi = i; Array.from(seg.children).forEach(function (x, j) { x.setAttribute("aria-checked", String(j === i)); }); upd(); } },
        h("span", { text: vLabel(v) }), h("b", { text: U.eur(v.price) }));
      seg.appendChild(b);
    });
    var chipBox = h("div", { class: "chips" });
    (d.chips || []).forEach(function (cid) {
      var c = MENU.chips && MENU.chips[cid] || U.defaultChips()[cid]; if (!c) return;
      chipBox.appendChild(h("button", { class: "chip", "aria-pressed": "false", onclick: function () {
        var on = chips.indexOf(cid) < 0; if (on) chips.push(cid); else chips.splice(chips.indexOf(cid), 1);
        this.setAttribute("aria-pressed", String(on)); } }, U.L(c)));
    });
    var ta = h("textarea", { id: "note", rows: "2", "aria-label": t("note"), placeholder: t("note"), oninput: function () {
      var a = Array.from(this.value); if (a.length > 80) { this.value = a.slice(0, 80).join(""); } note = this.value; upd(); } });
    var share = false;
    var shareBtn = h("button", { class: "chip share", "aria-pressed": "false", onclick: function () { share = !share; this.setAttribute("aria-pressed", String(share)); }, text: "👥 " + t("toshare") });
    addBtn.addEventListener("click", function () {
      if (vi == null) return;
      if (!table) { location.hash = "#table"; return; }
      if (!me()) { location.hash = "#guest"; return; }
      var line = { id: "l" + TableStore.uid(), dishId: d.id, vi: vi, qty: qty, chips: chips.slice().sort(), note: note.trim(), owner: share ? "shared" : me() };
      TableStore.tx(table, function (s) {
        var k = lineKey(line), ex = s.lines.find(function (l) { return lineKey(l) === k; });
        if (ex) ex.qty += qty; else s.lines.push(line);
      });
      location.hash = "#menu";
    });
    upd();
    return [header("", "#menu"), h("section", { class: "sheet" },
      txt(d.name, "h2", "dname big"),
      U.L(d.desc) ? txt(d.desc, "p", "ddesc") : null,
      multi ? [seg, hint] : h("div", { class: "dprice", text: U.eur(d.variants[0].price) }),
      h("div", { class: "stepper" },
        h("button", { class: "btn round", "aria-label": "−1", onclick: function () { if (qty > 1) { qty--; upd(); } }, text: "−" }), qtyEl,
        h("button", { class: "btn round", "aria-label": "+1", onclick: function () { if (qty < 20) { qty++; upd(); } }, text: "+" })),
      chipBox.children.length ? chipBox : null,
      h("label", { for: "note", class: "lbl", text: t("note") }), ta, counter, h("div", { class: "chips" }, shareBtn), addBtn)];
  }

  function viewCart() {
    var S0 = st(), c = getCart();
    var bill = billLink(S0);
    if (!c.length) return [header(t("cart"), "#menu"), h("p", { class: "empty", text: t("empty") }), roundsBox(S0), bill, h("a", { class: "btn primary big", href: "#menu", text: t("menu") })];
    var list = h("div", { class: "list" });
    // group by guest (+ Shared), own group first
    var groups = [], meId = me();
    S0.guests.forEach(function (g) { groups.push({ id: g.id, name: g.name }); });
    groups.sort(function (a, b) { return (b.id === meId) - (a.id === meId); });
    groups.push({ id: "shared", name: t("sharedgrp") });
    groups.forEach(function (g) {
      var gl = c.filter(function (l) { return l.owner === g.id; }); if (!gl.length) return; // empty guests hidden
      list.appendChild(h("h3", { class: "ghead" }, h("span", { text: g.name + (g.id === meId ? " (" + t("you") + ")" : "") }), h("span", { text: U.eur(cartTotal(gl)) })));
      gl.forEach(function (l) {
        var d = dishById[l.dishId], v = d.variants[l.vi], ed = canEdit(l);
        list.appendChild(h("div", { class: "line" + (ed ? "" : " ro") },
          h("div", { class: "lmain" },
            h("div", null, txt(d.name, "span", "dname"), d.variants.length > 1 ? h("span", { class: "vtag", text: " — " + vLabel(v) }) : null, h("span", { text: " ×" + l.qty })),
            l.chips.length ? h("div", { class: "lchips", text: l.chips.map(function (cid) { return U.L((MENU.chips || {})[cid] || U.defaultChips()[cid]) || cid; }).join(" · ") }) : null,
            l.note ? h("div", { class: "lnote", text: "“" + l.note + "”" }) : null,
            ed ? h("div", { class: "stepper small" },
              h("button", { class: "btn round", "aria-label": "−1 " + U.L(d.name), onclick: function () { editLine(l.id, function (x) { x.qty--; }); }, text: "−" }),
              h("span", { class: "qty", text: l.qty }),
              h("button", { class: "btn round", "aria-label": "+1 " + U.L(d.name), onclick: function () { editLine(l.id, function (x) { x.qty++; }); }, text: "+" }),
              h("button", { class: "btn ghost", onclick: function () { editLine(l.id, function (x) { x.qty = 0; }); }, text: t("remove") })) : h("div", { class: "muted small", text: "🔒 " + t("readonly") })),
          h("b", { class: "lprice", text: U.eur(v.price * l.qty) })));
      });
    });
    var tot = cartTotal(c);
    return [header(t("cart") + " · " + fmtR(S0.round), "#menu"), list, h("div", { class: "totals" },
      h("div", { class: "grand" }, h("span", { text: t("total") + " (" + t("table") + " " + table + ")" }), h("span", { text: U.eur(tot) })),
      h("div", { class: "muted" }, h("span", { text: t("iva") }), h("span", { text: U.eur(ivaOf(tot)) }))),
      table ? h("button", { class: "btn primary big", id: "sendbtn", onclick: sendOrder, text: t("send") + " · " + fmtR(S0.round) })
            : [h("div", { class: "notice", role: "alert", text: t("picktable") }), h("a", { class: "btn primary big", href: "#table", text: t("picktable") })],
      roundsBox(S0), bill];
  }
  function fmtR(n) { return t("round").replace("{n}", n); }
  /* sent rounds with cancel request / status (hidden once any payment exists on the table) */
  function roundsBox(S0) {
    if (!S0.rounds || !S0.rounds.length) return null;
    var paid = Orders.tablePaid(table);
    return h("section", { class: "rounds", "aria-label": t("sentrounds") }, h("h3", { class: "ghead", text: t("sentrounds") }),
      S0.rounds.map(function (r) {
        var o = Orders.get(r.orderId); if (!o) return null;
        var st = o.cancel && o.cancel.status;
        return h("div", { class: "line round", id: "round-" + o.no },
          h("div", { class: "lmain" }, h("b", { text: "#" + o.no + " · " + fmtR(o.round) }), h("div", { class: "muted", text: U.eurC(o.totalC) }),
            st === "pending" ? h("div", { class: "cstat pend", role: "status", text: "⏳ " + t("cancelpending") }) : null,
            st === "rejected" ? h("div", { class: "cstat rej", role: "status", text: "✕ " + t("cancelrejected") }) : null),
          !paid && st !== "pending" ? h("button", { class: "btn", onclick: function () {
            if (!confirm(t("cancelask"))) return;
            Orders.requestCancel(o.id); render(); }, text: t("cancelround") }) : null);
      }));
  }
  function billLink(S0) {
    return S0.rounds && S0.rounds.length ? h("a", { class: "btn big", href: "#pay", text: t("pay") + " · " + S0.rounds.map(function (r) { return "#" + r.orderNo; }).join(", ") }) : null;
  }

  // navigate to the menu and always re-render (hash may already be #menu, so no hashchange fires)
  function goMenu() { if (location.hash === "#menu") render(); else location.hash = "#menu"; }
  function viewGuest() {
    if (!table) { location.hash = "#table"; return []; }
    var S0 = st(), cur = me();
    var inp = h("input", { id: "gname", class: "pin", maxlength: "20", autocomplete: "given-name", "aria-label": t("guestname"), placeholder: t("guestname") });
    var err = h("div", { class: "hint", hidden: true, text: "1–20" });
    var done = false; // guard against double submit
    function go() {
      if (done) return;
      var v = inp.value.trim(); if (!v || Array.from(v).length > 20) { err.hidden = false; return; }
      done = true;
      var id = TableStore.addGuest(table, v); TableStore.setGuest(table, id); goMenu();
    }
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
    return [header(t("guestname"), cur ? "#menu" : null),
      h("section", { class: "sheet" }, h("label", { for: "gname", class: "lbl", text: t("guestname") }), inp, err,
        h("button", { class: "btn primary big", onclick: go, text: "OK" }),
        S0.guests.length ? [h("h3", { text: t("switch") }), h("div", { class: "chips" }, S0.guests.map(function (g) {
          return h("button", { class: "chip", "aria-pressed": String(g.id === cur), onclick: function () { TableStore.setGuest(table, g.id); goMenu(); }, text: g.name });
        }))] : null)];
  }

  function viewTable() {
    var grid = h("div", { class: "tablegrid" });
    for (var n = 1; n <= 30; n++) (function (n) {
      grid.appendChild(h("button", { class: "btn" + (n === table ? " primary" : ""), "aria-label": t("table") + " " + n, onclick: function () {
        table = n; sessionStorage.setItem("table", String(n)); history.back(); if (location.hash === "#table") location.hash = "#menu"; } }, String(n)));
    })(n);
    return [header(t("picktable"), "#menu"), h("p", { class: "muted pad", text: t("tablehelp") }), grid];
  }

  /* ---- send order (whole table's current round) -> kitchen ticket, before payment ---- */
  function sendOrder() {
    if (!table) { location.hash = "#table"; return; }
    var round = st().round;
    if (!getCart().length) return;
    if (!confirm(t("sendall"))) return;
    var order = null;
    TableStore.tx(table, function (s) {
      if (s.round !== round || !s.lines.length) return false; // send race: someone else already sent this round
      var lines = s.lines.filter(function (l) { return dishById[l.dishId] && dishById[l.dishId].variants[l.vi]; });
      order = Orders.create(lines, MENU, table, function (id) { return TableStore.guestName(s, id); }, s.round);
      s.rounds.push({ orderNo: order.no, orderId: order.id, lines: lines });
      s.lines = []; s.round++;
    });
    if (order) location.hash = "#sent/" + order.id; else { toast(t("changed")); render(); }
  }
  function viewSent(id) {
    var o = Orders.get(id); if (!o) { location.hash = "#menu"; return []; }
    return [header("", "#menu"), h("div", { class: "success", role: "status", text: "✓ " + t("sent") + " #" + o.no }),
      Orders.ticketEl(o), roundsBox(st()),
      h("a", { class: "btn primary big", href: "#pay", text: t("pay") }),
      h("div", { class: "row pad" }, h("button", { class: "btn", onclick: function () { window.print(); }, text: t("print") }),
        h("a", { class: "btn", href: "#menu", text: t("neworder") }))];
  }
  /* the bill covers all sent rounds of this table session; unsent lines excluded */
  function tableBill() {
    var S0 = st(), lines = [];
    S0.rounds.forEach(function (r) { var o = Orders.get(r.orderId); if (o) o.lines.forEach(function (l) { lines.push(l); }); });
    return { id: "table:" + table, no: t("table") + " " + table, rounds: S0.rounds.map(function (r) { return r.orderNo; }), orderIds: S0.rounds.map(function (r) { return r.orderId; }),
      blocked: function () { return Orders.cancelPending(table) ? t("paywait") : null; },
      guests: S0.guests, lines: lines, totalC: lines.reduce(function (a, l) { return a + l.unitC * l.qty; }, 0) };
  }
  function viewPay() {
    if (!table) { location.hash = "#table"; return []; }
    var b = tableBill();
    if (!b.lines.length) return [header(t("checkout"), "#cart"), h("p", { class: "empty", text: t("nothingsent") }), h("a", { class: "btn primary big", href: "#cart", text: t("cart") })];
    var pend = b.orderIds.some(function (id) { var o = Orders.get(id); return o && o.cancel && o.cancel.status === "pending"; });
    if (pend) return [header(t("checkout"), "#cart"), h("div", { class: "notice", role: "status", text: "⏳ " + t("paywait") }), roundsBox(st())];
    return [header(t("checkout"), "#cart"), Pay.view(b, render)];
  }

  /* ---- router ---- */
  function render() {
    MENU = U.getMenu(); dishById = {}; MENU.dishes.forEach(function (d) { dishById[d.id] = d; });
    document.documentElement.lang = U.lang();
    // hash-only table selection for the single-file build: #table=7
    var tm = location.hash.match(/^#table=(\d+)/);
    if (tm) { var tn = parseInt(tm[1], 10); if (tn >= 1 && tn <= 30) { table = tn; sessionStorage.setItem("table", String(tn)); } location.replace("#menu"); return; }
    document.body.classList.toggle("kitchen-mode", /^#kitchen/.test(location.hash));
    var hs = location.hash.replace(/^#/, "") || "menu", parts = hs.split("/"), v;
    // first visit per tab: ask for a name (once table is known)
    if (table && !TableStore.guest(table) && ["guest", "table", "kitchen"].indexOf(parts[0]) < 0) parts = ["guest"];
    switch (parts[0]) {
      case "dish": v = viewDish(parts[1]); break;
      case "cart": v = viewCart(); break;
      case "sent": v = viewSent(parts[1]); break;
      case "pay": v = viewPay(); break;
      case "guest": v = viewGuest(); break;
      case "table": v = viewTable(); break;
      case "kitchen": v = window.Kitchen ? Kitchen.view(render) : (location.replace("kitchen.html"), []); break;
      default: v = viewMenu();
    }
    var focusId = document.activeElement && document.activeElement.id, same = render._last === location.hash, y = window.scrollY;
    app.textContent = ""; add(app, v);
    if (same) { window.scrollTo(0, y); if (focusId && document.getElementById(focusId)) document.getElementById(focusId).focus(); } else window.scrollTo(0, 0);
    render._last = location.hash;
  }
  window.addEventListener("hashchange", render);
  // an open pay sheet re-checks for a new cancel request instead of being wiped
  window.addEventListener("orders-changed", function () { if (document.querySelector(".overlay")) Pay.recheck(); else render(); });
  window.addEventListener("storage", function (e) { if (document.querySelector(".overlay")) { Pay.recheck(); return; }
    if (document.activeElement && /^(note|gname|amt)/.test(document.activeElement.id || "")) return; // don't wipe typing
    if (["orders", "menu", "orderCounter"].indexOf(e.key) >= 0 || /^(split|table):/.test(e.key || "") || e.key == null) render(); });
  render();
})();
