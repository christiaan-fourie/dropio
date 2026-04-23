"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  FiFileText,
  FiImage,
  FiPlus,
  FiRotateCw,
  FiTrash2,
  FiChevronUp,
  FiChevronDown,
  FiCrosshair,
  FiAlignCenter,
  FiDownload,
  FiLoader,
  FiScissors,
  FiCopy,
  FiLayers,
} from "react-icons/fi";
import Heading from "@/app/components/Heading";
import { generatePagePDF, downloadPdfBytes } from "@/app/lib/pdf";

/**
 * Document shape (source of truth for the tool):
 *
 * {
 *   artboard: { name: string, width: number, height: number, unit: "mm" },
 *   elements: Array<{
 *     id: string,
 *     type: "image",
 *     src: string,           // object URL (may be shared across duplicates/paste)
 *     name: string,
 *     naturalWidth: number,  // px
 *     naturalHeight: number, // px
 *     x: number,             // mm, top-left corner on artboard
 *     y: number,             // mm
 *     width: number,         // mm
 *     height: number,        // mm
 *     layer: number,         // stacking order; higher renders on top
 *     cutLine?: boolean,     // when true, a 0.5pt cutting line is stroked around the element
 *   }>
 * }
 *
 * Selection is a list of ids (selectedIds). All drag / copy / delete /
 * duplicate actions operate on the full list.
 */

const MIN_MM = 20;
const MAX_MM = 3000;
const SNAP_THRESHOLD_PX = 6;
const PASTE_OFFSET_MM = 10;

const ARTBOARD_PRESETS = [
  { key: "A4P", label: "A4 Portrait · 210×297mm", width: 210, height: 297 },
  { key: "A4L", label: "A4 Landscape · 297×210mm", width: 297, height: 210 },
  { key: "A3P", label: "A3 Portrait · 297×420mm", width: 297, height: 420 },
  { key: "A3L", label: "A3 Landscape · 420×297mm", width: 420, height: 297 },
  { key: "A2P", label: "A2 Portrait · 420×594mm", width: 420, height: 594 },
  { key: "A2L", label: "A2 Landscape · 594×420mm", width: 594, height: 420 },
  { key: "LETTER_P", label: "US Letter Portrait · 216×279mm", width: 216, height: 279 },
  { key: "LETTER_L", label: "US Letter Landscape · 279×216mm", width: 279, height: 216 },
  { key: "SQ_S", label: "Square · 200×200mm", width: 200, height: 200 },
  { key: "SQ_M", label: "Square · 300×300mm", width: 300, height: 300 },
  { key: "POSTER", label: "Poster · 500×700mm", width: 500, height: 700 },
];

const DEFAULT_ARTBOARD = {
  name: "Untitled page",
  width: 210,
  height: 297,
  unit: "mm",
};

function findPresetKey(width, height) {
  const match = ARTBOARD_PRESETS.find((p) => p.width === width && p.height === height);
  return match ? match.key : "";
}

const inputClass =
  "w-full rounded-lg border-2 border-zinc-600 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 transition-colors hover:border-zinc-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500";

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function makeId() {
  return `el_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}

function loadImageMeta(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ url, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read image: ${file.name}`));
    };
    img.src = url;
  });
}

