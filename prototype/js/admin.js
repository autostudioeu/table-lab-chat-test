/* Admin: menu upload (PDF text / OCR / CSV / manual) -> review table -> localStorage.menu
   Data rendered via textContent / input.value only. */
(function () {
  var root = document.getElementById("admin");
  var S = {
    title: ["Subir carta", "Upload menu"], review: ["Revisar platos", "Review dishes"], save: ["Guardar carta", "Save menu"],
    pdf: ["PDF (texto o escaneado)", "PDF (text or scanned)"], csv: ["CSV", "CSV"], manual: ["Añadir a mano", "Add manually"],
    drop: ["Arrastra un PDF/CSV aquí o", "Drop a PDF/CSV here or"], choose: ["Elegir archivo", "Choose file"],
    wrongType: ["Formato no válido. Sube PDF o CSV.", "Invalid format. Upload a PDF or CSV."],
    tooBig: ["Archivo demasiado grande (máx. 10 MB).", "File too large (max 10 MB)."],
    tooMany: ["Demasiadas páginas (máx. 20).", "Too many pages (max 20)."],
    noText: ["No encontramos texto. Probando OCR…", "No text found. Trying OCR…"],
    ocrFail: ["No pudimos leer el escaneo. Usa CSV o el formulario.", "Couldn't read the scan. Use CSV or the form."],
    zero: ["No detectamos platos. Añádelos manualmente.", "No dishes detected. Add them manually."],
    badPrice: ["Precio ilegible (fila {n}) — revísalo.", "Unreadable price (row {n}) — please check."],
    confirmV: ["Confirma raciones", "Confirm portions"], confirmBtn: ["Confirmar", "Confirm"],
    steps: [["Leyendo archivo", "Extrayendo texto", "OCR (si hace falta)", "Detectando platos"], ["Reading file", "Extracting text", "OCR (if needed)", "Detecting dishes"]],
    cancel: ["Cancelar", "Cancel"], back: ["Volver a subir", "Back to upload"], addRow: ["+ Plato", "+ Dish"], addCat: ["+ Categoría", "+ Category"],
    download: ["Descargar JSON", "Download JSON"], reset: ["Restaurar carta demo", "Reset to demo menu"],
    saved: ["Carta guardada. Abre la carta del cliente para verla.", "Menu saved. Open the customer menu to see it."],
    blocked: ["No se puede guardar: corrige precios inválidos y confirma raciones.", "Can't save: fix invalid prices and confirm portions."],
    cat: ["Categoría", "Category"], nameEs: ["Nombre ES", "Name ES"], nameEn: ["Nombre EN", "Name EN"], desc: ["Descripción ES / EN", "Description ES / EN"],
    price: ["Precio / raciones", "Price / portions"], chips: ["Chips", "Chips"], addV: ["+ ración", "+ portion"], del: ["Borrar", "Delete"],
    csvErr: ["Filas CSV con errores (resaltadas):", "CSV rows with errors (highlighted):"], row: ["fila", "row"],
    page: ["Página", "Page"], openMenu: ["Abrir carta cliente", "Open customer menu"], current: ["Editar carta actual", "Edit current menu"],
    add: ["Añadir", "Add"], cancelled: ["Cancelado.", "Cancelled."], csvHelp: ["Cabecera: category,name_es,name_en,description_es,description_en,price,variant_labels_es,variant_labels_en,chips (separador , o ;)", "Header: category,name_es,name_en,description_es,description_en,price,variant_labels_es,variant_labels_en,chips (, or ; separator)"]
  };
  function s(k) { var v = S[k]; return v[U.lang() === "en" ? 1 : 0]; }
  function h(tag, a) {
    var el = document.createElement(tag); a = a || {};
    Object.keys(a).forEach(function (k) { var v = a[k]; if (v == null || v === false) return;
      if (k === "class") el.className = v; else if (k === "text") el.textContent = v; else if (k === "value") el.value = v;
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? "" : v); });
    for (var i = 2; i < arguments.length; i++) (function ap(c) { if (c == null || c === false) return; if (Array.isArray(c)) return c.forEach(ap);
      el.appendChild(typeof c === "object" ? c : document.createTextNode(String(c))); })(arguments[i]);
    return el;
  }
  var CHIPS = (window.MENU && window.MENU.chips) || {};
  var rows = [], extraCats = [], job = null, view = "upload", error = null, notice = null, csvErrors = [];

  /* ---------- error banner with recovery action ---------- */
  function errBox() {
    if (!error) return null;
    var e = error;
    return h("div", { class: "err", role: "alert" }, h("div", { text: e.msg }),
      e.action ? h("button", { class: "btn", onclick: e.action[1], text: e.action[0] }) : null);
  }
  function fail(key, action) { error = { msg: S[key][0] + " / " + S[key][1], action: action }; render(); }

  /* ---------- upload screen ---------- */
  function viewUpload() {
    var fileIn = h("input", { type: "file", accept: ".pdf,.csv,application/pdf,text/csv", hidden: true, onchange: function () { if (this.files[0]) handleFile(this.files[0]); this.value = ""; } });
    var drop = h("div", { class: "drop", ondragover: function (e) { e.preventDefault(); drop.classList.add("over"); }, ondragleave: function () { drop.classList.remove("over"); },
      ondrop: function (e) { e.preventDefault(); drop.classList.remove("over"); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); } },
      h("p", { text: s("drop") }), h("button", { class: "btn primary", onclick: function () { fileIn.click(); }, text: s("choose") }), fileIn);
    var m = { cat: h("input", { list: "catlist", "aria-label": s("cat"), placeholder: s("cat") }), es: h("input", { placeholder: s("nameEs"), "aria-label": s("nameEs") }),
      en: h("input", { placeholder: s("nameEn"), "aria-label": s("nameEn") }), price: h("input", { placeholder: "12 / 16,5 / 16 / 22", "aria-label": s("price"), inputmode: "decimal" }) };
    var dl = h("datalist", { id: "catlist" }, cats().map(function (c) { return h("option", { value: c }); }));
    return [h("div", { class: "cols" },
      h("section", { class: "box" }, h("h2", { text: "(a) " + s("pdf") }), drop, h("p", { class: "muted", text: "≤ 10 MB · ≤ 20 pág." })),
      h("section", { class: "box" }, h("h2", { text: "(b) " + s("csv") + " + " + s("manual") }),
        h("button", { class: "btn", onclick: function () { fileIn.click(); }, text: s("choose") + " (.csv)" }),
        h("a", { class: "btn ghost", href: "sample-menu.csv", download: "sample-menu.csv", text: "sample-menu.csv" }),
        h("p", { class: "muted", text: s("csvHelp") }),
        h("div", { class: "form" }, m.cat, dl, m.es, m.en, m.price,
          h("button", { class: "btn primary", onclick: function () {
            var ps = m.price.value.split("/").map(U.num);
            if (!m.es.value.trim() || ps.some(isNaN) || ps.length > 2) { error = { msg: S.badPrice[0].replace("{n}", rows.length + 1) + " / " + S.badPrice[1].replace("{n}", rows.length + 1), action: [s("back"), function () { error = null; render(); }] }; render(); return; }
            rows.push({ category: m.cat.value.trim() || "Sin categoría", name: m.es.value.trim(), name_en: m.en.value.trim(), desc: "", desc_en: "",
              variants: U.mkVariants(ps), labelsAssumed: ps.length > 1, chips: [], conf: ps.length > 2 ? "low" : "high", reason: "" });
            error = null; view = "review"; render(); }, text: s("add") + " → " + s("review") })))),
      h("div", { class: "bar2" },
        h("button", { class: "btn", onclick: function () { loadCurrent(); view = "review"; render(); }, text: s("current") }),
        rows.length ? h("button", { class: "btn", onclick: function () { view = "review"; render(); }, text: s("review") + " (" + rows.length + ")" }) : null)];
  }

  /* ---------- file handling ---------- */
  function handleFile(f) {
    error = null; csvErrors = [];
    var name = f.name.toLowerCase();
    var isPdf = f.type === "application/pdf" || /\.pdf$/.test(name), isCsv = /\.csv$/.test(name) || f.type === "text/csv";
    if (!isPdf && !isCsv) return fail("wrongType", [s("back"), function () { error = null; render(); }]);
    if (f.size > 10 * 1024 * 1024) return fail("tooBig", [s("back"), function () { error = null; render(); }]);
    if (isCsv) {
      var r = new FileReader();
      r.onload = function () {
        var res = U.parseCSV(r.result); csvErrors = res.errors;
        if (!res.rows.length) return fail("zero", [s("manual"), function () { error = null; render(); }]);
        rows = res.rows; view = "review"; render();
      };
      r.readAsText(f, "utf-8"); return;
    }
    // magic bytes: a real PDF starts with "%PDF-" (a renamed HTML/other file is rejected)
    f.slice(0, 1024).arrayBuffer().then(function (b) {
      var head = String.fromCharCode.apply(null, new Uint8Array(b));
      if (head.indexOf("%PDF-") < 0) return fail("wrongType", [s("back"), function () { error = null; render(); }]);
      runPdf(f);
    });
  }

  function setProg(step, pct, pageTxt) { if (!job) return; job.step = step; job.pct = pct; job.page = pageTxt || ""; if (view === "progress") render(); }
  function cancelJob() {
    if (job) { job.cancelled = true; try { job.worker && job.worker.terminate(); } catch (e) {} try { job.pdf && job.pdf.destroy(); } catch (e) {} }
    job = null; view = "upload"; notice = s("cancelled"); render();
  }
  function libUrl(p) { return new URL(p, location.href).href; }

  async function runPdf(f) {
    var my = job = { step: 0, pct: 0, page: "", cancelled: false }; view = "progress"; render();
    function alive() { return job === my && !my.cancelled; }
    try {
      if (!window.pdfjsLib) throw new Error("pdf.js not loaded");
      pdfjsLib.GlobalWorkerOptions.workerSrc = window.PDF_WORKER_SRC || libUrl("vendor/pdfjs/pdf.worker.min.js");
      var buf = await f.arrayBuffer(); if (!alive()) return;
      setProg(1, 10);
      var pdf = my.pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise; if (!alive()) return;
      if (pdf.numPages > 20) { job = null; view = "upload"; return fail("tooMany", [s("back"), function () { error = null; render(); }]); }
      var lines = [], chars = 0;
      for (var p = 1; p <= pdf.numPages; p++) {
        var tc = await (await pdf.getPage(p)).getTextContent(); if (!alive()) return;
        var ls = U.itemsToLines(tc.items); lines = lines.concat(ls); chars += ls.join("").replace(/\s/g, "").length;
        setProg(1, 10 + 40 * p / pdf.numPages, s("page") + " " + p + "/" + pdf.numPages);
      }
      var ocrConf = null;
      if (chars < 20 * pdf.numPages) {           // no usable text layer -> OCR
        notice = s("noText");
        setProg(2, 50);
        var res = await ocrPdf(pdf, my, alive); if (!alive()) return;
        if (!res) { job = null; view = "upload"; return fail("ocrFail", [s("manual"), function () { error = null; render(); }]); }
        lines = res.lines; ocrConf = res.conf;
      }
      setProg(3, 95);
      var parsed = U.parseMenuLines(lines);
      if (ocrConf) parsed.forEach(function (r) { var c = ocrConf[r._src]; if (r.conf === "high" && ocrLow(r, ocrConf)) { r.conf = "low"; r.reason = "OCR conf < 70"; } });
      job = null; notice = null;
      if (!parsed.length) { view = "upload"; return fail("zero", [s("manual"), function () { error = null; render(); }]); }
      rows = parsed; view = "review"; render();
    } catch (e) {
      if (!alive()) return;
      console.error(e); job = null; view = "upload";
      fail("ocrFail", [s("back"), function () { error = null; render(); }]);
    }
  }
  function ocrLow(r, conf) { return conf.some(function (c) { return c.c < 70 && c.t && r.name.indexOf(c.t.slice(0, 12)) >= 0; }); }

  async function ocrPdf(pdf, my, alive) {
    if (!window.Tesseract) return null;
    try {
      var cur = 1;
      var worker = my.worker = await Tesseract.createWorker("spa+eng", 1, {
        workerPath: libUrl("vendor/tesseract/worker.min.js"), corePath: libUrl("vendor/tesseract/"), langPath: libUrl("vendor/tesseract/lang"),
        gzip: true, workerBlobURL: false,
        logger: function (m) { if (alive() && m.status === "recognizing text") setProg(2, 50 + 45 * ((cur - 1) + m.progress) / pdf.numPages, s("page") + " " + cur + "/" + pdf.numPages); }
      });
      var lines = [], conf = [];
      for (cur = 1; cur <= pdf.numPages; cur++) {
        if (!alive()) return null;
        var page = await pdf.getPage(cur), vp = page.getViewport({ scale: 2 });
        var cv = document.createElement("canvas"); cv.width = vp.width; cv.height = vp.height;
        await page.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
        var out = await worker.recognize(cv); if (!alive()) return null;
        (out.data.lines || []).forEach(function (l) { lines.push(l.text.trim()); conf.push({ t: l.text.trim(), c: l.confidence }); });
        if (!out.data.lines) out.data.text.split("\n").forEach(function (t) { lines.push(t); });
      }
      await worker.terminate(); my.worker = null;
      return lines.join("").trim() ? { lines: lines, conf: conf } : null;
    } catch (e) { console.error(e); return null; }
  }

  function viewProgress() {
    var st = S.steps[U.lang() === "en" ? 1 : 0];
    return h("section", { class: "box prog", "aria-live": "polite" },
      h("ol", { class: "steps" }, st.map(function (x, i) { return h("li", { class: i === job.step ? "on" : i < job.step ? "ok" : "" }, x); })),
      h("div", { class: "bar", role: "progressbar", "aria-valuenow": Math.round(job.pct), "aria-valuemin": "0", "aria-valuemax": "100" }, h("i", { style: "width:" + Math.round(job.pct) + "%" })),
      h("div", { text: Math.round(job.pct) + "% " + (job.page || "") }),
      notice ? h("p", { class: "muted", text: notice }) : null,
      h("button", { class: "btn", onclick: cancelJob, text: s("cancel") }));
  }

  /* ---------- review ---------- */
  function cats() {
    var out = [];
    rows.forEach(function (r) { if (r.category && out.indexOf(r.category) < 0) out.push(r.category); });
    extraCats.forEach(function (c) { if (out.indexOf(c) < 0) out.push(c); });
    return out;
  }
  function rowInvalid(r) { return !r.name.trim() || !r.variants.length || r.variants.some(function (v) { return !(v.price >= 0) || isNaN(v.price); }); }
  function viewReview() {
    var cl = cats();
    var tb = h("tbody");
    rows.forEach(function (r, i) {
      var low = r.conf === "low" || rowInvalid(r) || r.labelsAssumed;
      var sel = h("select", { "aria-label": s("cat"), onchange: function () { r.category = this.value; } }, cl.map(function (c) { var o = h("option", { value: c, text: c }); if (c === r.category) o.selected = true; return o; }));
      var vbox = h("div");
      r.variants.forEach(function (v, k) {
        var pin = h("input", { value: isNaN(v.price) ? "" : String(v.price).replace(".", U.lang() === "es" ? "," : "."), "aria-label": s("price"), inputmode: "decimal",
          class: isNaN(v.price) ? "bad" : "", onchange: function () { v.price = U.num(this.value); render(); } });
        vbox.appendChild(h("div", { class: "vrow" },
          h("input", { value: v.label_es, placeholder: r.variants.length > 1 ? "Media" : "—", "aria-label": "label ES", onchange: function () { v.label_es = this.value; r.labelsAssumed = false; render(); } }),
          h("input", { value: v.label_en, placeholder: r.variants.length > 1 ? "Half" : "—", "aria-label": "label EN", onchange: function () { v.label_en = this.value; r.labelsAssumed = false; render(); } }),
          pin,
          r.variants.length > 1 ? h("button", { class: "btn", "aria-label": "−", onclick: function () { r.variants.splice(k, 1); if (r.variants.length === 1) { r.variants[0].label_es = ""; r.variants[0].label_en = ""; r.labelsAssumed = false; } render(); }, text: "×" }) : h("span")));
        if (isNaN(v.price)) vbox.appendChild(h("div", { class: "w", text: "⚠ " + s("badPrice").replace("{n}", i + 1) }));
      });
      vbox.appendChild(h("button", { class: "btn ghost", onclick: function () {
        if (r.variants.length === 1 && !r.variants[0].label_es) { r.variants[0].label_es = "Media"; r.variants[0].label_en = "Half"; r.variants.push({ label_es: "Entera", label_en: "Full", price: r.variants[0].price }); r.labelsAssumed = true; }
        else r.variants.push({ label_es: "Opción " + (r.variants.length + 1), label_en: "Option " + (r.variants.length + 1), price: NaN });
        render(); }, text: s("addV") }));
      if (r.labelsAssumed) vbox.appendChild(h("div", { class: "w" }, "⚠ " + s("confirmV") + " ",
        h("button", { class: "btn", onclick: function () { r.labelsAssumed = false; render(); }, text: s("confirmBtn") })));
      if (r.variants.length > 2) vbox.appendChild(h("div", { class: "w", text: "⚠ 3+" }));
      var chipBox = h("div", { class: "chipsel" }, Object.keys(CHIPS).map(function (cid) {
        var cb = h("input", { type: "checkbox", onchange: function () { var j = r.chips.indexOf(cid); if (this.checked && j < 0) r.chips.push(cid); if (!this.checked && j >= 0) r.chips.splice(j, 1); } });
        cb.checked = r.chips.indexOf(cid) >= 0;
        return h("label", null, cb, U.L(CHIPS[cid]));
      }));
      tb.appendChild(h("tr", { class: low ? "low" : "" },
        h("td", { "data-label": "#" }, low ? h("span", { title: r.reason || "", text: "⚠ " }) : null, String(i + 1), r.reason ? h("div", { class: "w", text: r.reason }) : null),
        h("td", { "data-label": s("cat") }, sel),
        h("td", { "data-label": s("nameEs") }, h("input", { value: r.name, "aria-label": s("nameEs"), onchange: function () { r.name = this.value; } })),
        h("td", { "data-label": s("nameEn") }, h("input", { value: r.name_en, "aria-label": s("nameEn"), onchange: function () { r.name_en = this.value; } })),
        h("td", { "data-label": s("desc") }, h("input", { value: r.desc, placeholder: "ES", "aria-label": "desc ES", onchange: function () { r.desc = this.value; } }),
          h("input", { value: r.desc_en, placeholder: "EN", "aria-label": "desc EN", onchange: function () { r.desc_en = this.value; } })),
        h("td", { "data-label": s("price") }, vbox), h("td", { "data-label": s("chips") }, chipBox),
        h("td", null, h("button", { class: "btn", onclick: function () { rows.splice(i, 1); render(); }, text: s("del") }))));
    });
    var blocked = rows.some(function (r) { return rowInvalid(r) || r.labelsAssumed; });
    var nLow = rows.filter(function (r) { return r.conf === "low" || rowInvalid(r) || r.labelsAssumed; }).length;
    var en = U.lang() === "en";
    var pl = function (n, es1, esN, en1, enN) { return n + " " + (en ? (n === 1 ? en1 : enN) : (n === 1 ? es1 : esN)); };
    return [
      h("div", { class: "bar2" },
        h("button", { class: "btn", onclick: function () { view = "upload"; render(); }, text: "← " + s("back") }),
        h("strong", { text: pl(rows.length, "plato", "platos", "dish", "dishes") + " · " + pl(cl.length, "categoría", "categorías", "category", "categories") + " · ⚠ " + pl(nLow, "marcado", "marcados", "flagged", "flagged") })),
      csvErrors.length ? h("div", { class: "err" }, s("csvErr") + " " + csvErrors.map(function (e) { return s("row") + " " + e.row + " (" + e.msg + ")"; }).join("; ")) : null,
      h("div", { class: "tblwrap" }, h("table", { class: "tbl" },
        h("thead", null, h("tr", null, ["#", s("cat"), s("nameEs"), s("nameEn"), s("desc"), s("price"), s("chips"), ""].map(function (x) { return h("th", { text: x }); }))), tb)),
      h("div", { class: "bar2" },
        h("button", { class: "btn", onclick: function () { rows.push({ category: cl[0] || "Sin categoría", name: "", name_en: "", desc: "", desc_en: "", variants: [{ label_es: "", label_en: "", price: NaN }], labelsAssumed: false, chips: [], conf: "low", reason: "" }); render(); }, text: s("addRow") }),
        h("button", { class: "btn", onclick: function () { var n = prompt(s("cat")); if (n && n.trim()) { extraCats.push(n.trim()); render(); } }, text: s("addCat") }),
        h("button", { class: "btn primary", disabled: blocked, title: blocked ? s("blocked") : "", onclick: save, text: s("save") }),
        h("button", { class: "btn", onclick: download, text: s("download") }),
        blocked ? h("span", { class: "w", text: s("blocked") }) : null)];
  }
  function toMenu() {
    var cl = cats(), ids = {}, menu = { restaurant: (U.getMenu() || {}).restaurant || "Restaurante", currency: "EUR", categories: [], dishes: [], chips: CHIPS };
    cl.forEach(function (c) { var id = U.slug(c), n = 2; while (ids[id]) id = U.slug(c) + "_" + n++; ids[id] = c; menu.categories.push({ id: id, name: { es: c } }); });
    var byName = {}; menu.categories.forEach(function (c) { byName[c.name.es] = c.id; });
    rows.forEach(function (r, i) {
      var name = { es: r.name.trim() }; if (r.name_en.trim()) name.en = r.name_en.trim();
      var desc = {}; if (r.desc.trim()) desc.es = r.desc.trim(); if (r.desc_en.trim()) desc.en = r.desc_en.trim();
      menu.dishes.push({ id: "d" + (i + 1), cat: byName[r.category] || menu.categories[0].id, name: name, desc: desc,
        variants: r.variants.map(function (v) { return { label_es: r.variants.length > 1 ? v.label_es : "", label_en: r.variants.length > 1 ? v.label_en : "", price: Math.round(v.price * 100) / 100 }; }),
        chips: r.chips.length ? r.chips.slice() : Object.keys(CHIPS) });
    });
    return menu;
  }
  function save() {
    if (rows.some(function (r) { return rowInvalid(r) || r.labelsAssumed; })) { error = { msg: s("blocked") }; render(); return; }
    localStorage.setItem("menu", JSON.stringify(toMenu()));
    localStorage.setItem("menuRows", JSON.stringify(rows)); // keeps low-confidence flags/edits for reload
    localStorage.removeItem("cart");
    error = null; notice = s("saved"); render();
  }
  function download() {
    var b = new Blob([JSON.stringify(toMenu(), null, 1)], { type: "application/json" });
    var a = h("a", { href: URL.createObjectURL(b), download: "menu.json" }); document.body.appendChild(a); a.click(); a.remove();
  }
  function loadCurrent() {
    var m = U.getMenu(), cn = {}; m.categories.forEach(function (c) { cn[c.id] = c.name.es || c.name.en; });
    rows = m.dishes.map(function (d) { return { category: cn[d.cat] || "", name: d.name.es || "", name_en: d.name.en || "", desc: (d.desc || {}).es || "", desc_en: (d.desc || {}).en || "",
      variants: d.variants.map(function (v) { return { label_es: v.label_es || "", label_en: v.label_en || "", price: v.price }; }), labelsAssumed: false, chips: (d.chips || []).slice(), conf: "high", reason: "" }; });
    try { var saved = JSON.parse(localStorage.getItem("menuRows")); if (saved && localStorage.getItem("menu") && saved.length === rows.length) rows = saved; } catch (e) {}
  }

  /* ---------- shell ---------- */
  function render() {
    document.documentElement.lang = U.lang();
    root.textContent = "";
    root.appendChild(h("header", { class: "top" }, h("span", { class: "logo", text: "Admin" }), h("h1", { text: view === "review" ? s("review") : s("title") }),
      h("a", { class: "btn ghost", href: window.CUSTOMER_URL || "index.html", text: s("openMenu") }),
      h("button", { class: "btn ghost", onclick: function () { if (confirm(s("reset") + "?")) { localStorage.removeItem("menu"); localStorage.removeItem("menuRows"); localStorage.removeItem("cart"); notice = s("reset") + " ✓"; rows = []; view = "upload"; render(); } }, text: s("reset") }),
      h("button", { class: "btn ghost", "aria-label": "Idioma / Language", onclick: function () { U.setLang(U.lang() === "es" ? "en" : "es"); render(); }, text: U.lang() === "es" ? "ES | en" : "EN | es" })));
    var e = errBox(); if (e) root.appendChild(e);
    if (notice && view !== "progress") root.appendChild(h("div", { class: "success", role: "status", text: notice }));
    var v = view === "progress" && job ? viewProgress() : view === "review" ? viewReview() : viewUpload();
    (Array.isArray(v) ? v : [v]).forEach(function (x) { if (x) root.appendChild(x); });
  }
  render();
})();
