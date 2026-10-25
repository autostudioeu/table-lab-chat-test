/* Orders store (localStorage) + Spanish kitchen ticket rendering. Shared by index.html and kitchen.html. */
(function (G) {
  var h = U.h;
  var O = G.Orders = {
    all: function () { try { return JSON.parse(localStorage.getItem("orders")) || []; } catch (e) { return []; } },
    saveAll: function (a) { localStorage.setItem("orders", JSON.stringify(a)); },
    get: function (id) { return O.all().find(function (o) { return o.id === id; }); },
    update: function (id, fn) { var a = O.all(), o = a.find(function (x) { return x.id === id; }); if (o) { fn(o); O.saveAll(a); } return o; },
    reset: function () {
      if (G.TableStore) TableStore.resetAll();
      else Object.keys(localStorage).forEach(function (k) { if (/^table:|^split:/.test(k)) localStorage.removeItem(k); });
      localStorage.removeItem("orders"); localStorage.removeItem("orderCounter");
    },
    /* create order from cart lines at "Send order". lines: [{dishId,vi,qty,chips,note}] */
    create: function (cart, menu, table, nameOf, round) {
      nameOf = nameOf || function () { return null; };
      var byId = {}; menu.dishes.forEach(function (d) { byId[d.id] = d; });
      var counter = (parseInt(localStorage.getItem("orderCounter"), 10) || 0) + 1;
      localStorage.setItem("orderCounter", String(counter));
      var chipName = function (cid, l) { var x = (menu.chips || {})[cid]; return x ? (x[l] || x.es) : cid; };
      var lines = cart.map(function (l) {
        var d = byId[l.dishId], v = d.variants[l.vi], two = d.variants.length > 1;
        return { qty: l.qty, unitC: U.cents(v.price), name: d.name, variant: two ? { es: v.label_es || v.label_en, en: v.label_en || v.label_es } : null,
          chips: l.chips.map(function (c) { return { es: chipName(c, "es"), en: chipName(c, "en") }; }), note: l.note,
          owner: l.owner || null, ownerName: nameOf(l.owner) };
      });
      // kitchen items: Spanish, identical dish+variant+chips+note merged (D8)
      var items = [];
      lines.forEach(function (l) {
        var it = { qty: l.qty, name: l.name.es || l.name.en, variant: l.variant ? l.variant.es : "", chips: l.chips.map(function (c) { return c.es; }).sort(), note: l.note };
        var k = [it.name, it.variant, it.chips.join("+"), it.note].join("|"), ex = items.find(function (m) { return m._k === k; });
        var who = l.ownerName || (l.owner === "shared" ? "Compartido" : "");
        if (ex) { ex.qty += it.qty; if (who && ex.who.indexOf(who) < 0) ex.who.push(who); } else { it._k = k; it.who = who ? [who] : []; items.push(it); }
      });
      items.forEach(function (m) { delete m._k; });
      var totalC = lines.reduce(function (s, l) { return s + l.unitC * l.qty; }, 0);
      var o = { id: "o" + Date.now() + Math.floor(Math.random() * 1000), no: table + "-" + ("000" + counter).slice(-4), table: table, time: new Date().toISOString(),
        lines: lines, items: items, totalC: totalC, round: round || 1, done: false };
      var a = O.all(); a.push(o); O.saveAll(a);
      return o;
    },
    /* ---- round cancellation (kitchen approves/rejects; no expiry) ---- */
    tablePaid: function (table) { var s = O.split("table:" + table); return !!(s && s.paid && Object.keys(s.paid).length); },
    // fresh read from localStorage every call (no caching) so racing tabs see the latest state
    cancelPending: function (table) { return O.all().some(function (o) { return o.table === table && o.cancel && o.cancel.status === "pending"; }); },
    changed: function () { try { window.dispatchEvent(new Event("orders-changed")); } catch (e) {} }, // same-tab notification
    requestCancel: function (id) {
      var o = O.get(id); if (!o || O.tablePaid(o.table)) return false;
      if (o.cancel && o.cancel.status === "pending") return false; // max one pending request per round
      O.update(id, function (x) { x.cancel = { status: "pending", at: new Date().toISOString() }; });
      O.changed();
      return true;
    },
    rejectCancel: function (id) { O.update(id, function (x) { if (x.cancel && x.cancel.status === "pending") x.cancel = { status: "rejected", at: new Date().toISOString() }; }); },
    approveCancel: function (id) {
      var o = O.get(id); if (!o || !o.cancel || o.cancel.status !== "pending") return false;
      if (O.tablePaid(o.table)) return false; // payments exist: kitchen must reject instead
      O.saveAll(O.all().filter(function (x) { return x.id !== id; }));            // ticket gone
      if (G.TableStore) TableStore.tx(o.table, function (s) { s.rounds = s.rounds.filter(function (r) { return r.orderId !== id; }); }); // bill gone
      var sp = O.split("table:" + o.table);                                         // split recomputed from remaining rounds
      if (sp && !Object.keys(sp.paid || {}).length) localStorage.removeItem("split:table:" + o.table);
      return true;
    },
    split: function (id) { try { return JSON.parse(localStorage.getItem("split:" + id)); } catch (e) { return null; } },
    saveSplit: function (id, s) { localStorage.setItem("split:" + id, JSON.stringify(s)); },
    /* kitchen payment badge (Spanish): PENDIENTE / PAGADO a/b / PAGADO */
    badge: function (o) {
      var s = O.split("table:" + o.table), sum = s && s.summary;
      if (s && s.orderIds && s.orderIds.indexOf(o.id) < 0) sum = null;
      if (!sum || !sum.paidPeople) return { text: "PENDIENTE", cls: "pend" };
      if (sum.allPaid) return { text: "PAGADO", cls: "paid" };
      return { text: "PAGADO " + sum.paidPeople + "/" + sum.people, cls: "part" };
    },
    time: function (iso) { var d = new Date(iso); return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); },
    ticketEl: function (o, opts) {
      opts = opts || {};
      var b = O.badge(o);
      return h("article", { class: "ticket" + (o.done ? " done" : ""), "aria-label": "Mesa " + o.table },
        h("div", { class: "thead" }, h("span", { text: "MESA " + o.table + " · #" + o.no + " · " + O.time(o.time) + (o.round > 1 ? " · RONDA " + o.round : "") }), h("span", { class: "pbadge " + b.cls, text: b.text })),
        o.items.map(function (it) {
          return h("div", { class: "titem" },
            h("div", null, it.qty + "× " + it.name, it.variant ? [" — ", h("strong", { class: "caps", text: it.variant.toUpperCase() })] : null),
            it.chips.length ? h("div", { class: "tsub", text: "· " + it.chips.join(" · ") }) : null,
            it.note ? h("div", { class: "tsub", text: "✎ " + it.note }) : null,
            it.who && it.who.length ? h("div", { class: "tsub who", text: "👤 " + it.who.join(", ") }) : null);
        }),
        o.cancel && o.cancel.status === "pending" ? h("div", { class: "cancelreq", role: "status", text: "⚠ Cancelación solicitada, pendiente" }) : null,
        o.cancel && o.cancel.status === "rejected" ? h("div", { class: "tsub", text: "Cancelación rechazada" }) : null,
        h("div", { class: "ttotal", text: "Total " + (o.totalC / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" }) }),
        opts.onApprove && o.cancel && o.cancel.status === "pending" && O.tablePaid(o.table) ? h("div", { class: "cancelwarn", role: "alert", text: "Ya hay pagos en la mesa: no se puede aprobar, rechaza la cancelación" }) : null,
        opts.onApprove && o.cancel && o.cancel.status === "pending" ? h("div", { class: "row" },
          h("button", { class: "btn primary", disabled: O.tablePaid(o.table), "aria-disabled": String(O.tablePaid(o.table)), onclick: function () { if (!O.tablePaid(o.table)) opts.onApprove(o); else opts.onRefused && opts.onRefused(o); }, text: "Aprobar cancelación" }),
          h("button", { class: "btn", onclick: function () { opts.onReject(o); }, text: "Rechazar" })) : null,
        opts.onDone && !o.done ? h("button", { class: "btn primary", onclick: function () { opts.onDone(o); }, text: "Hecho" }) : null);
    }
  };
})(window);
