/* Mock kitchen screen: always Spanish (D8). Reads orders from localStorage; live-refreshes on the storage event.
   Kitchen.view(rerender) is used by the #kitchen route; on kitchen.html it runs standalone. */
(function (G) {
  var h = U.h, showDone = false;
  function view(rerender) {
    var all = Orders.all().slice().reverse(), vis = all.filter(function (o) { return showDone || !o.done || (o.cancel && o.cancel.status === "pending"); });
    return [h("header", { class: "top kitchen" }, h("h1", { text: "Cocina (MOCK) · " + vis.length }),
      h("button", { class: "btn ghost", onclick: function () { showDone = !showDone; rerender(); }, text: showDone ? "Ocultar hechos" : "Mostrar hechos" }),
      h("button", { class: "btn ghost", onclick: function () { if (confirm("¿Borrar pedidos, mesas, divisiones y contador?")) { Orders.reset(); rerender(); } }, text: "Reset demo" }),
      h("a", { class: "btn ghost", href: G.KITCHEN_STANDALONE ? "index.html" : "#menu", text: "Carta" })),
      vis.length ? h("div", { class: "tickets" }, vis.map(function (o) {
        return Orders.ticketEl(o, { onDone: function (x) { Orders.update(x.id, function (y) { y.done = true; }); rerender(); },
          onApprove: function (x) { if (confirm("¿Aprobar la cancelación de #" + x.no + "?")) { if (!Orders.approveCancel(x.id)) alert("Ya hay pagos en la mesa: no se puede aprobar, rechaza la cancelación"); rerender(); } },
          onReject: function (x) { Orders.rejectCancel(x.id); rerender(); } });
      })) : h("p", { class: "empty", text: "Sin pedidos pendientes" })];
  }
  G.Kitchen = { view: view };
  if (document.body.classList.contains("kitchen-mode") && document.getElementById("app")) {
    G.KITCHEN_STANDALONE = true;
    var app = document.getElementById("app");
    var render = function () { app.textContent = ""; view(render).forEach(function (x) { app.appendChild(x); }); };
    window.addEventListener("storage", render);
    setInterval(render, 5000);
    render();
  }
})(window);