export default function PageClient() {
  const [artboard, setArtboard] = useState(DEFAULT_ARTBOARD);
  const [elements, setElements] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // Refs keep imperative handlers (keyboard shortcuts, drag callbacks) in sync
  // without re-binding every render.
  const elementsRef = useRef(elements);
  elementsRef.current = elements;
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const artboardRef = useRef(artboard);
  artboardRef.current = artboard;

  // Blob URLs can be shared across elements (duplicate / paste). We revoke
  // them only on artboard reset / unmount so a paste never lands on a dead URL.
  const blobUrlsRef = useRef(new Set());

  const revokeAllBlobs = useCallback(() => {
    blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    blobUrlsRef.current.clear();
  }, []);

  useEffect(() => {
    return () => {
      revokeAllBlobs();
    };
  }, [revokeAllBlobs]);

  const handleResetAll = useCallback(() => {
    revokeAllBlobs();
    setElements([]);
    setSelectedIds([]);
    setArtboard(DEFAULT_ARTBOARD);
  }, [revokeAllBlobs]);

  const handleDownloadPdf = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const { pdfBytes, filename } = await generatePagePDF({
        artboard: artboardRef.current,
        elements: elementsRef.current,
      });
      downloadPdfBytes(pdfBytes, filename);
    } catch (err) {
      console.error("Failed to generate PDF:", err);
      alert(`Could not generate PDF: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  }, [isExporting]);

  const addImagesFromFiles = useCallback(
    async (files) => {
      if (!artboardRef.current || files.length === 0) return;
      const board = artboardRef.current;
      const additions = [];
      for (const file of files) {
        try {
          const { url, naturalWidth, naturalHeight } = await loadImageMeta(file);
          blobUrlsRef.current.add(url);
          const ratio = naturalWidth / naturalHeight || 1;
          let w = Math.min(board.width * 0.4, 120);
          let h = w / ratio;
          if (h > board.height * 0.4) {
            h = board.height * 0.4;
            w = h * ratio;
          }
          const x = clamp((board.width - w) / 2, 0, board.width - w);
          const y = clamp((board.height - h) / 2, 0, board.height - h);
          additions.push({
            id: makeId(),
            type: "image",
            src: url,
            name: file.name || "image",
            mimeType: file.type || "",
            naturalWidth,
            naturalHeight,
            x,
            y,
            width: w,
            height: h,
            layer: 0,
            cutLine: false,
          });
        } catch (err) {
          console.error(err);
        }
      }
      if (additions.length === 0) return;
      setElements((prev) => {
        const base = prev.length === 0 ? 0 : Math.max(...prev.map((e) => e.layer)) + 1;
        return [...prev, ...additions.map((a, i) => ({ ...a, layer: base + i }))];
      });
      setSelectedIds([additions[additions.length - 1].id]);
    },
    []
  );

  const updateElement = useCallback((id, patch) => {
    setElements((prev) => prev.map((el) => (el.id === id ? { ...el, ...patch } : el)));
  }, []);

  // Apply a map of { id → patch } in a single render. Used while group-dragging.
  const updateElements = useCallback((updates) => {
    setElements((prev) =>
      prev.map((el) => (updates[el.id] ? { ...el, ...updates[el.id] } : el))
    );
  }, []);

  // Apply a patch to every element in `ids` (e.g. toggle cutLine on the group).
  const updateSelected = useCallback((patch) => {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    setElements((prev) => prev.map((el) => (idSet.has(el.id) ? { ...el, ...patch } : el)));
  }, []);

  const removeElement = useCallback((id) => {
    // Intentionally don't revoke the blob URL here — another element (from
    // duplicate or paste) may still reference it. URLs are revoked on reset.
    setElements((prev) => prev.filter((el) => el.id !== id));
    setSelectedIds((cur) => cur.filter((x) => x !== id));
  }, []);

  const removeSelected = useCallback(() => {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    setElements((prev) => prev.filter((el) => !idSet.has(el.id)));
    setSelectedIds([]);
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(elementsRef.current.map((el) => el.id));
  }, []);

  const reorderLayer = useCallback((id, direction) => {
    setElements((prev) => {
      const sorted = [...prev].sort((a, b) => a.layer - b.layer);
      const idx = sorted.findIndex((e) => e.id === id);
      if (idx === -1) return prev;
      const swapWith = direction === "up" ? idx + 1 : idx - 1;
      if (swapWith < 0 || swapWith >= sorted.length) return prev;
      const a = sorted[idx];
      const b = sorted[swapWith];
      return prev.map((el) => {
        if (el.id === a.id) return { ...el, layer: b.layer };
        if (el.id === b.id) return { ...el, layer: a.layer };
        return el;
      });
    });
  }, []);

  /**
   * Arrange every element into a rows × cols grid, centered on the artboard.
   *
   * Cells are sized uniformly to the largest element's width/height. Because
   * each element sits inside its own non-overlapping cell, this layout is
   * guaranteed collision-free (even if the grid itself overflows the
   * artboard when elements are larger than the page).
   *
   * The grid shape is picked to best match the artboard's aspect ratio,
   * preferring layouts that fit the artboard. Elements keep their current
   * visual reading order (top-to-bottom, left-to-right).
   */
  const alignAndCenter = useCallback(() => {
    const board = artboardRef.current;
    if (!board) return;
    setElements((prev) => {
      const n = prev.length;
      if (n === 0) return prev;

      if (n === 1) {
        const el = prev[0];
        return prev.map((p) =>
          p.id === el.id
            ? {
                ...p,
                x: clamp((board.width - el.width) / 2, 0, Math.max(0, board.width - el.width)),
                y: clamp((board.height - el.height) / 2, 0, Math.max(0, board.height - el.height)),
              }
            : p
        );
      }

      const maxW = Math.max(...prev.map((e) => e.width));
      const maxH = Math.max(...prev.map((e) => e.height));

      // Search every possible column count and score by: 1) whether the grid
      // fits inside the artboard at all, 2) whether at least its width fits
      // (keeps rows aligned with no horizontal overlap), 3) how close the
      // grid's aspect is to the artboard's. Lower score wins.
      let best = null;
      for (let c = 1; c <= n; c++) {
        const r = Math.ceil(n / c);
        const reqW = c * maxW;
        const reqH = r * maxH;
        const fits = reqW <= board.width && reqH <= board.height;
        const fitsH = reqW <= board.width;
        const aspectDiff = Math.abs(reqW / reqH - board.width / board.height);
        const score = (fits ? 0 : 1e6) + (fitsH ? 0 : 1e3) + aspectDiff;
        if (!best || score < best.score) best = { c, r, score };
      }
      const cols = best.c;
      const rows = best.r;

      // Reading order with a row-banding tolerance so near-aligned items
      // don't flip when one is slightly higher/lower than its neighbour.
      const band = Math.max(1, maxH / 2);
      const sorted = [...prev].sort((a, b) => {
        const ay = Math.round(a.y / band);
        const by = Math.round(b.y / band);
        if (ay !== by) return ay - by;
        return a.x - b.x;
      });

      // Equal outer margins + equal gutters. Clamped to 0 when the grid
      // doesn't fit (elements then sit flush against each other; still
      // non-overlapping because each cell is maxW × maxH).
      const gapX = Math.max(0, (board.width - cols * maxW) / (cols + 1));
      const gapY = Math.max(0, (board.height - rows * maxH) / (rows + 1));

      const positions = new Map();
      sorted.forEach((el, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const cellX = gapX + col * (maxW + gapX);
        const cellY = gapY + row * (maxH + gapY);
        // Center each element inside its cell. We don't cap at the artboard
        // max: if the grid overflows (elements too large for the page), we
        // prefer overflow over overlap.
        const x = Math.max(0, cellX + (maxW - el.width) / 2);
        const y = Math.max(0, cellY + (maxH - el.height) / 2);
        positions.set(el.id, { x, y });
      });

      return prev.map((p) => {
        const next = positions.get(p.id);
        return next ? { ...p, ...next } : p;
      });
    });
  }, []);

  /**
   * Insert a copy of the given source element. Returns the new id.
   * `offsetMm` is applied to x/y and clamped to the artboard. Pass 0 for
   * Alt-drag (clone stays at the source position while the drag moves the
   * original away) and a non-zero value for keyboard paste.
   */
  const insertCopy = useCallback((source, offsetMm = 0) => {
    const board = artboardRef.current;
    if (!board || !source) return null;
    const newId = makeId();
    const maxW = Math.max(1, board.width - source.width);
    const maxH = Math.max(1, board.height - source.height);
    const nx = clamp(source.x + offsetMm, 0, maxW);
    const ny = clamp(source.y + offsetMm, 0, maxH);
    setElements((prev) => {
      const topLayer = prev.length === 0 ? 0 : Math.max(...prev.map((e) => e.layer)) + 1;
      return [
        ...prev,
        {
          ...source,
          id: newId,
          x: nx,
          y: ny,
          layer: topLayer,
        },
      ];
    });
    return newId;
  }, []);

  // Alt-drag duplicates every selected element in place, leaving a static
  // clone at each source position while the drag continues to move the
  // originals.
  const duplicateSelectedInPlace = useCallback(() => {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const sources = elementsRef.current.filter((el) => idSet.has(el.id));
    for (const src of sources) insertCopy(src, 0);
  }, [insertCopy]);

  // Clipboard stores snapshots of all copied elements. Blob URLs remain valid
  // because they live until reset / unmount.
  const clipboardRef = useRef([]);

  const copySelected = useCallback(() => {
    const idSet = new Set(selectedIdsRef.current);
    const snapshot = elementsRef.current
      .filter((el) => idSet.has(el.id))
      .map((el) => ({ ...el }));
    if (snapshot.length === 0) return false;
    clipboardRef.current = snapshot;
    return true;
  }, []);

  const pasteFromClipboard = useCallback(() => {
    const src = clipboardRef.current;
    if (!src || src.length === 0) return;
    const newIds = [];
    for (const s of src) {
      const id = insertCopy(s, PASTE_OFFSET_MM);
      if (id) newIds.push(id);
    }
    if (newIds.length > 0) setSelectedIds(newIds);
  }, [insertCopy]);

  // Global Ctrl/Cmd+C, Ctrl/Cmd+V, Ctrl/Cmd+A, Delete. Ignored while typing.
  useEffect(() => {
    if (!artboard) return;
    const onKey = (e) => {
      const t = e.target;
      const tag = (t?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || t?.isContentEditable) {
        return;
      }
      const key = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && key === "c") {
        if (copySelected()) e.preventDefault();
        return;
      }
      if (mod && key === "v") {
        if (clipboardRef.current && clipboardRef.current.length > 0) {
          pasteFromClipboard();
          e.preventDefault();
        }
        return;
      }
      if (mod && key === "a") {
        if (elementsRef.current.length > 0) {
          selectAll();
          e.preventDefault();
        }
        return;
      }
      if (mod && key === "d") {
        if (selectedIdsRef.current.length > 0) {
          duplicateSelectedInPlace();
          e.preventDefault();
        }
        return;
      }
      if (!mod && (key === "delete" || key === "backspace")) {
        if (selectedIdsRef.current.length > 0) {
          removeSelected();
          e.preventDefault();
        }
        return;
      }
      if (key === "escape") {
        if (selectedIdsRef.current.length > 0) {
          setSelectedIds([]);
          e.preventDefault();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [artboard, copySelected, pasteFromClipboard, removeSelected, selectAll, duplicateSelectedInPlace]);

  return (
    <div className="p-6 text-zinc-100">
      {/* <Heading

        icon={FiFileText}
        title="Page"
        description="Create a page at any size, drop images onto the artboard, and arrange them freely. The document is a JSON model of an artboard and layered elements with position and size."
      /> */}

      <Editor
        artboard={artboard}
        setArtboard={setArtboard}
        elements={elements}
        selectedIds={selectedIds}
        setSelectedIds={setSelectedIds}
        addImagesFromFiles={addImagesFromFiles}
        updateElement={updateElement}
        updateElements={updateElements}
        updateSelected={updateSelected}
        removeElement={removeElement}
        removeSelected={removeSelected}
        reorderLayer={reorderLayer}
        duplicateSelectedInPlace={duplicateSelectedInPlace}
        snapEnabled={snapEnabled}
        setSnapEnabled={setSnapEnabled}
        alignAndCenter={alignAndCenter}
        onReset={handleResetAll}
        onDownloadPdf={handleDownloadPdf}
        isExporting={isExporting}
      />
    </div>
  );
}

function Editor({
  artboard,
  setArtboard,
  elements,
  selectedIds,
  setSelectedIds,
  addImagesFromFiles,
  updateElement,
  updateElements,
  updateSelected,
  removeElement,
  removeSelected,
  reorderLayer,
  duplicateSelectedInPlace,
  snapEnabled,
  setSnapEnabled,
  alignAndCenter,
  onReset,
  onDownloadPdf,
  isExporting,
}) {
  const sortedByLayer = useMemo(
    () => [...elements].sort((a, b) => a.layer - b.layer),
    [elements]
  );

  const onDrop = useCallback(
    (accepted) => {
      if (accepted && accepted.length > 0) addImagesFromFiles(accepted);
    },
    [addImagesFromFiles]
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp", ".gif"] },
    noClick: true,
    onDrop,
  });

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedElements = useMemo(
    () => elements.filter((el) => selectedSet.has(el.id)),
    [elements, selectedSet]
  );
  const singleSelected = selectedElements.length === 1 ? selectedElements[0] : null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-zinc-700 bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 p-6 shadow-xl shadow-black/30 sm:p-8">
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-500/5 to-indigo-500/5"
        aria-hidden
      />
      <div className="relative z-10 grid grid-cols-1 gap-8 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="space-y-6">
          <div className="space-y-2">
            <button
              type="button"
              onClick={onDownloadPdf}
              disabled={isExporting || elements.length === 0}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-500 px-3 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 ring-1 ring-white/10 transition hover:from-blue-400 hover:to-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isExporting ? (
                <>
                  <FiLoader className="h-4 w-4 animate-spin" />
                  Generating PDF…
                </>
              ) : (
                <>
                  <FiDownload className="h-4 w-4" />
                  Download PDF · 300 DPI
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onReset}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-200 ring-1 ring-zinc-700 hover:bg-zinc-700"
            >
              <FiRotateCw className="h-3.5 w-3.5" />
              Reset
            </button>
          </div>

          <section>
            <SectionTitle icon={FiFileText}>Artboard</SectionTitle>
            <div className="rounded-lg border border-zinc-700 bg-zinc-950/60 p-3 text-xs text-zinc-400">
              <p className="font-semibold text-zinc-200">{artboard.name}</p>
              <p className="mt-0.5">
                {artboard.width} × {artboard.height} {artboard.unit}
              </p>
            </div>
            <label className="mt-3 block text-[11px] font-medium text-zinc-400">
              Preset
              <select
                value={findPresetKey(artboard.width, artboard.height)}
                onChange={(e) => {
                  const preset = ARTBOARD_PRESETS.find((p) => p.key === e.target.value);
                  if (preset) {
                    setArtboard({ ...artboard, width: preset.width, height: preset.height });
                  }
                }}
                className={`${inputClass} mt-1 py-1.5 text-xs font-medium`}
              >
                <option value="">Custom</option>
                {ARTBOARD_PRESETS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-[11px] font-medium text-zinc-400">
                Width
                <input
                  type="number"
                  min={MIN_MM}
                  max={MAX_MM}
                  value={artboard.width}
                  onChange={(e) => {
                    const v = clamp(Number(e.target.value) || MIN_MM, MIN_MM, MAX_MM);
                    setArtboard({ ...artboard, width: v });
                  }}
                  className={`${inputClass} mt-1 py-1.5 text-xs`}
                />
              </label>
              <label className="text-[11px] font-medium text-zinc-400">
                Height
                <input
                  type="number"
                  min={MIN_MM}
                  max={MAX_MM}
                  value={artboard.height}
                  onChange={(e) => {
                    const v = clamp(Number(e.target.value) || MIN_MM, MIN_MM, MAX_MM);
                    setArtboard({ ...artboard, height: v });
                  }}
                  className={`${inputClass} mt-1 py-1.5 text-xs`}
                />
              </label>
            </div>
            <button
              type="button"
              onClick={() => setArtboard({ ...artboard, width: artboard.height, height: artboard.width })}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-[11px] font-medium text-zinc-200 hover:bg-zinc-800"
            >
              <FiRotateCw className="h-3 w-3" />
              Swap W / H
            </button>
          </section>

          {singleSelected ? (
            <ElementProperties
              element={singleSelected}
              onChange={(patch) => updateElement(singleSelected.id, patch)}
              onReorder={(direction) => reorderLayer(singleSelected.id, direction)}
              onDelete={() => removeElement(singleSelected.id)}
            />
          ) : selectedElements.length > 1 ? (
            <MultiSelectionPanel
              count={selectedElements.length}
              allCutLineOn={selectedElements.every((el) => el.cutLine)}
              onToggleCutLine={() => {
                const allOn = selectedElements.every((el) => el.cutLine);
                updateSelected({ cutLine: !allOn });
              }}
              onDuplicate={duplicateSelectedInPlace}
              onDelete={removeSelected}
            />
          ) : null}
        </aside>

        <div className="space-y-3">
          <StageToolbar
            snapEnabled={snapEnabled}
            setSnapEnabled={setSnapEnabled}
            alignAndCenter={alignAndCenter}
            canAlign={elements.length > 0}
            selectionCount={selectedElements.length}
            totalCount={elements.length}
          />
          <div
            {...getRootProps({
              className: `relative rounded-xl outline-none transition-shadow ${
                isDragActive ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-zinc-950" : ""
              }`,
            })}
          >
            <input {...getInputProps()} aria-label="Drop images onto artboard" />
            <ArtboardStage
              artboard={artboard}
              elements={sortedByLayer}
              selectedIds={selectedIds}
              setSelectedIds={setSelectedIds}
              updateElement={updateElement}
              updateElements={updateElements}
              duplicateSelectedInPlace={duplicateSelectedInPlace}
              snapEnabled={snapEnabled}
            />
            {elements.length === 0 && !isDragActive ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <button
                  type="button"
                  onClick={open}
                  className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-zinc-600 bg-zinc-900/90 px-4 py-2 text-sm font-medium text-zinc-200 shadow-lg hover:bg-zinc-800"
                >
                  <FiPlus className="h-4 w-4" />
                  Add an image to start
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function StageToolbar({ snapEnabled, setSnapEnabled, alignAndCenter, canAlign, selectionCount, totalCount }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={alignAndCenter}
          disabled={!canAlign}
          title="Distribute all elements with equal spacing and center them on the artboard"
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition-colors ${
            canAlign
              ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white ring-white/10 shadow-md shadow-purple-900/30 hover:from-purple-400 hover:to-pink-500"
              : "cursor-not-allowed bg-zinc-800 text-zinc-500 ring-zinc-700"
          }`}
        >
          <FiAlignCenter className="h-3.5 w-3.5" />
          Align and center
        </button>
        {totalCount > 0 ? (
          <span className="text-[11px] font-medium text-zinc-400">
            {selectionCount > 0 ? (
              <>
                <span className="text-zinc-200">{selectionCount}</span>
                {" / "}
                {totalCount} selected
              </>
            ) : (
              <>{totalCount} on page · drag to marquee-select</>
            )}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => setSnapEnabled((v) => !v)}
        aria-pressed={snapEnabled}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition-colors ${
          snapEnabled
            ? "bg-blue-500/20 text-blue-200 ring-blue-500/40 hover:bg-blue-500/30"
            : "bg-zinc-800 text-zinc-300 ring-zinc-700 hover:bg-zinc-700"
        }`}
      >
        <FiCrosshair className="h-3.5 w-3.5" />
        Snap {snapEnabled ? "on" : "off"}
      </button>
    </div>
  );
}

function SectionTitle({ icon: Icon, children }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span
        className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20"
        aria-hidden
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={2} />
      </span>
      <h2 className="text-[11px] font-bold uppercase tracking-wide text-zinc-300">{children}</h2>
    </div>
  );
}

function ElementProperties({ element, onChange, onReorder, onDelete }) {
  return (
    <section>
      <SectionTitle icon={FiImage}>Selected</SectionTitle>
      <div className="space-y-3 rounded-lg border border-zinc-700 bg-zinc-950/60 p-3">
        <div className="grid grid-cols-2 gap-2">
          <NumField label="X (mm)" value={element.x} onChange={(v) => onChange({ x: v })} />
          <NumField label="Y (mm)" value={element.y} onChange={(v) => onChange({ y: v })} />
          <NumField
            label="Width (mm)"
            value={element.width}
            min={1}
            onChange={(v) => onChange({ width: Math.max(1, v) })}
          />
          <NumField
            label="Height (mm)"
            value={element.height}
            min={1}
            onChange={(v) => onChange({ height: Math.max(1, v) })}
          />
        </div>

        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Position · Layer {element.layer}
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onReorder("up")}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-[11px] font-medium text-zinc-200 hover:bg-zinc-800"
              title="Bring forward"
            >
              <FiChevronUp className="h-3.5 w-3.5" />
              Forward
            </button>
            <button
              type="button"
              onClick={() => onReorder("down")}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-[11px] font-medium text-zinc-200 hover:bg-zinc-800"
              title="Send backward"
            >
              <FiChevronDown className="h-3.5 w-3.5" />
              Backward
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center justify-center gap-1 rounded-md border border-red-500/30 bg-red-950/30 px-2 py-1.5 text-[11px] font-medium text-red-200 hover:bg-red-500/20"
              title="Delete (Del / Backspace)"
              aria-label="Delete element"
            >
              <FiTrash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onChange({ cutLine: !element.cutLine })}
          aria-pressed={!!element.cutLine}
          title="Toggle 0.5pt cutting line"
          className={`inline-flex w-full items-center justify-between gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-medium transition ${
            element.cutLine
              ? "border-pink-500/50 bg-pink-500/15 text-pink-200 hover:bg-pink-500/25"
              : "border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
          }`}
        >
          <span className="inline-flex items-center gap-1.5">
            <FiScissors className="h-3.5 w-3.5" />
            Cutting line · 0.5pt
          </span>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              element.cutLine
                ? "bg-pink-500/30 text-pink-100"
                : "bg-zinc-800 text-zinc-400"
            }`}
          >
            {element.cutLine ? "On" : "Off"}
          </span>
        </button>
      </div>
    </section>
  );
}

