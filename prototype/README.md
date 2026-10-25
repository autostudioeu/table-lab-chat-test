# QR restaurant ordering: clickable local prototype (M1)

This is an internal prototype. It uses only plain HTML, CSS and vanilla JS, with no framework and no bundler. It makes no network calls and takes no real payments. All state is kept in `localStorage` and `sessionStorage`. The bundled menu is generic placeholder data. Parser testing against real menu PDFs is done locally and those files are not in this repo.

## Open it
| Page | How |
|---|---|
| Customer flow (dev) | Open `prototype/index.html?table=7` directly (`file://`). You can also use `#table=7` |
| Kitchen (dev) | `prototype/kitchen.html`, or `index.html#kitchen` |
| Admin, menu upload (dev) | `prototype/admin.html`. **PDF OCR needs a local server** (see below) |
| **Single file for the phone** | `dist/ordering.html#table=7`. Copy it to the phone and open it in Chrome. Routes are hash-only: `#table=7`, `#menu`, `#cart`, `#pay`, `#kitchen`, `#guest` |
| Admin single file | `dist/admin.html`. pdf.js and its worker are inlined. **OCR is not included** (see below) |

A local server is needed for OCR because Tesseract's Web Worker and WASM won't load from `file://`:
```
cd prototype && python3 -m http.server 8000     # then http://localhost:8000/admin.html
```
pdf.js text extraction works from `file://` as well.

## Build
- `node build-menu.js` regenerates `data/menu.js` from `../sample-menu.json`. Result: 47 dishes, 8 categories, 5 two-variant dishes.
- `python3 build-dist.py` concatenates the files into `../dist/ordering.html` and `../dist/admin.html`. It only inlines `<link>`/`<script src>` and does no transforms.

## Demo script
1. Open `ordering.html#table=7` and type a name (for example Ana). Add dishes. For a two-portion dish you must pick Media or Entera before you can add it. You can mark a dish "Para compartir" (to share).
2. Use **Cambiar comensal** (in the header) to add Luis in the same tab, then add more dishes. A second tab with the same URL syncs through the `storage` event.
3. Cart → **Enviar pedido**. This creates ticket `7-0001`, and the kitchen sees it right away. Dishes added after that go into round 2, which gets ticket `7-0002`.
4. Tap **Pagar**. The bill covers all rounds that were sent. Choose Pagar todo or Dividir cuenta (equal parts, by dish with guests prefilled, or custom amounts). Each person pays with Pix, Bizum, Apple Pay or Google Pay. All of these are mock.
5. Open `#kitchen` to see tickets (always in Spanish), the PENDIENTE/PAGADO badge, "Hecho" (done), and **Reset demo**.
6. Admin: upload a menu PDF or `sample-menu.csv`, confirm portions, then **Guardar carta**. The customer menu then reads `localStorage.menu`.

## Files
- `index.html`, `kitchen.html`, `admin.html`, `styles.css`, `admin.css`
- `js/common.js`: i18n, formatting, the DOM helper (textContent only), the PDF line parser and the CSV parser
- `js/table.js`: shared table state for group ordering and guest identity
- `js/orders.js`: order store, Spanish kitchen ticket, payment badge
- `js/pay.js`: checkout and bill splitting (modular, mock only)
- `js/kitchen.js`, `js/app.js` (customer router), `js/admin.js`
- `data/menu.js` (generated), `sample-menu.csv`, `sample-menu-semicolon.csv`
  - In `sample-menu.csv`, the last row has a label/price mismatch on purpose, so it gets flagged.
- `vendor/pdfjs/` (pdf.js 3.11.174 legacy), `vendor/tesseract/` (tesseract.js 5.1.1 + core LSTM wasm.js + `eng`/`spa` traineddata, 4.0.0_best_int)

## Known limits
- Phone and multi-device sync is simulated. It works within one browser profile only.
- On Android, Chrome may give each `file://` page its own storage. If that happens, a menu saved in `admin.html` might not show up in `ordering.html`. Use the same folder or the local server.
- OCR on a low-resolution scan finds dishes and categories, but the names come out noisy. Review them before saving.
