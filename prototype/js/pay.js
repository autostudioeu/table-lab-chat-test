/* Checkout + bill splitting (MOCK payments). Self-contained module: window.Pay.view(order, rerender) -> DOM.
   All amounts are integer cents. State persists per order in localStorage "split:<orderId>". */
(function (G) {
  var h = U.h, t = U.t;
  var METHODS = [["pix", "Pix"], ["bizum", "Bizum"], ["applepay", "Apple Pay"], ["googlepay", "Google Pay"]];
  function fmt(k, o) { var s = t(k); Object.keys(o).forEach(function (x) { s = s.replace("{" + x + "}", o[x]); }); return s; }
  function methodName(id) { var m = METHODS.find(function (x) { return x[0] === id; }); return m ? m[1] : id; }

  function sig(o) { return o.lines.length + ":" + o.totalC; }
  function fresh(o) { return { mode: null, n: 2, people: [{ name: "P1" }, { name: "P2" }], custom: ["", ""], units: {}, paid: {}, frozen: null, sig: sig(o), orderIds: o.orderIds || [] }; }
  function load(o) {
    var s = Orders.split(o.id);
    if (!s) return fresh(o);
    // a new round was sent: shares reset if nothing paid yet (paid splits keep their frozen shares)
    if (s.sig !== sig(o) && !Object.keys(s.paid).length) { var f = fresh(o); f.mode = s.mode; f.n = s.n; return f; }
    return s;
  }
  /* By items prefill (§2b): one person per guest with lines, own lines ticked, shared lines ticked for all */
  function prefill(o, s) {
    var gids = [];
    o.lines.forEach(function (l) { if (l.owner && l.owner !== "shared" && gids.indexOf(l.owner) < 0) gids.push(l.owner); });
    if (!gids.length) return;
    s.people = gids.map(function (g) { var l = o.lines.find(function (x) { return x.owner === g; }); return { name: Array.from(l.ownerName || "?").slice(0, 20).join(""), gid: g }; });
    s.custom = s.people.map(function () { return ""; }); s.units = {};
    o.lines.forEach(function (l, li) { for (var u = 0; u < l.qty; u++) s.units[li + ":" + u] = l.owner === "shared" ? s.people.map(function (_, i) { return i; }) : [gids.indexOf(l.owner)]; });
    s.prefilled = true;
  }
  function units(o) { // flat list of units: {li, u, priceC}
    var out = []; o.lines.forEach(function (l, li) { for (var u = 0; u < l.qty; u++) out.push({ li: li, u: u, priceC: l.unitC, key: li + ":" + u }); }); return out;
  }
  /* ---- share computation ---- */
  P.equalShares = equalShares;
  function equalShares(T, n) { var b = Math.floor(T / n), a = []; for (var i = 0; i < n; i++) a.push(i === n - 1 ? T - b * (n - 1) : b); return a; }
  function itemShares(o, s) {
    var sh = s.people.map(function () { return 0; }), un = 0;
    units(o).forEach(function (x) {
      var sel = (s.units[x.key] || []).filter(function (p) { return p < s.people.length; });
      if (!sel.length) { un += x.priceC; return; }
      var b = Math.floor(x.priceC / sel.length);
      sel.forEach(function (p, i) { sh[p] += i === sel.length - 1 ? x.priceC - b * (sel.length - 1) : b; }); // remainder to last selector
    });
    return { shares: sh, unassigned: un };
  }
  function customShares(s) { return s.custom.map(function (v) { if (!String(v).trim()) return 0; var n = U.num(v); return isNaN(n) ? NaN : U.cents(n); }); }
  function people(o, s) { // -> [{name, shareC}] for current mode
    var T = o.totalC;
    if (s.frozen) return s.frozen;
    if (s.mode === "all") return [{ name: t("payall"), shareC: T }];
    if (s.mode === "equal") return equalShares(T, s.n).map(function (c, i) { return { name: t("person") + " " + (i + 1), shareC: c }; });
    if (s.mode === "items") { var r = itemShares(o, s); return s.people.map(function (p, i) { return { name: p.name, shareC: r.shares[i] }; }); }
    if (s.mode === "custom") { var c = customShares(s); return s.people.map(function (p, i) { return { name: p.name, shareC: c[i] }; }); }
    return [];
  }
  function validity(o, s) {
    var T = o.totalC;
    if (s.mode === "items") { var u = itemShares(o, s).unassigned; return u ? { ok: false, msg: fmt("unassigned", { x: U.eurC(u) }), warn: true } : { ok: true }; }
    if (s.mode === "custom") {
      var c = customShares(s);
      var sum = c.reduce(function (a, b) { return a + (isNaN(b) ? 0 : b); }, 0); // empty fields count as 0
      if (sum > T) return { ok: false, msg: t("overtotal"), err: true, rest: T - sum };
      if (c.some(isNaN)) return { ok: false, msg: t("badamt") };
      if (c.some(function (x) { return x <= 0; })) return { ok: false, msg: t("zeroamt"), rest: T - sum };
      if (sum !== T) return { ok: false, msg: t("mustsum"), rest: T - sum };
      return { ok: true, rest: 0 };
    }
    return { ok: true };
  }
  function summarize(o, s) {
    var ps = people(o, s), paidC = 0, pp = 0, count = 0;
    ps.forEach(function (p, i) { if (s.mode === "items" && !p.shareC) return; count++; if (s.paid[i]) { pp++; paidC += s.paid[i].amountC; } });
    s.summary = { people: count, paidPeople: pp, paidC: paidC, allPaid: count > 0 && pp === count && paidC >= o.totalC };
  }
  function save(o, s) { summarize(o, s); s.sig = sig(o); s.orderIds = o.orderIds || []; Orders.saveSplit(o.id, s); }

  /* ---- mock payment sheet ---- */
  var openSheet = null;
  /* re-check an open sheet (called on storage events / same-tab order changes) */
  P.recheck = function () { if (openSheet) openSheet.check(); };
  function paySheet(label, amountC, onOk, onCancel, blockedFn) {
    var sel = null, busy = false, ov = null;
    var msgEl = h("div", { class: "notice", role: "alert", hidden: true });
    // on a pending cancel: close the sheet and let the page re-render with the pending message
    function blocked() { var m = blockedFn && blockedFn(); if (m) { msgEl.textContent = "⏳ " + m; msgEl.hidden = false; payBtn.disabled = true; if (ov) { ov.remove(); openSheet = null; onCancel && onCancel(); } } return m; }
    var payBtn = h("button", { class: "btn primary big", disabled: true, text: t("pay") + " " + U.eurC(amountC) });
    var tiles = h("div", { class: "tiles", role: "radiogroup", "aria-label": t("method") });
    METHODS.forEach(function (m) {
      tiles.appendChild(h("button", { class: "tile", role: "radio", "aria-checked": "false", "aria-label": m[1] + " (MOCK)", onclick: function () {
        if (busy) return; sel = m[0]; Array.from(tiles.children).forEach(function (x) { x.setAttribute("aria-checked", String(x === this)); }, this); payBtn.disabled = false; } },
        h("b", { text: m[1] }), h("small", { text: "MOCK" })));
    });
    var cancel = h("button", { class: "btn ghost", text: t("cancel"), onclick: function () { if (!busy) { ov.remove(); openSheet = null; onCancel && onCancel(); } } });
    payBtn.addEventListener("click", function () {
      if (!sel || busy) return;
      if (blocked()) return;                       // (1a) re-check right before starting the spinner
      busy = true; payBtn.disabled = true; cancel.disabled = true; payBtn.textContent = t("processing"); payBtn.appendChild(h("span", { class: "spin", "aria-hidden": "true" }));
      setTimeout(function () {
        busy = false; cancel.disabled = false;
        if (blocked()) { payBtn.textContent = t("pay") + " " + U.eurC(amountC); return; } // (1b) re-check right before recording
        ov.remove(); openSheet = null; onOk(sel);
      }, 1500);
    });
    ov = h("div", { class: "overlay", role: "dialog", "aria-modal": "true", "aria-label": t("pay") },
      h("div", { class: "sheetbox" }, h("h2", { text: label + " · " + U.eurC(amountC) }),
        h("div", { class: "mockbanner", text: "MOCK · " + t("mock") }), msgEl, tiles, payBtn, cancel));
    document.body.appendChild(ov);
    openSheet = { check: function () { if (!document.body.contains(ov)) { openSheet = null; return; } if (!busy) blocked(); } };
    blocked();
    return ov;
  }

  /* ---- main view ---- */
  P.view = function (o, rerender) {
    var s = load(o), T = o.totalC;
    var locked = Object.keys(s.paid).length > 0;
    var ps = people(o, s), v = validity(o, s);
    summarize(o, s);
    var root = h("div", { class: "pay" });
    root.appendChild(h("div", { class: "mockbanner", role: "note", text: "MOCK · " + t("mock") }));
    root.appendChild(h("div", { class: "totals" },
      h("div", { class: "grand" }, h("span", { text: t("total") + " · " + o.no }), h("span", { text: U.eurC(T) })),
      o.rounds ? h("div", { class: "muted" }, h("span", { text: o.rounds.map(function (r) { return "#" + r; }).join(" + ") })) : null,
      h("div", { class: "muted" }, h("span", { text: t("iva") }), h("span", { text: U.eurC(T - Math.round(T / 1.1)) }))));

    if (s.summary.allPaid) {
      root.appendChild(h("div", { class: "success big", role: "status", text: "✓ " + t("allpaid") }));
      root.appendChild(tracker(o, s, ps));
      return root;
    }
    // mode chooser
    function setMode(m) { if (locked) return; s.mode = m; if (m === "items" && !s.prefilled) prefill(o, s); if (m === "custom" && s.custom.length !== s.people.length) s.custom = s.people.map(function (_, i) { return s.custom[i] || ""; }); save(o, s); rerender(); }
    root.appendChild(h("div", { class: "row pad wrap" },
      h("button", { class: "btn" + (s.mode === "all" ? " primary" : ""), disabled: locked && s.mode !== "all", onclick: function () { setMode("all"); }, text: t("payall") }),
      h("button", { class: "btn" + (s.mode && s.mode !== "all" ? " primary" : ""), disabled: locked && s.mode === "all", onclick: function () { if (!s.mode || s.mode === "all") setMode("equal"); }, text: t("split") })));
    if (s.mode && s.mode !== "all") {
      root.appendChild(h("div", { class: "seg pad", role: "tablist" }, [["equal", "equal"], ["items", "byitems"], ["custom", "custom"]].map(function (m) {
        return h("button", { class: "segbtn", role: "tab", "aria-selected": String(s.mode === m[0]), "aria-checked": String(s.mode === m[0]), disabled: locked && s.mode !== m[0], onclick: function () { setMode(m[0]); }, text: t(m[1]) });
      })));
    }
    if (locked) root.appendChild(h("div", { class: "notice", role: "status", text: "🔒 " + t("locked") }));
    if (!locked && s.mode === "equal") root.appendChild(equalEditor(o, s, rerender));
    if (!locked && s.mode === "items") root.appendChild(itemsEditor(o, s, rerender));
    if (!locked && s.mode === "custom") root.appendChild(customEditor(o, s, rerender));
    if (!locked && (s.mode === "items" || s.mode === "custom") && !v.ok) root.appendChild(h("div", { class: v.err ? "err" : "notice", role: "alert", id: "splitmsg", text: v.msg }));
    if (s.mode) root.appendChild(tracker(o, s, ps, v.ok || locked, rerender));
    return root;
  };

  function payPerson(o, s, i, ps, rerender) {
    paySheet(ps[i].name, ps[i].shareC, function (method) {
      var cur = load(o); if (!cur.frozen) cur.frozen = people(o, cur);
      cur.paid[i] = { method: method, amountC: cur.frozen[i].shareC }; save(o, cur); rerender();
    }, rerender, o.blocked);
  }
  function payRest(o, s, i, ps, rerender) {
    var paidC = Object.keys(s.paid).reduce(function (a, k) { return a + s.paid[k].amountC; }, 0), rest = o.totalC - paidC;
    paySheet(ps[i].name + " — " + t("payrest"), rest, function (method) {
      var cur = load(o); if (!cur.frozen) cur.frozen = people(o, cur);
      cur.frozen.forEach(function (p, j) { if (!cur.paid[j] && !(cur.mode === "items" && !p.shareC)) cur.paid[j] = { method: method, amountC: j === i ? rest : 0, coveredBy: j === i ? null : i }; });
      save(o, cur); rerender();
    }, rerender, o.blocked);
  }
  function tracker(o, s, ps, canPay, rerender) {
    var paidC = s.summary.paidC, rest = o.totalC - paidC;
    var box = h("div", { class: "tracker" }, h("div", { class: "tablebar", role: "status" },
      fmt("paidof", { a: U.eurC(paidC), t: U.eurC(o.totalC) }) + " · " + fmt("remaining", { x: U.eurC(rest) })));
    ps.forEach(function (p, i) {
      if (s.mode === "items" && !p.shareC) return; // 0 € people hidden
      var pd = s.paid[i];
      box.appendChild(h("div", { class: "prow" + (pd ? " ok" : "") },
        h("div", { class: "pname" }, h("b", { text: p.name }), h("div", { class: "muted", text: isNaN(p.shareC) ? "—" : U.eurC(p.shareC) })),
        h("div", { class: "pstat", text: pd ? t("paid") + " (" + (pd.coveredBy != null ? "→ " + ps[pd.coveredBy].name : methodName(pd.method)) + ")" : t("pending") }),
        !pd && rerender ? h("div", { class: "row" },
          h("button", { class: "btn primary", disabled: !canPay || !(p.shareC > 0), onclick: function () { payPerson(o, s, i, ps, rerender); }, text: ps.length === 1 ? t("pay") : t("payshare") }),
          ps.length > 1 && Object.keys(s.paid).length ? h("button", { class: "btn", disabled: !canPay, onclick: function () { payRest(o, s, i, ps, rerender); }, text: t("payrest") }) : null) : null));
    });
    return box;
  }
  function stepper(val, min, max, onSet, label) {
    return h("div", { class: "stepper" }, h("span", { class: "lbl", text: label }),
      h("button", { class: "btn round", "aria-label": label + " −1", disabled: val <= min, onclick: function () { onSet(val - 1); }, text: "−" }),
      h("span", { class: "qty", "aria-live": "polite", text: val }),
      h("button", { class: "btn round", "aria-label": label + " +1", disabled: val >= max, onclick: function () { onSet(val + 1); }, text: "+" }));
  }
  function equalEditor(o, s, rerender) {
    var max = Math.max(2, Math.min(20, o.totalC)); if (s.n > max) s.n = max;
    return h("div", { class: "pad" }, stepper(s.n, 2, max, function (n) { s.n = n; save(o, s); rerender(); }, t("people")));
  }
  function peopleEditor(o, s, rerender) {
    return h("div", { class: "pad" }, s.people.map(function (p, i) {
      return h("div", { class: "row" },
        h("input", { class: "pin", value: p.name, maxlength: "20", "aria-label": t("person") + " " + (i + 1), onchange: function () { p.name = Array.from(this.value.trim() || "P" + (i + 1)).slice(0, 20).join(""); save(o, s); rerender(); } }),
        s.people.length > 1 ? h("button", { class: "btn", "aria-label": t("remove") + " " + p.name, onclick: function () {
          s.people.splice(i, 1); s.custom.splice(i, 1);
          Object.keys(s.units).forEach(function (k) { s.units[k] = s.units[k].filter(function (x) { return x !== i; }).map(function (x) { return x > i ? x - 1 : x; }); });
          save(o, s); rerender(); }, text: "×" }) : null);
    }), s.people.length < 20 ? h("button", { class: "btn", onclick: function () { s.people.push({ name: "P" + (s.people.length + 1) }); s.custom.push(""); save(o, s); rerender(); }, text: t("addperson") }) : null);
  }
  function itemsEditor(o, s, rerender) {
    var box = h("div", null, peopleEditor(o, s, rerender));
    o.lines.forEach(function (l, li) {
      var title = U.L(l.name) + (l.variant ? " — " + U.L(l.variant) : "");
      var lb = h("div", { class: "line col" }, h("b", { text: l.qty + "× " + title + " · " + U.eurC(l.unitC) + (l.qty > 1 ? " / " + t("unit") : "") }));
      for (var u = 0; u < l.qty; u++) (function (u) {
        var key = li + ":" + u, sel = s.units[key] || [];
        lb.appendChild(h("div", { class: "unitrow" }, l.qty > 1 ? h("span", { class: "muted", text: "#" + (u + 1) }) : null,
          s.people.map(function (p, pi) {
            var on = sel.indexOf(pi) >= 0;
            return h("button", { class: "chip", "aria-pressed": String(on), "aria-label": p.name + ": " + title + (l.qty > 1 ? " #" + (u + 1) : ""), onclick: function () {
              var a = s.units[key] || []; if (on) a = a.filter(function (x) { return x !== pi; }); else a.push(pi); s.units[key] = a; save(o, s); rerender(); }, text: p.name });
          }), sel.length > 1 ? h("span", { class: "muted", text: t("shared") }) : null));
      })(u);
      box.appendChild(lb);
    });
    return box;
  }
  function customEditor(o, s, rerender) {
    if (s.custom.length !== s.people.length) s.custom = s.people.map(function (_, i) { return s.custom[i] || ""; });
    var box = h("div", null, peopleEditor(o, s, rerender));
    var restEl = h("div", { class: "tablebar", role: "status" });
    function updRest() { var c = customShares(s), sum = c.reduce(function (a, b) { return a + (isNaN(b) ? 0 : b); }, 0); restEl.textContent = fmt("remaining", { x: U.eurC(o.totalC - sum) }); }
    s.people.forEach(function (p, i) {
      box.appendChild(h("div", { class: "row pad" }, h("label", { class: "lbl grow", for: "amt" + i, text: p.name }),
        h("input", { id: "amt" + i, class: "pin amt", inputmode: "decimal", value: s.custom[i], placeholder: "0,00", "aria-label": p.name,
          oninput: function () { s.custom[i] = this.value; Orders.saveSplit(o.id, s); updRest(); }, onchange: function () { save(o, s); rerender(); } })));
    });
    updRest(); box.appendChild(restEl);
    return box;
  }
  function P() {}
  G.Pay = P;
})(window);
