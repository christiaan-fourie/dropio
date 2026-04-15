# Dropio

**Dropio** is a browser-based toolkit for print shops and designers. It helps you lay out business cards, canvas gallery wraps, and arbitrary sheet jobs, then export **PDFs** sized in millimeters on standard sheets (**wrap-side bleed** is modeled for canvas; cards and custom layouts focus on placement and sheet use). A **file inspector** utility reports real format, dimensions, and PDF page counts from uploads, using local detection (magic bytes and light parsing) so nothing is sent to a server for that inspection.

The app is built with [Next.js](https://nextjs.org) (App Router), [React](https://react.dev), [Tailwind CSS](https://tailwindcss.com), and [Chakra UI](https://chakra-ui.com). PDF generation and file inspection run **entirely in the client** using [jsPDF](https://github.com/parallax/jsPDF), [pdf-lib](https://pdf-lib.js.org/), and custom layout math.

## What’s in the box

| Tool | Route | Purpose |
|------|--------|---------|
| **Business cards** | `/business-cards` | **90×50mm** cards on **A4 or A3** in a fixed grid (1mm spacing), **PNG/JPG** embed via **pdf-lib**, optional **duplex** with mirrored columns on the back; live preview. |
| **Canvas wrap** | `/canvas-wrap` | **jsPDF** export: image fitted to the printable block (**face + gallery-wrap bleed** from frame depth and extra margin), centered on the parent sheet; preview matches export geometry. |
| **Custom size layout** | `/custom-layout` | Item **width/height (mm)** and **quantity**; **pdf-lib** packs rows on the smallest suitable **A-series** sheet (see `customLayoutMath.js`). |
| **File inspector** | `/file-inspector` | Upload PDF or common raster/vector types; see detected kind, size, dimensions, PDF page count—**local only**. |

The home page (`/`) lists these tools with category filters. Tool pages use a **sidebar** layout (`app/(pages)/layout.jsx`); the root layout adds a **site header** (`app/layout.js`).

## Features

- **Automated layouts** for business cards, canvas wraps (with wrap-side bleed), and custom-sized items on standard **A-series** sheets.
- **PDF export in the browser** (**pdf-lib** for cards and custom layouts; **jsPDF** for canvas wraps)—no upload-to-server step for generation.
- **Live preview** for cards and canvas (including `RenderFrame` alignment with canvas PDF placement).
- **File inspector** for quick local checks on PDFs and common image types.

## Getting started

Requirements: **Node.js** (LTS recommended) and **npm**.

```bash
npm install
npm run dev
```

Dev server uses Turbopack (`next dev --turbopack`). Open [http://localhost:3000](http://localhost:3000).

Other scripts:

- `npm run build` — production build  
- `npm run start` — run production server  
- `npm run lint` — Next.js ESLint  

### Optional environment

- **`NEXT_PUBLIC_SITE_URL`** — Canonical site URL (used for `metadataBase` and Open Graph–style URLs). If unset, local dev defaults to `http://localhost:3000`; on Vercel, `VERCEL_URL` can be inferred where applicable.

## Project structure

```
app/
  layout.js                 # Root HTML shell, metadata, Header
  page.js                   # Home: tool catalog + categories
  globals.css
  components/               # Header, Sidebar, shared UI (e.g. Heading, RenderFrame)
  (pages)/                  # Route group (URLs unchanged)
    layout.jsx              # Sidebar + main column for tools
    business-cards/page.js
    canvas-wrap/page.js
    custom-layout/page.js
    file-inspector/         # page.js + FileInspectorClient.jsx
  lib/
    pdf/                    # Client PDF pipeline
      businessCards.js
      canvasWrap.js
      canvasSheetLayout.js
      customLayout.js
      customLayoutMath.js
      workers.js            # download / worker helpers
      index.js              # Public exports for generators + download
    file/
      inspectFile.js        # Sniffing + dimension/page inspection
```

## Prepress note

Page sizes and geometry are **millimeter-based**. **Canvas wrap** models **gallery-wrap bleed** from your thickness and extra inputs. **Business cards** currently use **trim size only** (no bleed field in the layout math—see `business-cards/page.js`). Embedded images are passed through from uploads; for commercial offset or wide-gamut ink, prepare **resolution and color** in source artwork and use your normal RIP or PDF workflow—this app does not perform **CMYK separation** or enforce **300dpi** in code (some UI copy still references print-shop targets).

## Learn more

- [Next.js documentation](https://nextjs.org/docs)  
- [Tailwind CSS](https://tailwindcss.com/docs)  
- [pdf-lib](https://pdf-lib.js.org/) · [jsPDF](https://github.com/parallax/jsPDF)

---

*Internal-style utility: no built-in authentication or order management.*
