# Dropio

**Dropio** is a local-first, browser-based print layout editor for print shops and designers. Drop artwork onto a millimeter artboard, arrange it with drag-and-resize, run sheet automations (business cards, repeat grids), and export **PDF** or **PNG**—all in the browser, with no upload-to-server step.

A separate **Canvas Wrap** tool (`/canvas-wrap`) handles gallery-wrap jobs with frame-depth bleed math and its own PDF export.

The app is built with [Next.js](https://nextjs.org) (App Router), [React](https://react.dev), and [Tailwind CSS](https://tailwindcss.com). PDF and PNG export run **entirely in the client** using [jsPDF](https://github.com/parallax/jsPDF), [pdf-lib](https://pdf-lib.js.org/), and canvas rasterization.

## What's in the box

| Surface | Route | Purpose |
|---------|--------|---------|
| **Dropio editor** | `/` | Artboard-based layout: drop images, move/resize with snapping, multi-select, cut lines, business-card and repeat-grid automations, **PDF** (300 DPI) and **PNG** export. |
| **Canvas wrap** | `/canvas-wrap` | Gallery-wrap export: image fitted to the printable block (**face + wrap-side bleed** from frame depth and extra margin), centered on the parent sheet; live preview matches export geometry. |

### Legacy URL redirects

These older standalone tool URLs redirect to `/` for anyone with bookmarks:

| Legacy route | Redirects to |
|--------------|--------------|
| `/business-cards` | `/` |
| `/custom-layout` | `/` |
| `/file-inspector` | `/` |

Business-card sheet layout is built into the editor's **Automations** panel (90×50mm cards on A4 or A3).

`/page` also renders the same editor as `/` if you need a stable secondary URL.

## Editor features

- **Custom artboards** — Presets (A4, A3, A2, US Letter, squares, poster) or manual width/height in mm; optional white or transparent background.
- **Image placement** — Drag, resize, layer order, marquee and multi-select, copy/paste/duplicate, snap guides to artboard and other elements.
- **Cut lines** — Optional 0.5pt cutting-line overlay per element, included in PDF export.
- **Automations**
  - **Business cards** — Fill an A4 (10-up) or A3 (24-up) sheet from selected artwork at 90×50mm with 1mm spacing.
  - **Repeat grid** — Tile artwork in a configurable rows × cols grid with gap.
- **Export**
  - **PDF** — 300 DPI rasterization via jsPDF (`pageTool.js`).
  - **PNG** — 300 DPI raster export with optional transparent background (`renderPage.js`).

## Canvas wrap features

- Preset canvas sizes with parent-sheet guidance.
- Frame thickness and extra bleed inputs; geometry shared between preview (`RenderFrame`) and PDF export.
- Accepts common image uploads (including PDF first-page normalization via `pdfToImage.js`).

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

- **`NEXT_PUBLIC_SITE_URL`** — Canonical site URL (used for `metadataBase` and Open Graph–style URLs). If unset, local dev defaults to `http://localhost:3000`.
- **`NEXT_PUBLIC_GITHUB_REPO_URL`** — GitHub repo link shown in the editor sidebar (defaults to the project repository).

## Project structure

```
app/
  layout.js                 # Root HTML shell and metadata
  page.js                   # Home: Dropio editor (PageClient)
  globals.css
  components/               # RenderFrame, CanvasWrapWorkspace
  (pages)/                  # Route group
    layout.jsx              # Minimal wrapper for tool routes
    page/
      PageClient.jsx        # Main editor UI and document model
      page.js               # Same editor at /page
    canvas-wrap/page.js     # Canvas wrap tool
  lib/
    page/
      renderPage.js         # PNG raster export
      persistState.js       # Local editor state persistence
    pdf/                    # Client PDF pipeline
      pageTool.js           # Editor PDF export (300 DPI)
      canvasWrap.js
      canvasSheetLayout.js
      workers.js            # Download helpers
      index.js              # Public exports
    file/
      pdfToImage.js         # PDF page → image for uploads
```

## Prepress note

All geometry is **millimeter-based**. **Canvas wrap** models **gallery-wrap bleed** from frame thickness and extra margin. **Business-card automation** in the editor uses **trim size only** (90×50mm, no bleed field). PDF and PNG export rasterize images to **300 DPI** at the element's physical size on the artboard. Embedded images are passed through from uploads; for commercial offset or wide-gamut ink, prepare **resolution and color** in source artwork and use your normal RIP or PDF workflow—this app does not perform **CMYK separation**.

## Learn more

- [Next.js documentation](https://nextjs.org/docs)  
- [Tailwind CSS](https://tailwindcss.com/docs)  
- [pdf-lib](https://pdf-lib.js.org/) · [jsPDF](https://github.com/parallax/jsPDF)

---

*Internal-style utility: no built-in authentication or order management.*
