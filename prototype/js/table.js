/* Simulated group ordering: shared per-table state in localStorage["table:N"], guest identity per tab in sessionStorage.
   Every write = read -> apply -> version+1 -> save (last write wins; each tx re-reads fresh state first). */
(function (G) {
  var TS = G.TableStore = {
    key: function (n) { return "table:" + n; },
    read: function (n) {
      try { var s = JSON.parse(localStorage.getItem(TS.key(n))); if (s && s.lines) return s; } catch (e) {}
      return { version: 0, round: 1, guests: [], lines: [], rounds: [] };
    },
    tx: function (n, fn) {
      var s = TS.read(n), r = fn(s);
      if (r === false) return false;
      s.version = (s.version || 0) + 1;
      localStorage.setItem(TS.key(n), JSON.stringify(s));
      return r === undefined ? true : r;
    },
    uid: function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },
    guestId: function (n) { try { var g = JSON.parse(sessionStorage.getItem("guest")); return g && g.table === n ? g.id : null; } catch (e) { return null; } },
    guest: function (n) { var id = TS.guestId(n); return id ? TS.read(n).guests.find(function (g) { return g.id === id; }) || null : null; },
    setGuest: function (n, id) { sessionStorage.setItem("guest", JSON.stringify({ table: n, id: id })); },
    /* add a guest name (1-20 chars); duplicates get "Ana (2)" */
    addGuest: function (n, name) {
      name = Array.from(String(name).trim()).slice(0, 20).join("");
      if (!name) return null;
      return TS.tx(n, function (s) {
        var base = name, k = 2, lower = function (x) { return x.toLocaleLowerCase(); };
        while (s.guests.some(function (g) { return lower(g.name) === lower(name); })) name = base + " (" + k++ + ")";
        var g = { id: "g" + TS.uid(), name: name }; s.guests.push(g); return g.id;
      });
    },
    guestName: function (s, id) { if (id === "shared") return null; var g = s.guests.find(function (x) { return x.id === id; }); return g ? g.name : "?"; },
    resetAll: function () {
      Object.keys(localStorage).forEach(function (k) { if (/^table:|^split:/.test(k)) localStorage.removeItem(k); });
    }
  };
})(window);