function MultiSelectionPanel({ count, allCutLineOn, onToggleCutLine, onDuplicate, onDelete }) {
  return (
    <section>
      <SectionTitle icon={FiLayers}>Selected · {count}</SectionTitle>
      <div className="space-y-2 rounded-lg border border-zinc-700 bg-zinc-950/60 p-3">
        <p className="text-[11px] leading-relaxed text-zinc-400">
          Drag any selected item to move the group. Shift-click to toggle, Esc to clear,
          Ctrl/Cmd+A to select all.
        </p>
        <button
          type="button"
          onClick={onToggleCutLine}
          aria-pressed={allCutLineOn}
          className={`inline-flex w-full items-center justify-between gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-medium transition ${
            allCutLineOn
              ? "border-pink-500/50 bg-pink-500/15 text-pink-200 hover:bg-pink-500/25"
              : "border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
          }`}
        >
          <span className="inline-flex items-center gap-1.5">
            <FiScissors className="h-3.5 w-3.5" />
            Cutting line · 0.5pt
          </span>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              allCutLineOn ? "bg-pink-500/30 text-pink-100" : "bg-zinc-800 text-zinc-400"
            }`}
          >
            {allCutLineOn ? "On" : "Off"}
          </span>
        </button>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onDuplicate}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-[11px] font-medium text-zinc-200 hover:bg-zinc-800"
            title="Duplicate selection (Ctrl/Cmd+D)"
          >
            <FiCopy className="h-3.5 w-3.5" />
            Duplicate
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center justify-center gap-1 rounded-md border border-red-500/30 bg-red-950/30 px-2 py-1.5 text-[11px] font-medium text-red-200 hover:bg-red-500/20"
            title="Delete selection (Del / Backspace)"
            aria-label="Delete selection"
          >
            <FiTrash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
}

function NumField({ label, value, onChange, min }) {
  return (
    <label className="text-[11px] font-medium text-zinc-400">
      {label}
      <input
        type="number"
        min={min}
        value={Math.round(value * 100) / 100}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
        className={`${inputClass} mt-1 py-1.5 text-xs`}
      />
    </label>
  );
}

/**
 * Collect snap targets along each axis from the artboard and all non-dragging
 * elements. Each axis contributes {start, middle, end}.
 */
function collectSnapTargets(artboard, others) {
  const xs = [0, artboard.width / 2, artboard.width];
  const ys = [0, artboard.height / 2, artboard.height];
  for (const el of others) {
    xs.push(el.x, el.x + el.width / 2, el.x + el.width);
    ys.push(el.y, el.y + el.height / 2, el.y + el.height);
  }
  return { xs, ys };
}

/**
 * Resolve snapping for a proposed box. Returns the snapped box plus the
 * target lines (mm) to render as guides.
 */
function applySnap(box, mode, artboard, others, thresholdMm) {
  const { xs: targetsX, ys: targetsY } = collectSnapTargets(artboard, others);
  const result = { ...box };
  const guides = { xs: [], ys: [] };

  const pickBest = (candidates, targets) => {
    let best = null;
    for (const cand of candidates) {
      for (const t of targets) {
        const d = Math.abs(cand.value - t);
        if (d <= thresholdMm && (!best || d < best.d)) {
          best = { d, target: t, cand };
        }
      }
    }
    return best;
  };

  if (mode === "move") {
    const candX = [
      { offset: 0, value: box.x },
      { offset: box.width / 2, value: box.x + box.width / 2 },
      { offset: box.width, value: box.x + box.width },
    ];
    const candY = [
      { offset: 0, value: box.y },
      { offset: box.height / 2, value: box.y + box.height / 2 },
      { offset: box.height, value: box.y + box.height },
    ];
    const bestX = pickBest(candX, targetsX);
    if (bestX) {
      result.x = bestX.target - bestX.cand.offset;
      guides.xs.push(bestX.target);
    }
    const bestY = pickBest(candY, targetsY);
    if (bestY) {
      result.y = bestY.target - bestY.cand.offset;
      guides.ys.push(bestY.target);
    }
  } else if (mode === "resize-se") {
    // Only right and bottom edges move with the SE handle.
    const candX = [{ offset: 0, value: box.x + box.width }];
    const candY = [{ offset: 0, value: box.y + box.height }];
    const bestX = pickBest(candX, targetsX);
    if (bestX) {
      result.width = Math.max(5, bestX.target - box.x);
      guides.xs.push(bestX.target);
    }
    const bestY = pickBest(candY, targetsY);
    if (bestY) {
      result.height = Math.max(5, bestY.target - box.y);
      guides.ys.push(bestY.target);
    }
  }

  return { box: result, guides };
}

function ArtboardStage({
  artboard,
  elements,
  selectedIds,
  setSelectedIds,
  updateElement,
  updateElements,
  duplicateSelectedInPlace,
  snapEnabled,
}) {
  const containerRef = useRef(null);
  const boardRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [guides, setGuides] = useState({ xs: [], ys: [] });
  const [marquee, setMarquee] = useState(null); // { x, y, w, h } in mm, during marquee drag

  // Snapshot captured at the start of a drag: origin positions for every
  // element we're dragging plus the drag mode. While dragging we compute
  // new positions from these origins + pointer delta so the result is
  // frame-rate independent.
  const dragOriginsRef = useRef(null);
  // { startX, startY, baseSelection, additive } while marquee-selecting
  const marqueeStateRef = useRef(null);

  // Refs that stay current without re-binding the pointer handlers.
  const elementsRef = useRef(elements);
  elementsRef.current = elements;
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const snapEnabledRef = useRef(snapEnabled);
  snapEnabledRef.current = snapEnabled;
  const artboardRef = useRef(artboard);
  artboardRef.current = artboard;

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      const padding = 32;
      const maxW = Math.max(100, rect.width - padding);
      const maxH = Math.max(100, (typeof window !== "undefined" ? window.innerHeight : 800) * 0.7);
      const s = Math.min(maxW / artboard.width, maxH / artboard.height);
      setScale(Number.isFinite(s) && s > 0 ? s : 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [artboard.width, artboard.height]);

  const boardPxW = artboard.width * scale;
  const boardPxH = artboard.height * scale;

  // Called by each ElementView at pointerdown. Updates the selection based on
  // modifier keys, handles Alt-duplicate, and snapshots origins for the drag.
  // Returns true if the caller should begin a drag.
  const beginElementDrag = useCallback(
    (id, e, mode) => {
      const shift = e.shiftKey;
      const mod = e.metaKey || e.ctrlKey;
      const current = selectedIdsRef.current;
      const inSel = current.includes(id);

      let nextSelection;
      if (mode === "resize-se") {
        // Resize focuses a single element and replaces the selection so that
        // subsequent moves don't surprise the user with group drag.
        nextSelection = [id];
      } else if (shift || mod) {
        // Toggle in/out of the selection.
        nextSelection = inSel ? current.filter((x) => x !== id) : [...current, id];
      } else if (inSel) {
        nextSelection = current; // keep group, we're about to drag it
      } else {
        nextSelection = [id];
      }
      if (nextSelection !== current) setSelectedIds(nextSelection);

      // If the user shift-clicked to toggle off this element, don't start a
      // drag — the pointer-up after a simple selection gesture shouldn't move
      // anything.
      if ((shift || mod) && !nextSelection.includes(id)) {
        return false;
      }

      // Alt duplicates every currently-selected element in place before the
      // drag, so the clones stay behind while the originals are dragged.
      if (e.altKey && mode === "move") {
        duplicateSelectedInPlace();
      }

      const idsToDrag = mode === "resize-se" ? [id] : nextSelection;
      const idSet = new Set(idsToDrag);
      const origins = {};
      for (const el of elementsRef.current) {
        if (idSet.has(el.id)) {
          origins[el.id] = { x: el.x, y: el.y, width: el.width, height: el.height };
        }
      }
      dragOriginsRef.current = { ids: idsToDrag, origins, primaryId: id, mode };
      return true;
    },
    [duplicateSelectedInPlace, setSelectedIds]
  );

  const updateElementRef = useRef(updateElement);
  updateElementRef.current = updateElement;
  const updateElementsRef = useRef(updateElements);
  updateElementsRef.current = updateElements;

  const handleDragMoveDelta = useCallback((id, dxMm, dyMm, mode) => {
    const d = dragOriginsRef.current;
    if (!d) return;
    const board = artboardRef.current;

    if (mode === "resize-se") {
      const origin = d.origins[id];
      if (!origin) return;
      let box = {
        x: origin.x,
        y: origin.y,
        width: origin.width + dxMm,
        height: origin.height + dyMm,
      };
      box.width = clamp(box.width, 5, Math.max(5, board.width - box.x));
      box.height = clamp(box.height, 5, Math.max(5, board.height - box.y));

      if (snapEnabledRef.current) {
        const others = elementsRef.current.filter((el) => el.id !== id);
        const thresholdMm = SNAP_THRESHOLD_PX / Math.max(scaleRef.current, 0.001);
        const res = applySnap(box, "resize-se", board, others, thresholdMm);
        setGuides(res.guides);
        updateElementRef.current(id, { width: res.box.width, height: res.box.height });
      } else {
        setGuides({ xs: [], ys: [] });
        updateElementRef.current(id, { width: box.width, height: box.height });
      }
      return;
    }

    // move — possibly a group drag
    const { ids, origins, primaryId } = d;

    // Clamp the delta so no element leaves the artboard.
    let cdx = dxMm;
    let cdy = dyMm;
    for (const aid of ids) {
      const o = origins[aid];
      cdx = Math.max(cdx, -o.x);
      cdx = Math.min(cdx, board.width - o.x - o.width);
      cdy = Math.max(cdy, -o.y);
      cdy = Math.min(cdy, board.height - o.y - o.height);
    }

    // Snap using the primary (grabbed) element's bounds; others follow by
    // the same delta. Re-clamp afterwards to keep everything in bounds even
    // if snap tries to push the group slightly past an edge.
    let guideLines = { xs: [], ys: [] };
    if (snapEnabledRef.current) {
      const prim = origins[primaryId];
      if (prim) {
        const proposed = {
          x: prim.x + cdx,
          y: prim.y + cdy,
          width: prim.width,
          height: prim.height,
        };
        const idSet = new Set(ids);
        const others = elementsRef.current.filter((el) => !idSet.has(el.id));
        const thresholdMm = SNAP_THRESHOLD_PX / Math.max(scaleRef.current, 0.001);
        const res = applySnap(proposed, "move", board, others, thresholdMm);
        guideLines = res.guides;
        cdx = res.box.x - prim.x;
        cdy = res.box.y - prim.y;
        for (const aid of ids) {
          const o = origins[aid];
          cdx = Math.max(cdx, -o.x);
          cdx = Math.min(cdx, board.width - o.x - o.width);
          cdy = Math.max(cdy, -o.y);
          cdy = Math.min(cdy, board.height - o.y - o.height);
        }
      }
    }
    setGuides(guideLines);

    const updates = {};
    for (const aid of ids) {
      const o = origins[aid];
      updates[aid] = { x: o.x + cdx, y: o.y + cdy };
    }
    updateElementsRef.current(updates);
  }, []);

  const handleDragEnd = useCallback(() => {
    dragOriginsRef.current = null;
    setGuides({ xs: [], ys: [] });
  }, []);

  // ---- Marquee selection on the empty board area ----
  const pointToMm = useCallback((clientX, clientY) => {
    const node = boardRef.current;
    if (!node) return { x: 0, y: 0 };
    const rect = node.getBoundingClientRect();
    const s = scaleRef.current;
    return {
      x: clamp((clientX - rect.left) / s, 0, artboardRef.current.width),
      y: clamp((clientY - rect.top) / s, 0, artboardRef.current.height),
    };
  }, []);

  const onBoardPointerDown = useCallback(
    (e) => {
      // Only start a marquee when clicking on the board itself (the white
      // background), not on an element.
      if (e.target !== e.currentTarget) return;
      if (e.button !== 0) return;
      const additive = e.shiftKey || e.metaKey || e.ctrlKey;
      if (!additive) setSelectedIds([]);
      const { x, y } = pointToMm(e.clientX, e.clientY);
      marqueeStateRef.current = {
        startX: x,
        startY: y,
        additive,
        baseSelection: additive ? [...selectedIdsRef.current] : [],
      };
      setMarquee({ x, y, w: 0, h: 0 });
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore capture errors (e.g. on non-primary pointers)
      }
    },
    [pointToMm, setSelectedIds]
  );

  const onBoardPointerMove = useCallback(
    (e) => {
      const m = marqueeStateRef.current;
      if (!m) return;
      const { x: cx, y: cy } = pointToMm(e.clientX, e.clientY);
      const x = Math.min(m.startX, cx);
      const y = Math.min(m.startY, cy);
      const w = Math.abs(cx - m.startX);
      const h = Math.abs(cy - m.startY);
      setMarquee({ x, y, w, h });
      // Live-update selection: any element that intersects the marquee
      // rectangle is considered hit.
      const hit = [];
      for (const el of elementsRef.current) {
        const intersects = !(
          el.x + el.width < x ||
          el.x > x + w ||
          el.y + el.height < y ||
          el.y > y + h
        );
        if (intersects) hit.push(el.id);
      }
      if (m.additive) {
        const combined = new Set(m.baseSelection);
        for (const id of hit) combined.add(id);
        setSelectedIds(Array.from(combined));
      } else {
        setSelectedIds(hit);
      }
    },
    [pointToMm, setSelectedIds]
  );

  const onBoardPointerUp = useCallback((e) => {
    if (!marqueeStateRef.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    marqueeStateRef.current = null;
    setMarquee(null);
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex min-h-[60vh] w-full items-center justify-center rounded-xl border border-zinc-700 bg-zinc-950/60 p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) setSelectedIds([]);
      }}
    >
      <div
        ref={boardRef}
        className="relative shadow-2xl shadow-black/40"
        style={{ width: boardPxW, height: boardPxH, background: "white", touchAction: "none" }}
        onPointerDown={onBoardPointerDown}
        onPointerMove={onBoardPointerMove}
        onPointerUp={onBoardPointerUp}
        onPointerCancel={onBoardPointerUp}
      >
        {elements.map((el) => (
          <ElementView
            key={el.id}
            element={el}
            scale={scale}
            isSelected={selectedIds.includes(el.id)}
            beginElementDrag={beginElementDrag}
            onDragMove={handleDragMoveDelta}
            onDragEnd={handleDragEnd}
            canShowResizeHandle={selectedIds.length === 1 && selectedIds[0] === el.id}
          />
        ))}
        <SnapGuides guides={guides} scale={scale} boardPxW={boardPxW} boardPxH={boardPxH} />
        {marquee ? <MarqueeOverlay marquee={marquee} scale={scale} /> : null}
      </div>
    </div>
  );
}

function MarqueeOverlay({ marquee, scale }) {
  return (
    <div
      className="pointer-events-none absolute"
      aria-hidden
      style={{
        left: marquee.x * scale,
        top: marquee.y * scale,
        width: marquee.w * scale,
        height: marquee.h * scale,
        background: "rgba(59,130,246,0.1)",
        border: "1px solid rgb(59 130 246)",
      }}
    />
  );
}

function SnapGuides({ guides, scale, boardPxW, boardPxH }) {
  if (guides.xs.length === 0 && guides.ys.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {guides.xs.map((mm, i) => (
        <div
          key={`x-${i}-${mm}`}
          style={{
            position: "absolute",
            left: mm * scale,
            top: 0,
            width: 1,
            height: boardPxH,
            background: "rgb(236 72 153)",
            boxShadow: "0 0 0 0.5px rgba(236,72,153,0.5)",
          }}
        />
      ))}
      {guides.ys.map((mm, i) => (
        <div
          key={`y-${i}-${mm}`}
          style={{
            position: "absolute",
            top: mm * scale,
            left: 0,
            height: 1,
            width: boardPxW,
            background: "rgb(236 72 153)",
            boxShadow: "0 0 0 0.5px rgba(236,72,153,0.5)",
          }}
        />
      ))}
    </div>
  );
}

function ElementView({
  element,
  scale,
  isSelected,
  beginElementDrag,
  onDragMove,
  onDragEnd,
  canShowResizeHandle,
}) {
  const ref = useRef(null);
  // dragState carries data only needed by this element's pointer handlers
  // (pointer id + start coordinates). Group state lives in the parent.
  const dragState = useRef(null);

  const onPointerDownMove = (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const started = beginElementDrag(element.id, e, "move");
    if (!started) return;
    try {
      ref.current?.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    dragState.current = {
      mode: "move",
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
      pointerNode: ref.current,
    };
  };

  const onPointerDownResize = (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const started = beginElementDrag(element.id, e, "resize-se");
    if (!started) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    dragState.current = {
      mode: "resize-se",
      startX: e.clientX,
      startY: e.clientY,
      pointerNode: e.currentTarget,
      pointerId: e.pointerId,
    };
  };

  const onPointerMove = (e) => {
    const s = dragState.current;
    if (!s) return;
    const dxMm = (e.clientX - s.startX) / scale;
    const dyMm = (e.clientY - s.startY) / scale;
    onDragMove(element.id, dxMm, dyMm, s.mode);
  };

  const endDrag = (e) => {
    const s = dragState.current;
    if (!s) return;
    try {
      s.pointerNode?.releasePointerCapture(s.pointerId ?? e.pointerId);
    } catch {
      // ignore release errors
    }
    dragState.current = null;
    onDragEnd?.();
  };

  const leftPx = element.x * scale;
  const topPx = element.y * scale;
  const widthPx = element.width * scale;
  const heightPx = element.height * scale;

  const outline = isSelected
    ? "2px solid rgb(59 130 246)"
    : "1px solid rgba(0,0,0,0.08)";

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      onPointerDown={onPointerDownMove}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{
        position: "absolute",
        left: leftPx,
        top: topPx,
        width: widthPx,
        height: heightPx,
        zIndex: element.layer + 1,
        touchAction: "none",
        cursor: "move",
        outline,
        background: "transparent",
      }}
    >
      {element.type === "image" ? (
        <img
          src={element.src}
          alt={element.name}
          draggable={false}
          style={{ width: "100%", height: "100%", objectFit: "fill", display: "block", pointerEvents: "none" }}
        />
      ) : null}
      {element.cutLine ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            border: "1px dashed #ec4899",
            pointerEvents: "none",
          }}
        />
      ) : null}
      {isSelected && canShowResizeHandle ? (
        <span
          onPointerDown={onPointerDownResize}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{
            position: "absolute",
            right: -6,
            bottom: -6,
            width: 12,
            height: 12,
            background: "rgb(59 130 246)",
            border: "2px solid white",
            borderRadius: 3,
            cursor: "nwse-resize",
            touchAction: "none",
          }}
          aria-label="Resize"
        />
      ) : null}
    </div>
  );
}
