"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import CanvasWrapWorkspace from "@/app/components/CanvasWrapWorkspace";
import { useDropzone } from "react-dropzone";
import {
  FiBox,
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
  FiPrinter,
  FiScissors,
  FiCopy,
  FiClipboard,
  FiLayers,
  FiCreditCard,
  FiGrid,
  FiArrowLeft,
  FiSliders,
  FiX,
  FiLock,
  FiUnlock,
  FiMaximize2,
  FiHexagon,
} from "react-icons/fi";
import { FaGithub } from "react-icons/fa6";
import ThemeToggle from "@/app/components/ThemeToggle";
import { inputClass } from "@/app/lib/uiClasses";
import { generatePagePDF, downloadPdfBytes } from "@/app/lib/pdf";
import { generatePagePNG, downloadBlob } from "@/app/lib/page/renderPage";
import {
  readInitialEditorState,
  savePersistedState,
  clearPersistedState,
  DEFAULT_CANVAS_WRAP,
  DEFAULT_VIEWPORT,
  restoreCanvasWrapFiles,
  hydratePersistedImages,
} from "@/app/lib/page/persistState";
import {
  cloneEditorDocument,
  MAX_UNDO_HISTORY,
  sanitizeSelection,
} from "@/app/lib/page/editorHistory";
import {
  createElementFromLibraryItem,
  createLibraryItemFromFile,
  isSrcInUse,
} from "@/app/lib/page/imageLibrary";
import { SHAPE_CATALOG, createShapeElement } from "@/app/lib/page/shapes";

/**
 * Document shape (source of truth for the tool):
 *
 * {
 *   artboard: { name: string, width: number, height: number, unit: "mm" },
 *   elements: Array<
 *     | {
 *         id: string,
 *         type: "image",
 *         src: string,           // object URL (may be shared across duplicates/paste)
 *         libraryId?: string,    // link to a persisted library item
 *         name: string,
 *         naturalWidth: number,  // px
 *         naturalHeight: number, // px
 *         x: number,             // mm, top-left corner on artboard
 *         y: number,             // mm
 *         width: number,         // mm
 *         height: number,        // mm
 *         layer: number,         // stacking order; higher renders on top
 *         cutLine?: boolean,     // when true, a 0.5pt cutting line is stroked around the element
 *         lockAspectRatio?: boolean, // when true, resize and size fields keep width:height fixed
 *       }
 *     | {
 *         id: string,
 *         type: "shape",
 *         shapeKind: "rectangle" | "ellipse" | "line",
 *         name: string,
 *         x: number,
 *         y: number,
 *         width: number,
 *         height: number,
 *         layer: number,
 *         fill: string,
 *         stroke: string,
 *         strokeWidth: number,   // mm
 *         cutLine?: boolean,
 *         lockAspectRatio?: boolean,
 *       }
 *   >
 * }
 *
 * Selection is a list of ids (selectedIds). All drag / copy / delete /
 * duplicate actions operate on the full list.
 */

const MIN_MM = 20;
const MAX_MM = 3000;
const SNAP_THRESHOLD_PX = 6;
const PASTE_OFFSET_MM = 10;
const LIBRARY_DRAG_MIME = "application/x-dropio-library-id";

const ARTBOARD_PRESETS = [
  { key: "A4P", label: "A4 Portrait · 210×297mm", width: 210, height: 297 },
  { key: "A4L", label: "A4 Landscape · 297×210mm", width: 297, height: 210 },
  { key: "A3P", label: "A3 Portrait · 297×420mm", width: 297, height: 420 },
  { key: "A3L", label: "A3 Landscape · 420×297mm", width: 420, height: 297 },
  { key: "A2P", label: "A2 Portrait · 420×594mm", width: 420, height: 594 },
  { key: "A2L", label: "A2 Landscape · 594×420mm", width: 594, height: 420 }
];

const DEFAULT_ARTBOARD = {
  name: "Magic",
  width: 210,
  height: 297,
  unit: "mm",
  background: "transparent",
};

const BUSINESS_CARD_SHEETS = {
  A4: { width: 210, height: 297, cols: 2, rows: 5 },
  A3: { width: 297, height: 420, cols: 3, rows: 8 },
};

const BUSINESS_CARD = { width: 90, height: 50, spacing: 1 };
const DEFAULT_GITHUB_REPO = "https://github.com/christiaan-fourie/dropio";

function githubRepoUrl() {
  const raw = process.env.NEXT_PUBLIC_GITHUB_REPO_URL?.trim();
  if (!raw) return DEFAULT_GITHUB_REPO;
  return raw.replace(/\/$/, "").replace(/\.git$/, "");
}

function findPresetKey(width, height) {
  const match = ARTBOARD_PRESETS.find((p) => p.width === width && p.height === height);
  return match ? match.key : "";
}



function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function elementAspectRatio(element) {
  if (!element?.height) return 1;
  return element.width / element.height;
}

const N_UP_COUNTS = [1, 2, 3, 4, 6, 8, 9, 12];

function layoutSourceElement(elements, selectedIds) {
  return elements.find((el) => selectedIds.includes(el.id)) || elements[0] || null;
}

/** Pick rows×cols that best matches artboard aspect for `count` copies. */
function bestGridForCount(count, boardWidth, boardHeight) {
  const boardAspect = boardWidth / boardHeight;
  let best = { rows: 1, cols: count, score: Infinity };
  for (let rows = 1; rows <= count; rows++) {
    const cols = Math.ceil(count / rows);
    const gridAspect = cols / rows;
    const aspectDiff = Math.abs(gridAspect - boardAspect);
    const waste = rows * cols - count;
    const score = waste * 100 + aspectDiff;
    if (score < best.score) best = { rows, cols, score };
  }
  return { rows: best.rows, cols: best.cols };
}

function fitInCell(cellW, cellH, element, lockAspect) {
  if (!lockAspect) {
    return { width: cellW, height: cellH };
  }
  const ratio = elementAspectRatio(element);
  let width = cellW;
  let height = width / ratio;
  if (height > cellH) {
    height = cellH;
    width = height * ratio;
  }
  return { width, height };
}

function sortElementsReadingOrder(elements) {
  if (elements.length <= 1) return [...elements];
  const maxH = Math.max(...elements.map((e) => e.height));
  const band = Math.max(1, maxH / 2);
  return [...elements].sort((a, b) => {
    const ay = Math.round(a.y / band);
    const by = Math.round(b.y / band);
    if (ay !== by) return ay - by;
    return a.x - b.x;
  });
}

function resizeBoxWithLockedAspect(origin, dxMm, dyMm) {
  const ratio = origin.width / origin.height || 1;
  const scaleX = (origin.width + dxMm) / origin.width;
  const scaleY = (origin.height + dyMm) / origin.height;
  const scale = Math.max(scaleX, scaleY, 5 / origin.width, 5 / origin.height);
  let width = origin.width * scale;
  let height = origin.height * scale;
  width = Math.max(5, width);
  height = Math.max(5, height);
  height = width / ratio;
  if (height < 5) {
    height = 5;
    width = height * ratio;
  }
  width = Math.max(5, width);
  height = Math.max(5, height);
  return { width, height };
}

function resizeBoxLockedFromAnchor(origin, dxMm, dyMm, mode) {
  const ratio = origin.width / origin.height || 1;
  const minSize = 5;

  let anchorX;
  let anchorY;
  let dragX;
  let dragY;
  if (mode === "resize-se") {
    anchorX = origin.x;
    anchorY = origin.y;
    dragX = origin.x + origin.width + dxMm;
    dragY = origin.y + origin.height + dyMm;
  } else if (mode === "resize-nw") {
    anchorX = origin.x + origin.width;
    anchorY = origin.y + origin.height;
    dragX = origin.x + dxMm;
    dragY = origin.y + dyMm;
  } else if (mode === "resize-ne") {
    anchorX = origin.x;
    anchorY = origin.y + origin.height;
    dragX = origin.x + origin.width + dxMm;
    dragY = origin.y + dyMm;
  } else if (mode === "resize-sw") {
    anchorX = origin.x + origin.width;
    anchorY = origin.y;
    dragX = origin.x + dxMm;
    dragY = origin.y + origin.height + dyMm;
  } else {
    return { x: origin.x, y: origin.y, width: origin.width, height: origin.height };
  }

  const rawW = Math.abs(dragX - anchorX);
  const rawH = Math.abs(dragY - anchorY);

  // Choose the larger implied scale so the dragged corner doesn't "lag" behind
  // one axis when aspect ratio is locked.
  let width = Math.max(minSize, rawW);
  let height = width / ratio;
  if (height < rawH) {
    height = Math.max(minSize, rawH);
    width = height * ratio;
  }

  width = Math.max(minSize, width);
  height = Math.max(minSize, height);

  if (mode === "resize-se") {
    return { x: anchorX, y: anchorY, width, height };
  }
  if (mode === "resize-nw") {
    return { x: anchorX - width, y: anchorY - height, width, height };
  }
  if (mode === "resize-ne") {
    return { x: anchorX, y: anchorY - height, width, height };
  }
  // resize-sw
  return { x: anchorX - width, y: anchorY, width, height };
}

function selectionBoundsFromOrigins(origins) {
  const values = Object.values(origins);
  if (values.length === 0) return { x: 0, y: 0, width: 5, height: 5 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const o of values) {
    minX = Math.min(minX, o.x);
    minY = Math.min(minY, o.y);
    maxX = Math.max(maxX, o.x + o.width);
    maxY = Math.max(maxY, o.y + o.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function groupResizeAnchor(oldBounds, mode) {
  if (mode === "resize-se") return { x: oldBounds.x, y: oldBounds.y };
  if (mode === "resize-nw") return { x: oldBounds.x + oldBounds.width, y: oldBounds.y + oldBounds.height };
  if (mode === "resize-ne") return { x: oldBounds.x, y: oldBounds.y + oldBounds.height };
  if (mode === "resize-sw") return { x: oldBounds.x + oldBounds.width, y: oldBounds.y };
  if (mode === "resize-e") return { x: oldBounds.x, y: oldBounds.y };
  if (mode === "resize-w") return { x: oldBounds.x + oldBounds.width, y: oldBounds.y };
  if (mode === "resize-s") return { x: oldBounds.x, y: oldBounds.y };
  if (mode === "resize-n") return { x: oldBounds.x, y: oldBounds.y + oldBounds.height };
  return { x: oldBounds.x, y: oldBounds.y };
}

function applyGroupResizeToOrigins(origins, oldBounds, newBounds, mode) {
  const scaleX = oldBounds.width > 0 ? newBounds.width / oldBounds.width : 1;
  const scaleY = oldBounds.height > 0 ? newBounds.height / oldBounds.height : 1;
  const anchor = groupResizeAnchor(oldBounds, mode);
  const updates = {};
  for (const [id, o] of Object.entries(origins)) {
    updates[id] = {
      x: anchor.x + (o.x - anchor.x) * scaleX,
      y: anchor.y + (o.y - anchor.y) * scaleY,
      width: Math.max(5, o.width * scaleX),
      height: Math.max(5, o.height * scaleY),
    };
  }
  return updates;
}

const CORNER_RESIZE_MODES = new Set(["resize-se", "resize-nw", "resize-ne", "resize-sw"]);
const EDGE_RESIZE_MODES = new Set(["resize-n", "resize-e", "resize-s", "resize-w"]);

/** Corner handles keep aspect unless Shift is held; edge handles never lock. */
function shouldLockAspectOnResize(mode, shiftKey) {
  if (EDGE_RESIZE_MODES.has(mode)) return false;
  if (shiftKey) return false;
  return CORNER_RESIZE_MODES.has(mode);
}

/** Edge resize or Shift+corner overrides proportional resize in the properties panel. */
function resizeOverridesAspectLock(mode, shiftKey) {
  if (EDGE_RESIZE_MODES.has(mode)) return true;
  return shiftKey && CORNER_RESIZE_MODES.has(mode);
}

function computeResizedBox(origin, dxMm, dyMm, mode, _board, { lockAspectRatio = false } = {}) {
  if (lockAspectRatio && CORNER_RESIZE_MODES.has(mode)) {
    return resizeBoxLockedFromAnchor(origin, dxMm, dyMm, mode);
  }
  if (mode === "resize-se") {
    return {
      x: origin.x,
      y: origin.y,
      width: Math.max(5, origin.width + dxMm),
      height: Math.max(5, origin.height + dyMm),
    };
  }
  if (mode === "resize-nw") {
    const box = {
      x: origin.x + dxMm,
      y: origin.y + dyMm,
      width: origin.width - dxMm,
      height: origin.height - dyMm,
    };
    box.x = Math.min(box.x, origin.x + origin.width - 5);
    box.y = Math.min(box.y, origin.y + origin.height - 5);
    box.width = Math.max(5, origin.x + origin.width - box.x);
    box.height = Math.max(5, origin.y + origin.height - box.y);
    return box;
  }
  if (mode === "resize-ne") {
    const box = {
      x: origin.x,
      y: origin.y + dyMm,
      width: origin.width + dxMm,
      height: origin.height - dyMm,
    };
    box.width = Math.max(5, box.width);
    box.y = Math.min(box.y, origin.y + origin.height - 5);
    box.height = Math.max(5, origin.y + origin.height - box.y);
    return box;
  }
  if (mode === "resize-sw") {
    const box = {
      x: origin.x + dxMm,
      y: origin.y,
      width: origin.width - dxMm,
      height: origin.height + dyMm,
    };
    box.x = Math.min(box.x, origin.x + origin.width - 5);
    box.width = Math.max(5, origin.x + origin.width - box.x);
    box.height = Math.max(5, box.height);
    return box;
  }
  if (mode === "resize-e") {
    return { x: origin.x, y: origin.y, width: Math.max(5, origin.width + dxMm), height: origin.height };
  }
  if (mode === "resize-w") {
    const box = { x: origin.x + dxMm, y: origin.y, width: origin.width - dxMm, height: origin.height };
    box.x = Math.min(box.x, origin.x + origin.width - 5);
    box.width = Math.max(5, origin.x + origin.width - box.x);
    return box;
  }
  if (mode === "resize-s") {
    return { x: origin.x, y: origin.y, width: origin.width, height: Math.max(5, origin.height + dyMm) };
  }
  if (mode === "resize-n") {
    const box = { x: origin.x, y: origin.y + dyMm, width: origin.width, height: origin.height - dyMm };
    box.y = Math.min(box.y, origin.y + origin.height - 5);
    box.height = Math.max(5, origin.y + origin.height - box.y);
    return box;
  }
  return { x: origin.x, y: origin.y, width: origin.width, height: origin.height };
}

function patchSizeKeepingAspect(element, patch, _board) {
  if (!element.lockAspectRatio) return patch;
  const ratio = elementAspectRatio(element);
  const next = { ...element, ...patch };
  // If the user explicitly sets both width and height while "locked", treat
  // that as intentionally breaking the ratio: disable the lock control until
  // they reset the ratio.
  if (patch.width != null && patch.height != null) {
    const nextRatio = next.width / Math.max(1e-6, next.height);
    const breaks = Math.abs(nextRatio - ratio) / Math.max(1e-6, ratio) > 0.005; // 0.5%
    if (breaks) {
      return { ...patch, lockAspectRatio: false, aspectRatioLockDisabled: true };
    }
    return patch;
  }
  if (patch.width != null && patch.height == null) {
    next.height = Math.max(5, next.width / ratio);
    next.width = Math.max(5, next.height * ratio);
  } else if (patch.height != null && patch.width == null) {
    next.width = Math.max(5, next.height * ratio);
    next.height = Math.max(5, next.width / ratio);
  }
  return { width: next.width, height: next.height };
}

function makeId() {
  return `el_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}

function imageFilesFromClipboard(clipboardData) {
  if (!clipboardData) return [];
  const fromFiles = [...clipboardData.files].filter((f) => f.type.startsWith("image/"));
  if (fromFiles.length > 0) return fromFiles;
  const fromItems = [];
  for (const item of clipboardData.items) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) fromItems.push(file);
    }
  }
  return fromItems;
}

export default function PageClient({ initialViewMode = "editor" }) {
  const [viewMode, setViewMode] = useState(() =>
    initialViewMode === "canvas-wrap" ? "canvas-wrap" : "editor"
  );
  const [artboard, setArtboard] = useState(DEFAULT_ARTBOARD);
  const [elements, setElements] = useState([]);
  const [library, setLibrary] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingPng, setIsExportingPng] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [businessSheet, setBusinessSheet] = useState("A4");
  const [layoutGap, setLayoutGap] = useState(2);
  const [layoutLockAspect, setLayoutLockAspect] = useState(true);
  const [viewport, setViewport] = useState(DEFAULT_VIEWPORT);
  const [canvasWrap, setCanvasWrap] = useState(() => ({ ...DEFAULT_CANVAS_WRAP, files: [] }));
  const [persistReady, setPersistReady] = useState(false);
  const hydratedRef = useRef(false);
  const prevArtboardSizeRef = useRef(null);

  // Refs keep imperative handlers (keyboard shortcuts, drag callbacks) in sync
  // without re-binding every render.
  const elementsRef = useRef(elements);
  elementsRef.current = elements;
  const libraryRef = useRef(library);
  libraryRef.current = library;
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const artboardRef = useRef(artboard);
  artboardRef.current = artboard;

  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const isApplyingHistoryRef = useRef(false);

  const pushUndoSnapshot = useCallback(() => {
    if (isApplyingHistoryRef.current || !persistReady) return;
    undoStackRef.current.push(
      cloneEditorDocument({
        elements: elementsRef.current,
        artboard: artboardRef.current,
        selectedIds: selectedIdsRef.current,
      })
    );
    if (undoStackRef.current.length > MAX_UNDO_HISTORY) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
  }, [persistReady]);

  const clearHistory = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
  }, []);

  const applyHistorySnapshot = useCallback((snapshot) => {
    if (!snapshot) return;
    isApplyingHistoryRef.current = true;
    setArtboard(snapshot.artboard);
    setElements(snapshot.elements);
    setSelectedIds(sanitizeSelection(snapshot.selectedIds, snapshot.elements));
    isApplyingHistoryRef.current = false;
  }, []);

  const undo = useCallback(() => {
    if (undoStackRef.current.length === 0) return false;
    redoStackRef.current.push(
      cloneEditorDocument({
        elements: elementsRef.current,
        artboard: artboardRef.current,
        selectedIds: selectedIdsRef.current,
      })
    );
    if (redoStackRef.current.length > MAX_UNDO_HISTORY) {
      redoStackRef.current.shift();
    }
    applyHistorySnapshot(undoStackRef.current.pop());
    return true;
  }, [applyHistorySnapshot]);

  const redo = useCallback(() => {
    if (redoStackRef.current.length === 0) return false;
    undoStackRef.current.push(
      cloneEditorDocument({
        elements: elementsRef.current,
        artboard: artboardRef.current,
        selectedIds: selectedIdsRef.current,
      })
    );
    if (undoStackRef.current.length > MAX_UNDO_HISTORY) {
      undoStackRef.current.shift();
    }
    applyHistorySnapshot(redoStackRef.current.pop());
    return true;
  }, [applyHistorySnapshot]);

  const updateArtboard = useCallback(
    (next) => {
      pushUndoSnapshot();
      setArtboard((prev) => (typeof next === "function" ? next(prev) : next));
    },
    [pushUndoSnapshot]
  );

  // Blob URLs can be shared across elements (duplicate / paste). We revoke
  // them only on artboard reset / unmount so a paste never lands on a dead URL.
  const blobUrlsRef = useRef(new Set());

  const revokeAllBlobs = useCallback(() => {
    blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    blobUrlsRef.current.clear();
  }, []);

  const trackBlobUrl = useCallback((url) => {
    if (typeof url === "string" && url.startsWith("blob:")) {
      blobUrlsRef.current.add(url);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const boot = readInitialEditorState(initialViewMode);
      const loadedArtboard = boot.artboard ?? DEFAULT_ARTBOARD;
      const { library: hydratedLibrary, elements: hydratedElements } = await hydratePersistedImages(
        boot.library ?? [],
        boot.elements ?? []
      );

      if (cancelled) return;

      for (const item of hydratedLibrary) {
        trackBlobUrl(item.src);
      }
      for (const el of hydratedElements) {
        trackBlobUrl(el.src);
      }

      setArtboard(loadedArtboard);
      setElements(hydratedElements);
      setLibrary(hydratedLibrary);
      setSnapEnabled(boot.snapEnabled);
      setBusinessSheet(boot.businessSheet);
      setLayoutGap(boot.layoutGap ?? boot.gridGap ?? 2);
      setLayoutLockAspect(boot.layoutLockAspect ?? true);
      setViewport(boot.viewport ?? DEFAULT_VIEWPORT);
      if (initialViewMode !== "canvas-wrap" && boot.viewMode) {
        setViewMode(boot.viewMode);
      }

      let canvasFiles = [];
      if (boot.stored?.canvasWrap?.files?.length) {
        canvasFiles = await restoreCanvasWrapFiles(boot.stored.canvasWrap.files);
      }

      if (cancelled) return;

      setCanvasWrap({ ...DEFAULT_CANVAS_WRAP, ...boot.canvasWrapMeta, files: canvasFiles });
      prevArtboardSizeRef.current = {
        width: loadedArtboard.width,
        height: loadedArtboard.height,
      };
      hydratedRef.current = true;
      setPersistReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [initialViewMode, trackBlobUrl]);

  useEffect(() => {
    if (!persistReady) return;
    clearHistory();
  }, [persistReady, clearHistory]);

  useEffect(() => {
    if (!persistReady) return;
    const timer = window.setTimeout(() => {
      savePersistedState({
        viewMode,
        artboard,
        elements,
        library,
        snapEnabled,
        businessSheet,
        layoutGap,
        layoutLockAspect,
        viewport,
        canvasWrap,
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [
    persistReady,
    viewMode,
    artboard,
    elements,
    library,
    snapEnabled,
    businessSheet,
    layoutGap,
    layoutLockAspect,
    viewport,
    canvasWrap,
  ]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (!prevArtboardSizeRef.current) {
      prevArtboardSizeRef.current = { width: artboard.width, height: artboard.height };
      return;
    }
    const prev = prevArtboardSizeRef.current;
    if (prev.width !== artboard.width || prev.height !== artboard.height) {
      setViewport(DEFAULT_VIEWPORT);
    }
    prevArtboardSizeRef.current = { width: artboard.width, height: artboard.height };
  }, [artboard.width, artboard.height]);

  useEffect(() => {
    return () => {
      revokeAllBlobs();
    };
  }, [revokeAllBlobs]);

  const handleResetAll = useCallback(() => {
    revokeAllBlobs();
    clearPersistedState();
    clearHistory();
    setElements([]);
    setLibrary([]);
    setSelectedIds([]);
    setArtboard(DEFAULT_ARTBOARD);
    setSnapEnabled(true);
    setBusinessSheet("A4");
    setGridRows(3);
    setGridCols(2);
    setGridGap(2);
    setViewport(DEFAULT_VIEWPORT);
    setCanvasWrap({ ...DEFAULT_CANVAS_WRAP, files: [] });
    setViewMode("editor");
  }, [revokeAllBlobs, clearHistory]);

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

  const handleDownloadPng = useCallback(async () => {
    if (isExportingPng) return;
    setIsExportingPng(true);
    try {
      const { blob, filename } = await generatePagePNG({
        artboard: artboardRef.current,
        elements: elementsRef.current,
      });
      downloadBlob(blob, filename);
    } catch (err) {
      console.error("Failed to generate PNG:", err);
      alert(`Could not generate PNG: ${err.message}`);
    } finally {
      setIsExportingPng(false);
    }
  }, [isExportingPng]);

  const handlePrint = useCallback(async () => {
    if (isPrinting) return;
    setIsPrinting(true);
    try {
      const board = artboardRef.current;
      const { blob } = await generatePagePNG({
        artboard: board,
        elements: elementsRef.current,
      });

      const url = window.URL.createObjectURL(blob);
      const revoke = () => {
        try {
          window.URL.revokeObjectURL(url);
        } catch {
          // no-op
        }
      };

      const wMm = board?.width ?? 210;
      const hMm = board?.height ?? 297;
      const safeTitle = (board?.name || "Dropio Print").replace(/[<>]/g, "");

      // Use an offscreen iframe to avoid popup blockers.
      const iframe = document.createElement("iframe");
      iframe.title = safeTitle;
      iframe.setAttribute("aria-hidden", "true");
      iframe.tabIndex = -1;
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.style.opacity = "0";
      iframe.style.pointerEvents = "none";

      const cleanup = () => {
        try {
          iframe.remove();
        } catch {
          // no-op
        }
        revoke();
      };

      const onMessage = (e) => {
        if (e?.data?.type === "dropio:print:done") {
          window.removeEventListener("message", onMessage);
          cleanup();
        }
      };
      window.addEventListener("message", onMessage);

      iframe.srcdoc = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${safeTitle}</title>
    <style>
      @page { size: ${wMm}mm ${hMm}mm; margin: 0; }
      html, body { margin: 0; padding: 0; height: 100%; background: #fff; }
      body { display: flex; align-items: center; justify-content: center; }
      img { width: ${wMm}mm; height: ${hMm}mm; object-fit: contain; image-rendering: auto; }
      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    </style>
  </head>
  <body>
    <img src="${url}" alt="" />
    <script>
      (function () {
        function done() {
          try { window.parent && window.parent.postMessage({ type: "dropio:print:done" }, "*"); } catch (e) {}
        }
        window.addEventListener("afterprint", function () {
          done();
        });
        window.addEventListener("load", function () {
          setTimeout(function () { window.focus(); window.print(); }, 50);
        });
      })();
    </script>
  </body>
</html>`;
      document.body.appendChild(iframe);

      // Fallback cleanup in case afterprint isn't fired.
      window.setTimeout(() => {
        window.removeEventListener("message", onMessage);
        cleanup();
      }, 60_000);
    } catch (err) {
      console.error("Failed to print:", err);
      alert(`Could not print: ${err.message}`);
    } finally {
      setIsPrinting(false);
    }
  }, [isPrinting]);

  const addToLibrary = useCallback(
    async (files) => {
      if (files.length === 0) return [];
      const additions = [];
      for (const file of files) {
        try {
          additions.push(await createLibraryItemFromFile(file, trackBlobUrl));
        } catch (err) {
          console.error(err);
        }
      }
      if (additions.length === 0) return [];
      setLibrary((prev) => [...prev, ...additions]);
      return additions;
    },
    [trackBlobUrl]
  );

  const placeLibraryItems = useCallback(
    (items, position) => {
      if (!artboardRef.current || items.length === 0) return [];
      const board = artboardRef.current;
      const placed = [];
      pushUndoSnapshot();
      setElements((prev) => {
        const base = prev.length === 0 ? 0 : Math.max(...prev.map((e) => e.layer)) + 1;
        const next = [...prev];
        items.forEach((item, index) => {
          const element = createElementFromLibraryItem(
            item,
            board,
            base + index,
            makeId,
            index === 0 ? position : undefined
          );
          placed.push(element);
          next.push(element);
        });
        return next;
      });
      if (placed.length > 0) {
        setSelectedIds([placed[placed.length - 1].id]);
      }
      return placed;
    },
    [pushUndoSnapshot]
  );

  const uploadToLibrary = useCallback(
    async (files) => {
      await addToLibrary(files);
    },
    [addToLibrary]
  );

  const placeFromLibrary = useCallback(
    (libraryId, position) => {
      const item = libraryRef.current.find((entry) => entry.id === libraryId);
      if (!item) return;
      placeLibraryItems([item], position);
    },
    [placeLibraryItems]
  );

  const removeFromLibrary = useCallback(
    (libraryId) => {
      const item = libraryRef.current.find((entry) => entry.id === libraryId);
      if (!item) return;
      setLibrary((prev) => prev.filter((entry) => entry.id !== libraryId));
      if (
        typeof item.src === "string" &&
        item.src.startsWith("blob:") &&
        !isSrcInUse(item.src, {
          library: libraryRef.current,
          elements: elementsRef.current,
          excludeLibraryId: libraryId,
        })
      ) {
        URL.revokeObjectURL(item.src);
        blobUrlsRef.current.delete(item.src);
      }
    },
    []
  );

  const addImagesFromFiles = useCallback(
    async (files) => {
      if (!artboardRef.current || files.length === 0) return;
      const items = await addToLibrary(files);
      placeLibraryItems(items);
    },
    [addToLibrary, placeLibraryItems]
  );

  const addShape = useCallback(
    (shapeKind) => {
      if (!artboardRef.current) return;
      const board = artboardRef.current;
      pushUndoSnapshot();
      let placed = null;
      setElements((prev) => {
        const layer = prev.length === 0 ? 0 : Math.max(...prev.map((e) => e.layer)) + 1;
        placed = createShapeElement(shapeKind, board, layer, makeId);
        return [...prev, placed];
      });
      if (placed) setSelectedIds([placed.id]);
    },
    [pushUndoSnapshot]
  );

  const patchElement = useCallback((id, patch) => {
    setElements((prev) => prev.map((el) => (el.id === id ? { ...el, ...patch } : el)));
  }, []);

  const patchElements = useCallback((updates) => {
    setElements((prev) =>
      prev.map((el) => (updates[el.id] ? { ...el, ...updates[el.id] } : el))
    );
  }, []);

  const updateElement = useCallback(
    (id, patch) => {
      pushUndoSnapshot();
      patchElement(id, patch);
    },
    [pushUndoSnapshot, patchElement]
  );

  // Apply a patch to every element in `ids` (e.g. toggle cutLine on the group).
  const updateSelected = useCallback(
    (patch) => {
      const ids = selectedIdsRef.current;
      if (ids.length === 0) return;
      pushUndoSnapshot();
      const idSet = new Set(ids);
      setElements((prev) => prev.map((el) => (idSet.has(el.id) ? { ...el, ...patch } : el)));
    },
    [pushUndoSnapshot]
  );

  /** Set every selected element to the same width and/or height (mm). */
  const resizeSelectedToUniformSize = useCallback(
    (patch) => {
      const ids = selectedIdsRef.current;
      if (ids.length === 0) return;
      if (patch.width == null && patch.height == null) return;
      pushUndoSnapshot();
      const idSet = new Set(ids);
      setElements((prev) =>
        prev.map((el) => {
          if (!idSet.has(el.id)) return el;
          const next = { ...el };
          if (patch.width != null) {
            next.width = Math.max(5, patch.width);
          }
          if (patch.height != null) {
            next.height = Math.max(5, patch.height);
          }
          return next;
        })
      );
    },
    [pushUndoSnapshot]
  );

  const removeElement = useCallback(
    (id) => {
      pushUndoSnapshot();
      setElements((prev) => prev.filter((el) => el.id !== id));
      setSelectedIds((cur) => cur.filter((x) => x !== id));
    },
    [pushUndoSnapshot]
  );

  const removeElements = useCallback(
    (ids) => {
      if (!ids?.length) return;
      pushUndoSnapshot();
      const idSet = new Set(ids);
      setElements((prev) => prev.filter((el) => !idSet.has(el.id)));
      setSelectedIds((cur) => cur.filter((x) => !idSet.has(x)));
    },
    [pushUndoSnapshot]
  );

  const removeSelected = useCallback(() => {
    removeElements(selectedIdsRef.current);
  }, [removeElements]);

  const toggleCutLineForElements = useCallback(
    (ids) => {
      if (!ids?.length) return;
      pushUndoSnapshot();
      const idSet = new Set(ids);
      const targets = elementsRef.current.filter((el) => idSet.has(el.id));
      if (targets.length === 0) return;
      const allOn = targets.every((el) => el.cutLine);
      setElements((prev) =>
        prev.map((el) => (idSet.has(el.id) ? { ...el, cutLine: !allOn } : el))
      );
    },
    [pushUndoSnapshot]
  );

  const toggleLockAspectRatioForElements = useCallback(
    (ids) => {
      if (!ids?.length) return;
      pushUndoSnapshot();
      const idSet = new Set(ids);
      const targets = elementsRef.current.filter((el) => idSet.has(el.id));
      if (targets.length === 0) return;
      const allOn = targets.every((el) => el.lockAspectRatio);
      setElements((prev) =>
        prev.map((el) => (idSet.has(el.id) ? { ...el, lockAspectRatio: !allOn } : el))
      );
    },
    [pushUndoSnapshot]
  );

  const selectAll = useCallback(() => {
    setSelectedIds(elementsRef.current.map((el) => el.id));
  }, []);

  const reorderLayer = useCallback(
    (id, direction) => {
      const sorted = [...elementsRef.current].sort((a, b) => a.layer - b.layer);
      const idx = sorted.findIndex((e) => e.id === id);
      if (idx === -1) return;
      const swapWith = direction === "up" ? idx + 1 : idx - 1;
      if (swapWith < 0 || swapWith >= sorted.length) return;
      pushUndoSnapshot();
      setElements((prev) => {
        const layerSorted = [...prev].sort((a, b) => a.layer - b.layer);
        const from = layerSorted.findIndex((e) => e.id === id);
        if (from === -1) return prev;
        const to = direction === "up" ? from + 1 : from - 1;
        if (to < 0 || to >= layerSorted.length) return prev;
        const a = layerSorted[from];
        const b = layerSorted[to];
        return prev.map((el) => {
          if (el.id === a.id) return { ...el, layer: b.layer };
          if (el.id === b.id) return { ...el, layer: a.layer };
          return el;
        });
      });
    },
    [pushUndoSnapshot]
  );

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
    pushUndoSnapshot();
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
  }, [pushUndoSnapshot]);

  /**
   * Insert a copy of the given source element. Returns the new id.
   * `offsetMm` is applied to x/y. Pass 0 for Alt-drag (clone stays at the source
   * position while the drag moves the original away) and a non-zero value for keyboard paste.
   */
  const insertCopy = useCallback((source, offsetMm = 0) => {
    if (!source) return null;
    const newId = makeId();
    const nx = source.x + offsetMm;
    const ny = source.y + offsetMm;
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

  const duplicateElements = useCallback(
    (ids) => {
      if (!ids?.length) return;
      pushUndoSnapshot();
      const idSet = new Set(ids);
      const sources = elementsRef.current.filter((el) => idSet.has(el.id));
      for (const src of sources) insertCopy(src, 0);
    },
    [insertCopy, pushUndoSnapshot]
  );

  // Alt-drag duplicates every selected element in place, leaving a static
  // clone at each source position while the drag continues to move the
  // originals.
  const duplicateSelectedInPlace = useCallback(() => {
    duplicateElements(selectedIdsRef.current);
  }, [duplicateElements]);

  // Clipboard stores snapshots of all copied elements. Blob URLs remain valid
  // because they live until reset / unmount.
  const clipboardRef = useRef([]);

  const copyElements = useCallback((ids) => {
    if (!ids?.length) return false;
    const idSet = new Set(ids);
    const snapshot = elementsRef.current
      .filter((el) => idSet.has(el.id))
      .map((el) => ({ ...el }));
    if (snapshot.length === 0) return false;
    clipboardRef.current = snapshot;
    return true;
  }, []);

  const copySelected = useCallback(() => {
    return copyElements(selectedIdsRef.current);
  }, [copyElements]);

  const pasteFromClipboard = useCallback(() => {
    const src = clipboardRef.current;
    if (!src || src.length === 0) return;
    pushUndoSnapshot();
    const newIds = [];
    for (const s of src) {
      const id = insertCopy(s, PASTE_OFFSET_MM);
      if (id) newIds.push(id);
    }
    if (newIds.length > 0) setSelectedIds(newIds);
  }, [insertCopy, pushUndoSnapshot]);

  const applyBusinessCardLayout = useCallback(() => {
    const sheet = BUSINESS_CARD_SHEETS[businessSheet];
    const source =
      elementsRef.current.find((el) => selectedIdsRef.current.includes(el.id)) ||
      elementsRef.current[0];
    if (!source) {
      alert("Add or select artwork before creating a business-card sheet.");
      return;
    }

    const totalWidth = sheet.cols * BUSINESS_CARD.width + (sheet.cols - 1) * BUSINESS_CARD.spacing;
    const totalHeight = sheet.rows * BUSINESS_CARD.height + (sheet.rows - 1) * BUSINESS_CARD.spacing;
    const startX = (sheet.width - totalWidth) / 2;
    const startY = (sheet.height - totalHeight) / 2;
    const arranged = [];

    for (let row = 0; row < sheet.rows; row++) {
      for (let col = 0; col < sheet.cols; col++) {
        arranged.push({
          ...source,
          id: makeId(),
          x: startX + col * (BUSINESS_CARD.width + BUSINESS_CARD.spacing),
          y: startY + row * (BUSINESS_CARD.height + BUSINESS_CARD.spacing),
          width: BUSINESS_CARD.width,
          height: BUSINESS_CARD.height,
          layer: arranged.length,
          cutLine: true,
        });
      }
    }

    pushUndoSnapshot();
    setArtboard({
      ...artboardRef.current,
      name: `Business cards ${businessSheet}`,
      width: sheet.width,
      height: sheet.height,
      background: "transparent",
    });
    setElements(arranged);
    setSelectedIds(arranged.map((el) => el.id));
  }, [businessSheet, pushUndoSnapshot]);

  const applyNUpLayout = useCallback(
    (count) => {
      const board = artboardRef.current;
      const n = clamp(Math.round(Number(count) || 1), 1, 50);
      const gap = clamp(Number(layoutGap) || 0, 0, 100);
      const lockAspect = layoutLockAspect;
      const source = layoutSourceElement(elementsRef.current, selectedIdsRef.current);

      if (!source) {
        alert("Add or select artwork first.");
        return;
      }

      const { rows, cols } = bestGridForCount(n, board.width, board.height);
      const cellW = (board.width - gap * (cols - 1)) / cols;
      const cellH = (board.height - gap * (rows - 1)) / rows;
      if (cellW <= 0 || cellH <= 0) {
        alert("Gap is too large for this artboard.");
        return;
      }

      const arranged = [];
      for (let i = 0; i < n; i++) {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const { width, height } = fitInCell(cellW, cellH, source, lockAspect);
        arranged.push({
          ...source,
          id: makeId(),
          x: col * (cellW + gap) + (cellW - width) / 2,
          y: row * (cellH + gap) + (cellH - height) / 2,
          width,
          height,
          layer: arranged.length,
          lockAspectRatio: lockAspect ? true : source.lockAspectRatio,
        });
      }

      pushUndoSnapshot();
      setArtboard({
        ...board,
        name: n === 1 ? source.name || "1-up" : `${n}-up`,
      });
      setElements(arranged);
      setSelectedIds(arranged.map((el) => el.id));
    },
    [layoutGap, layoutLockAspect, pushUndoSnapshot]
  );

  const applyFillPage = useCallback(() => {
    const board = artboardRef.current;
    const gap = clamp(Number(layoutGap) || 0, 0, 100);
    const lockAspect = layoutLockAspect;
    const source = layoutSourceElement(elementsRef.current, selectedIdsRef.current);

    if (!source) {
      alert("Add or select artwork first.");
      return;
    }

    const tileW = source.width;
    const tileH = source.height;
    if (tileW <= 0 || tileH <= 0) return;

    const cols = Math.max(1, Math.floor((board.width + gap) / (tileW + gap)));
    const rows = Math.max(1, Math.floor((board.height + gap) / (tileH + gap)));
    const totalW = cols * tileW + (cols - 1) * gap;
    const totalH = rows * tileH + (rows - 1) * gap;
    const startX = (board.width - totalW) / 2;
    const startY = (board.height - totalH) / 2;

    const arranged = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        arranged.push({
          ...source,
          id: makeId(),
          x: startX + col * (tileW + gap),
          y: startY + row * (tileH + gap),
          width: tileW,
          height: tileH,
          layer: arranged.length,
          lockAspectRatio: lockAspect ? true : source.lockAspectRatio,
        });
      }
    }

    pushUndoSnapshot();
    setArtboard({ ...board, name: "Fill page" });
    setElements(arranged);
    setSelectedIds(arranged.map((el) => el.id));
  }, [layoutGap, layoutLockAspect, pushUndoSnapshot]);

  const applyBigAsPossible = useCallback(() => {
    const board = artboardRef.current;
    const gap = clamp(Number(layoutGap) || 0, 0, 100);
    const lockAspect = layoutLockAspect;
    const prev = elementsRef.current;

    if (prev.length === 0) {
      alert("Add images to the artboard first.");
      return;
    }

    pushUndoSnapshot();
    setElements(() => {
      const sorted = sortElementsReadingOrder(prev);
      const n = sorted.length;
      const { rows, cols } = bestGridForCount(n, board.width, board.height);
      const cellW = (board.width - gap * (cols - 1)) / cols;
      const cellH = (board.height - gap * (rows - 1)) / rows;
      if (cellW <= 0 || cellH <= 0) return prev;

      const updates = new Map();
      sorted.forEach((el, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const { width, height } = fitInCell(cellW, cellH, el, lockAspect);
        updates.set(el.id, {
          x: col * (cellW + gap) + (cellW - width) / 2,
          y: row * (cellH + gap) + (cellH - height) / 2,
          width,
          height,
          lockAspectRatio: lockAspect ? true : el.lockAspectRatio,
        });
      });

      return prev.map((p) => (updates.has(p.id) ? { ...p, ...updates.get(p.id) } : p));
    });
  }, [layoutGap, layoutLockAspect, pushUndoSnapshot]);

  // Global shortcuts + paste (OS images and internal element clipboard). Ignored while typing.
  useEffect(() => {
    if (!artboard) return;
    const onPaste = (e) => {
      if (viewMode !== "editor" || isEditableTarget(e.target)) return;
      const imageFiles = imageFilesFromClipboard(e.clipboardData);
      if (imageFiles.length > 0) {
        void addImagesFromFiles(imageFiles);
        e.preventDefault();
        return;
      }
      if (clipboardRef.current?.length > 0) {
        pasteFromClipboard();
        e.preventDefault();
      }
    };
    const onKey = (e) => {
      if (isEditableTarget(e.target)) return;
      const key = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && key === "z" && !e.shiftKey) {
        if (undo()) e.preventDefault();
        return;
      }
      if (mod && ((key === "z" && e.shiftKey) || key === "y")) {
        if (redo()) e.preventDefault();
        return;
      }
      if (mod && key === "c") {
        if (copySelected()) e.preventDefault();
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
      if (mod && key === "p") {
        if (viewMode === "editor") {
          handlePrint();
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
    document.addEventListener("paste", onPaste);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("keydown", onKey);
    };
  }, [
    artboard,
    viewMode,
    undo,
    redo,
    copySelected,
    pasteFromClipboard,
    addImagesFromFiles,
    removeSelected,
    selectAll,
    duplicateSelectedInPlace,
    handlePrint,
  ]);

  return (
    <div className="h-[100dvh] overflow-hidden neu-bg neu-text-strong">
      <Editor
        artboard={artboard}
        setArtboard={updateArtboard}
        elements={elements}
        library={library}
        selectedIds={selectedIds}
        setSelectedIds={setSelectedIds}
        addImagesFromFiles={addImagesFromFiles}
        addShape={addShape}
        uploadToLibrary={uploadToLibrary}
        placeFromLibrary={placeFromLibrary}
        removeFromLibrary={removeFromLibrary}
        updateElement={updateElement}
        updateSelected={updateSelected}
        resizeSelectedToUniformSize={resizeSelectedToUniformSize}
        removeElement={removeElement}
        removeSelected={removeSelected}
        reorderLayer={reorderLayer}
        duplicateSelectedInPlace={duplicateSelectedInPlace}
        duplicateElements={duplicateElements}
        copyElements={copyElements}
        removeElements={removeElements}
        toggleCutLineForElements={toggleCutLineForElements}
        toggleLockAspectRatioForElements={toggleLockAspectRatioForElements}
        patchElement={patchElement}
        patchElements={patchElements}
        pushUndoSnapshot={pushUndoSnapshot}
        snapEnabled={snapEnabled}
        setSnapEnabled={setSnapEnabled}
        alignAndCenter={alignAndCenter}
        onReset={handleResetAll}
        onDownloadPdf={handleDownloadPdf}
        onDownloadPng={handleDownloadPng}
        onPrint={handlePrint}
        isExporting={isExporting}
        isExportingPng={isExportingPng}
        isPrinting={isPrinting}
        businessSheet={businessSheet}
        setBusinessSheet={setBusinessSheet}
        applyBusinessCardLayout={applyBusinessCardLayout}
        layoutGap={layoutGap}
        setLayoutGap={setLayoutGap}
        layoutLockAspect={layoutLockAspect}
        setLayoutLockAspect={setLayoutLockAspect}
        applyNUpLayout={applyNUpLayout}
        applyFillPage={applyFillPage}
        applyBigAsPossible={applyBigAsPossible}
        viewMode={viewMode}
        setViewMode={setViewMode}
        viewport={viewport}
        setViewport={setViewport}
        canvasWrap={canvasWrap}
        setCanvasWrap={setCanvasWrap}
      />
    </div>
  );
}

function Editor({
  artboard,
  setArtboard,
  elements,
  library,
  selectedIds,
  setSelectedIds,
  addImagesFromFiles,
  addShape,
  uploadToLibrary,
  placeFromLibrary,
  removeFromLibrary,
  updateElement,
  updateSelected,
  resizeSelectedToUniformSize,
  removeElement,
  removeSelected,
  reorderLayer,
  duplicateSelectedInPlace,
  duplicateElements,
  copyElements,
  removeElements,
  toggleCutLineForElements,
  toggleLockAspectRatioForElements,
  patchElement,
  patchElements,
  pushUndoSnapshot,
  snapEnabled,
  setSnapEnabled,
  alignAndCenter,
  onReset,
  onDownloadPdf,
  onDownloadPng,
  onPrint,
  isExporting,
  isExportingPng,
  isPrinting,
  businessSheet,
  setBusinessSheet,
  applyBusinessCardLayout,
  layoutGap,
  setLayoutGap,
  layoutLockAspect,
  setLayoutLockAspect,
  applyNUpLayout,
  applyFillPage,
  applyBigAsPossible,
  viewMode,
  setViewMode,
  viewport,
  setViewport,
  canvasWrap,
  setCanvasWrap,
}) {
  const isCanvasMode = viewMode === "canvas-wrap";

  const sortedByLayer = useMemo(
    () => [...elements].sort((a, b) => a.layer - b.layer),
    [elements]
  );

  const [libraryDragOver, setLibraryDragOver] = useState(false);

  const onDrop = useCallback(
    (accepted) => {
      if (accepted && accepted.length > 0) addImagesFromFiles(accepted);
    },
    [addImagesFromFiles]
  );

  const onLibraryDrop = useCallback(
    (accepted) => {
      if (accepted && accepted.length > 0) uploadToLibrary(accepted);
    },
    [uploadToLibrary]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp", ".gif"] },
    noClick: true,
    onDrop,
  });

  const { open: openLibraryUpload } = useDropzone({
    accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp", ".gif"] },
    noClick: true,
    noDrag: true,
    onDrop: onLibraryDrop,
  });

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedElements = useMemo(
    () => elements.filter((el) => selectedSet.has(el.id)),
    [elements, selectedSet]
  );
  const githubUrl = githubRepoUrl();
  const [activePanel, setActivePanel] = useState("artboard");

  useEffect(() => {
    if (isCanvasMode) setActivePanel("specialized");
  }, [isCanvasMode]);

  useEffect(() => {
    if (isCanvasMode) return;
    const onKeyDown = (e) => {
      if (isEditableTarget(e.target)) return;
      if (suppressBrowserAltChrome(e)) return;
      if (e.code !== "Space" || e.repeat) return;
      e.preventDefault();
      blurNonEditableFocus();
    };
    const onKeyUp = (e) => {
      if (isEditableTarget(e.target)) return;
      if (suppressBrowserAltChrome(e)) return;
      if (e.code !== "Space") return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("keyup", onKeyUp, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("keyup", onKeyUp, { capture: true });
    };
  }, [isCanvasMode]);

  const editorSidebarControls = (
    <>
      <SidebarGroup label="Setup">
        <AccordionSection
          id="artboard"
          title="Artboard"
          icon={FiFileText}
          open={activePanel === "artboard"}
          onToggle={setActivePanel}
          summary={`${artboard.width} x ${artboard.height} ${artboard.unit}`}
        >
          <label className="block text-[11px] font-medium neu-text-muted">
            Name
            <input
              type="text"
              value={artboard.name}
              onChange={(e) => setArtboard({ ...artboard, name: e.target.value })}
              className={`${inputClass} mt-1 py-1.5 text-xs`}
            />
          </label>
          <div className="rounded-[var(--radius-sm)] neu-inset p-3 text-xs neu-text-muted">
            <p className="font-semibold neu-text-strong">{artboard.name}</p>
            <p className="mt-0.5">
              {artboard.width} × {artboard.height} {artboard.unit}
            </p>
          </div>
          <label className="mt-3 block text-[11px] font-medium neu-text-muted">
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
            <label className="text-[11px] font-medium neu-text-muted">
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
            <label className="text-[11px] font-medium neu-text-muted">
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
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setArtboard({ ...artboard, width: artboard.height, height: artboard.width })}
              className="inline-flex items-center justify-center gap-1.5 neu-btn inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-medium"
            >
              <FiRotateCw className="h-3 w-3" />
              Rotate
            </button>
            <button
              type="button"
              onClick={() =>
                setArtboard({
                  ...artboard,
                  background: artboard.background === "transparent" ? "#ffffff" : "transparent",
                })
              }
              aria-pressed={artboard.background !== "transparent"}
              className="inline-flex items-center justify-center neu-btn inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-medium"
            >
              {artboard.background === "transparent" ? "Transparent" : "White bg"}
            </button>
          </div>
        </AccordionSection>
      </SidebarGroup>

      <SidebarGroup label="Content">
        <AccordionSection
          id="library"
          title="Library"
          icon={FiImage}
          open={activePanel === "library"}
          onToggle={setActivePanel}
          summary={library.length === 0 ? "No images" : `${library.length} item${library.length === 1 ? "" : "s"}`}
        >
          <div className="space-y-3 neu-panel rounded-[var(--radius)] p-3">
            <button
              type="button"
              onClick={openLibraryUpload}
              className="inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] neu-btn inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-xs font-semibold"
            >
              <FiPlus className="h-3.5 w-3.5" />
              Upload images
            </button>
            <div className="max-h-48 space-y-2 overflow-auto pr-1">
              {library.length === 0 ? (
                <p className="text-[11px] leading-relaxed neu-text-muted">
                  Upload PNG, JPG, GIF, or WebP files to your library, then drag them onto the artboard or use + to add.
                </p>
              ) : (
                library.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-1 rounded-md border neu-chip neu-hover-inset"
                  >
                    <div
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(LIBRARY_DRAG_MIME, item.id);
                        e.dataTransfer.effectAllowed = "copy";
                        const thumb = e.currentTarget.querySelector("img");
                        if (thumb && e.dataTransfer.setDragImage) {
                          e.dataTransfer.setDragImage(thumb, thumb.width / 2, thumb.height / 2);
                        }
                      }}
                      className="flex min-w-0 flex-1 cursor-grab items-center gap-2 px-2 py-1.5 text-left text-[11px] active:cursor-grabbing"
                      title="Drag onto artboard"
                    >
                      <img src={item.src} alt="" className="pointer-events-none h-8 w-8 rounded object-cover" draggable={false} />
                      <span className="min-w-0 flex-1 truncate">{item.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => placeFromLibrary(item.id)}
                      aria-label={`Add ${item.name} to artboard`}
                      title="Add to artboard"
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md neu-text-muted transition hover:neu-text-strong"
                    >
                      <FiPlus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFromLibrary(item.id)}
                      aria-label={`Remove ${item.name} from library`}
                      className="mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md neu-text-muted transition hover:text-red-600 dark:hover:text-red-400"
                    >
                      <FiTrash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </AccordionSection>

        <AccordionSection
          id="shapes"
          title="Shapes"
          icon={FiHexagon}
          open={activePanel === "shapes"}
          onToggle={setActivePanel}
          summary="Rectangles, ellipses & lines"
        >
          <div className="space-y-3 neu-panel rounded-[var(--radius)] p-3">
            <p className="text-[11px] leading-relaxed neu-text-muted">
              Add vector shapes to the artboard. Adjust fill, stroke, and size in the properties panel.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {SHAPE_CATALOG.map((shape) => (
                <button
                  key={shape.kind}
                  type="button"
                  onClick={() => addShape(shape.kind)}
                  className="neu-btn flex flex-col items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-2.5 text-[10px] font-semibold transition"
                  title={`Add ${shape.label}`}
                >
                  <ShapePreviewIcon shape={shape} className="h-8 w-8" />
                  {shape.label}
                </button>
              ))}
            </div>
          </div>
        </AccordionSection>
      </SidebarGroup>

      <SidebarGroup label="Layout">
        <AccordionSection
          id="automations"
          title="Automations"
          icon={FiGrid}
          open={activePanel === "automations"}
          onToggle={setActivePanel}
          summary="N-up, fill & scale"
        >
          <div className="space-y-3 neu-panel rounded-[var(--radius)] p-3">
            <div className="grid grid-cols-2 items-end gap-2">
              <button
                type="button"
                onClick={() => setLayoutLockAspect((v) => !v)}
                aria-pressed={layoutLockAspect}
                title={layoutLockAspect ? "Lock aspect ratio when laying out" : "Stretch to fill cells"}
                className={`inline-flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-2 text-[11px] font-semibold transition ${
                  layoutLockAspect ? "neu-btn-primary" : "neu-btn"
                }`}
              >
                {layoutLockAspect ? (
                  <FiLock className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <FiUnlock className="h-3.5 w-3.5 shrink-0" />
                )}
                Lock aspect
              </button>
              <label className="block text-[11px] font-medium neu-text-muted">
                Gap (mm)
                <input
                  type="number"
                  min={0}
                  value={layoutGap}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) setLayoutGap(v);
                  }}
                  className={`${inputClass} mt-1 w-full py-2 text-xs`}
                />
              </label>
            </div>

            <div className="rounded-[var(--radius-sm)] neu-inset p-2.5">
              <p className="mb-2 text-[11px] font-semibold neu-text-strong">Sheet copies</p>
              <p className="mb-2 text-[10px] leading-relaxed neu-text-muted">
                Uses selected image, or the first on the artboard.
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {N_UP_COUNTS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => applyNUpLayout(n)}
                    disabled={elements.length === 0}
                    className="neu-btn rounded-[var(--radius-sm)] px-1 py-2 text-[11px] font-semibold disabled:cursor-not-allowed"
                  >
                    {n}-up
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={applyFillPage}
                disabled={elements.length === 0}
                title="Tile the page using the image at its current size"
                className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-sm)] neu-btn px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed"
              >
                <FiCopy className="h-3.5 w-3.5" />
                Fill page
              </button>
              <button
                type="button"
                onClick={applyBigAsPossible}
                disabled={elements.length === 0}
                title="Scale every image on the page to fill as much space as possible"
                className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-sm)] neu-btn px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed"
              >
                <FiMaximize2 className="h-3.5 w-3.5" />
                Big as possible
              </button>
            </div>

            <div className="rounded-[var(--radius-sm)] neu-inset p-2.5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold neu-text-strong">Business cards</p>
                <select
                  value={businessSheet}
                  onChange={(e) => setBusinessSheet(e.target.value)}
                  className="neu-input rounded-lg px-2 py-1 text-[11px] font-medium focus:outline-none"
                  aria-label="Business card sheet"
                >
                  <option value="A4">A4 · 10</option>
                  <option value="A3">A3 · 24</option>
                </select>
              </div>
              <button
                type="button"
                onClick={applyBusinessCardLayout}
                disabled={elements.length === 0}
                className="inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] neu-btn px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed"
              >
                <FiCreditCard className="h-3.5 w-3.5" />
                Fill sheet
              </button>
            </div>
          </div>
        </AccordionSection>
      </SidebarGroup>

      <SidebarGroup label="Output">
        <AccordionSection
          id="export"
          title="Export"
          icon={FiDownload}
          open={activePanel === "export"}
          onToggle={setActivePanel}
          summary="PDF, PNG & print"
        >
          <div className="space-y-2">
            <button
              type="button"
              onClick={onDownloadPdf}
              disabled={isExporting || elements.length === 0}
              className="neu-btn-primary inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] px-3 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed"
            >
              {isExporting ? (
                <>
                  <FiLoader className="h-4 w-4 animate-spin" />
                  Generating PDF…
                </>
              ) : (
                <>
                  <FiDownload className="h-4 w-4" />
                  Export PDF
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onDownloadPng}
              disabled={isExportingPng || elements.length === 0}
              className="inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] neu-btn inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] px-3 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed"
            >
              {isExportingPng ? (
                <>
                  <FiLoader className="h-4 w-4 animate-spin" />
                  Generating PNG…
                </>
              ) : (
                <>
                  <FiImage className="h-4 w-4" />
                  Export PNG
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onPrint}
              disabled={isPrinting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] neu-btn inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] px-3 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed"
            >
              {isPrinting ? (
                <>
                  <FiLoader className="h-4 w-4 animate-spin" />
                  Preparing print…
                </>
              ) : (
                <>
                  <FiPrinter className="h-4 w-4" />
                  Print
                </>
              )}
            </button>
          </div>
        </AccordionSection>
      </SidebarGroup>
    </>
  );

  const specializedSidebar = (
    <AccordionSection
      id="specialized"
      title="Canvas wrap"
      icon={FiBox}
      open={activePanel === "specialized"}
      onToggle={setActivePanel}
      summary={isCanvasMode ? "Active — gallery wrap" : "Gallery-wrap bleed & sheets"}
    >
      <div className="space-y-3 neu-panel rounded-[var(--radius)] p-3">
        {isCanvasMode ? (
          <div className="neu-info-panel rounded-[var(--radius-sm)] p-2.5">
            <p className="text-[11px] font-semibold">Canvas wrap</p>
            <p className="mt-1 text-[11px] leading-relaxed opacity-90">
              Gallery-wrap bleed and sheet placement. Editor controls are paused while this layout is open.
            </p>
            <button
              type="button"
              onClick={() => setViewMode("editor")}
              className="neu-btn mt-2 inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-xs font-semibold transition"
            >
              <FiArrowLeft className="h-3.5 w-3.5" />
              Back to editor
            </button>
          </div>
        ) : (
          <div className="rounded-[var(--radius-sm)] neu-inset p-2.5">
            <p className="text-[11px] font-semibold neu-text-strong">Canvas wrap</p>
            <p className="mt-1 text-[11px] leading-relaxed neu-text-muted">
              Gallery-wrap bleed and sheet placement — export PDF locally.
            </p>
            <button
              type="button"
              onClick={() => setViewMode("canvas-wrap")}
              className="neu-btn mt-2 inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-xs font-semibold transition"
            >
              <FiBox className="h-3.5 w-3.5" />
              Open canvas wrap
            </button>
          </div>
        )}
      </div>
    </AccordionSection>
  );

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden lg:grid lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="shrink-0 neu-sidebar p-4 lg:sticky lg:top-0 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:p-5">
        <div className="mb-5 flex items-center justify-between gap-3">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <span className="neu-logo flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)]">
              <FiLayers className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-base font-semibold tracking-tight neu-text-strong">
                Dropio
              </span>
              <span className="block truncate text-xs neu-text-muted">Simple print editor</span>
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-1.5">
            <ThemeToggle />
            <a
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open Dropio on GitHub"
              className="neu-icon-btn inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)]"
            >
              <FaGithub className="h-4 w-4" aria-hidden />
            </a>
          </div>
        </div>

        <div className="space-y-4">
          <div
            className={`space-y-4 ${isCanvasMode ? "pointer-events-none select-none opacity-45" : ""}`}
            aria-hidden={isCanvasMode ? true : undefined}
            inert={isCanvasMode ? true : undefined}
          >
            {editorSidebarControls}
          </div>

          <SidebarGroup label="Tools">
            {specializedSidebar}
          </SidebarGroup>

          {!isCanvasMode ? (
            <div className="border-t border-[var(--border)] pt-4">
              <button
                type="button"
                onClick={onReset}
                className="inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] neu-btn px-3 py-2 text-xs font-semibold neu-text-muted"
              >
                <FiRotateCw className="h-3.5 w-3.5" />
                Reset document
              </button>
            </div>
          ) : null}
        </div>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--bg)] p-3 sm:p-4">
        {isCanvasMode ? (
          <>
            <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="neu-text-strong">Canvas Wrap</h1>
                <p className="mt-0.5 text-[13px] neu-text-muted">
                  Gallery-wrap bleed and sheet placement — export PDF locally.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewMode("editor")}
                className="neu-btn inline-flex items-center gap-2 rounded-[var(--radius-sm)] px-3 py-1.5 text-sm font-medium transition"
              >
                <FiArrowLeft className="h-4 w-4" />
                Back to editor
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <CanvasWrapWorkspace canvasWrap={canvasWrap} onCanvasWrapChange={setCanvasWrap} />
            </div>
          </>
        ) : (
          <>
            <div className="mb-3 shrink-0">
              <h1 className="neu-text-strong">Workspace</h1>
              <p className="mt-0.5 text-[13px] neu-text-muted">Arrange artwork, apply layout automation, export locally.</p>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
              <StageToolbar
                snapEnabled={snapEnabled}
                setSnapEnabled={setSnapEnabled}
                alignAndCenter={alignAndCenter}
                canAlign={elements.length > 0}
                selectionCount={selectedElements.length}
                totalCount={elements.length}
                viewZoom={viewport.viewZoom}
                pan={viewport.pan}
                onResetZoom={() =>
                  setViewport((prev) => ({
                    ...prev,
                    viewZoom: 1,
                    pan: { x: 0, y: 0 },
                  }))
                }
              />
              <div
                {...getRootProps({
                  className: `relative min-h-0 flex-1 rounded-[var(--radius-lg)] outline-none transition-[box-shadow,border-color] ${isDragActive || libraryDragOver ? "dropio-drag-active" : ""
                    }`,
                })}
              >
                <input {...getInputProps()} aria-label="Drop images onto artboard" />
                <ArtboardStage
                  artboard={artboard}
                  elements={sortedByLayer}
                  selectedIds={selectedIds}
                  setSelectedIds={setSelectedIds}
                  patchElement={patchElement}
                  patchElements={patchElements}
                  updateElement={updateElement}
                  updateSelected={updateSelected}
                  resizeSelectedToUniformSize={resizeSelectedToUniformSize}
                  removeElement={removeElement}
                  removeSelected={removeSelected}
                  duplicateSelectedInPlace={duplicateSelectedInPlace}
                  duplicateElements={duplicateElements}
                  copyElements={copyElements}
                  removeElements={removeElements}
                  toggleCutLineForElements={toggleCutLineForElements}
                  toggleLockAspectRatioForElements={toggleLockAspectRatioForElements}
                  reorderLayer={reorderLayer}
                  pushUndoSnapshot={pushUndoSnapshot}
                  snapEnabled={snapEnabled}
                  viewport={viewport}
                  setViewport={setViewport}
                  placeFromLibrary={placeFromLibrary}
                  onLibraryDragOverChange={setLibraryDragOver}
                />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function StageToolbar({
  snapEnabled,
  setSnapEnabled,
  alignAndCenter,
  canAlign,
  selectionCount,
  totalCount,
  viewZoom,
  pan,
  onResetZoom,
}) {
  const zoomPercent = Math.round(viewZoom * 100);
  const isZoomDefault =
    Math.abs(viewZoom - 1) < 1e-3 && Math.abs(pan.x) < 0.5 && Math.abs(pan.y) < 0.5;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--panel-elevated)] px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={alignAndCenter}
          disabled={!canAlign}
          title="Distribute all elements with equal spacing and center them on the artboard"
          className={`inline-flex items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium transition-colors ${canAlign
            ? "neu-btn-primary"
            : "neu-inset cursor-not-allowed neu-text-muted"
            }`}
        >
          <FiAlignCenter className="h-3.5 w-3.5" />
          Align and center
        </button>
        {totalCount > 0 ? (
          <span className="text-[11px] font-medium neu-text-muted">
            {selectionCount > 0 ? (
              <>
                <span className="neu-text-strong">{selectionCount}</span>
                {" / "}
                {totalCount} selected
              </>
            ) : (
              <>{totalCount} on page · drag to marquee-select</>
            )}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {isZoomDefault ? (
          <span
            className="inline-flex min-w-[2.75rem] justify-center rounded-[var(--radius-sm)] px-2 py-1.5 text-[11px] font-semibold tabular-nums neu-inset neu-text-muted"
            title="Viewport zoom (Alt+scroll on artboard)"
          >
            {zoomPercent}%
          </span>
        ) : (
          <button
            type="button"
            onClick={onResetZoom}
            title="Reset zoom and pan to fit page"
            className="neu-btn inline-flex min-w-[2.75rem] justify-center rounded-[var(--radius-sm)] px-2 py-1.5 text-[11px] font-semibold tabular-nums neu-text-strong transition-colors"
          >
            {zoomPercent}%
          </button>
        )}
        <button
          type="button"
          onClick={() => setSnapEnabled((v) => !v)}
          aria-pressed={snapEnabled}
          className={`inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-semibold transition-colors ${snapEnabled
            ? "neu-toggle-on"
            : "neu-toggle-off"
            }`}
        >
          <FiCrosshair className="h-3.5 w-3.5" />
          Snap {snapEnabled ? "on" : "off"}
        </button>
      </div>
    </div>
  );
}

function ShapePreviewIcon({ shape, className = "" }) {
  const fill = shape.fill === "transparent" ? "none" : shape.fill;
  const stroke = shape.stroke;
  const strokeWidth = 1.5;

  if (shape.kind === "line") {
    return (
      <svg className={className} viewBox="0 0 24 24" aria-hidden>
        <line x1="3" y1="12" x2="21" y2="12" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
      </svg>
    );
  }

  if (shape.kind === "ellipse") {
    return (
      <svg className={className} viewBox="0 0 24 24" aria-hidden>
        <ellipse cx="12" cy="12" rx="9" ry="9" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      </svg>
    );
  }

  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <rect x="4" y="6" width="16" height="12" rx="1" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
    </svg>
  );
}

function ShapeElementGraphic({ element }) {
  const fill = element.fill === "transparent" ? "none" : element.fill;
  const stroke = element.stroke || "#000000";
  const strokeWidth = element.strokeWidth ?? 0.5;
  const viewW = Math.max(element.width, 1);
  const viewH = Math.max(element.height, 1);

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${viewW} ${viewH}`}
      preserveAspectRatio="none"
      aria-hidden
      style={{ display: "block", pointerEvents: "none" }}
    >
      {element.shapeKind === "line" ? (
        <line
          x1="0"
          y1={viewH / 2}
          x2={viewW}
          y2={viewH / 2}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ) : element.shapeKind === "ellipse" ? (
        <ellipse
          cx={viewW / 2}
          cy={viewH / 2}
          rx={viewW / 2}
          ry={viewH / 2}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          vectorEffect="non-scaling-stroke"
        />
      ) : (
        <rect
          x={strokeWidth / 2}
          y={strokeWidth / 2}
          width={Math.max(0, viewW - strokeWidth)}
          height={Math.max(0, viewH - strokeWidth)}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}

function ColorField({ uiScale, label, value, onChange, allowTransparent = true }) {
  const swatch = value === "transparent" ? "transparent" : value || "#000000";
  return (
    <label
      className="block font-medium neu-text-muted"
      style={{ fontSize: uiScale * 2.8 }}
    >
      {label}
      <div className="mt-1 flex items-center gap-2">
        <input
          type="color"
          value={swatch === "transparent" ? "#ffffff" : swatch}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-10 shrink-0 cursor-pointer rounded-[var(--radius-sm)] border border-[var(--border)] bg-transparent p-0.5"
          aria-label={`${label} color`}
        />
        {allowTransparent ? (
          <button
            type="button"
            onClick={() => onChange(value === "transparent" ? "#000000" : "transparent")}
            className={`neu-btn flex-1 px-2 py-1.5 text-[10px] font-semibold ${value === "transparent" ? "neu-chip-active" : ""}`}
          >
            {value === "transparent" ? "Transparent" : "Set transparent"}
          </button>
        ) : (
          <span className="min-w-0 flex-1 truncate text-[10px] tabular-nums neu-text-muted">{swatch}</span>
        )}
      </div>
    </label>
  );
}

function SidebarGroup({ label, children }) {
  return (
    <div className="space-y-2">
      <p className="px-1 text-[10px] font-semibold uppercase tracking-wider neu-text-muted">{label}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function AccordionSection({ id, title, icon: Icon, summary, open, onToggle, children }) {
  return (
    <section className="overflow-hidden rounded-[var(--radius)] neu-panel">
      <button
        type="button"
        onClick={() => onToggle(open ? "" : id)}
        aria-expanded={open}
        className="neu-hover-inset flex w-full items-center gap-3 px-3 py-3 text-left transition"
      >
        <span
          className="neu-icon-badge flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)]"
          aria-hidden
        >
          <Icon className="h-4 w-4" strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold neu-text-strong">{title}</span>
          {summary ? <span className="block truncate text-xs neu-text-muted">{summary}</span> : null}
        </span>
        <FiChevronDown
          className={`h-4 w-4 shrink-0 neu-text-muted transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open ? <div className="neu-divider p-3 pt-4">{children}</div> : null}
    </section>
  );
}

function propertiesIconSize(uiScale) {
  return uiScale * 4;
}

function propertiesControlStyle(uiScale) {
  const s = uiScale;
  return {
    fontSize: s * 3.2,
    padding: `${s * 1.2}px ${s * 1.6}px`,
    gap: s * 1.2,
    borderRadius: s * 1.6,
  };
}

function ElementProperties({ element, artboard, onChange, onReorder, onDelete, uiScale = 1 }) {
  const icon = propertiesIconSize(uiScale);
  const ctrl = propertiesControlStyle(uiScale);
  const gap = uiScale * 2;
  const sectionGap = uiScale * 3;
  const locked = !!element.lockAspectRatio;
  const lockDisabled = !!element.aspectRatioLockDisabled;
  const baseRatio = elementAspectRatio(element);

  const applySize = (patch) => {
    onChange(patchSizeKeepingAspect(element, patch, artboard));
  };

  const handleResetRatio = () => {
    // Restore the "natural" ratio (as represented by current element ratio if
    // we don't have an explicit base). We keep width and solve for height.
    const ratio = element.naturalWidth && element.naturalHeight
      ? element.naturalWidth / Math.max(1e-6, element.naturalHeight)
      : baseRatio;
    const nextHeight = Math.max(5, element.width / Math.max(1e-6, ratio));
    const nextWidth = Math.max(5, nextHeight * ratio);
    onChange({
      width: nextWidth,
      height: nextHeight,
      lockAspectRatio: true,
      aspectRatioLockDisabled: false,
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: sectionGap }}>
      {element.type === "shape" ? (
        <>
          <ColorField
            uiScale={uiScale}
            label="Fill"
            value={element.fill}
            onChange={(fill) => onChange({ fill })}
            allowTransparent={element.shapeKind !== "line"}
          />
          <ColorField
            uiScale={uiScale}
            label="Stroke"
            value={element.stroke}
            onChange={(stroke) => onChange({ stroke })}
            allowTransparent={false}
          />
          <NumField
            uiScale={uiScale}
            label="Stroke width (mm)"
            value={element.strokeWidth ?? 0.5}
            min={0}
            onChange={(v) => onChange({ strokeWidth: Math.max(0, v) })}
          />
        </>
      ) : null}

      <div className="grid grid-cols-2" style={{ gap }}>
        <NumField
          uiScale={uiScale}
          label="Width (mm)"
          value={element.width}
          min={1}
          onChange={(v) => applySize({ width: Math.max(1, v) })}
        />
        <NumField
          uiScale={uiScale}
          label="Height (mm)"
          value={element.height}
          min={1}
          onChange={(v) => applySize({ height: Math.max(1, v) })}
        />
      </div>

      {lockDisabled ? (
        <button
          type="button"
          onClick={handleResetRatio}
          className="neu-btn inline-flex w-full items-center justify-center font-medium"
          style={ctrl}
          title={
            element.type === "image"
              ? "Reset the image back to its original aspect ratio"
              : "Reset to the current aspect ratio"
          }
        >
          Reset ratio
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onChange({ lockAspectRatio: !locked })}
          aria-pressed={locked}
          title="Keep width and height proportional in the panel; corner handles lock ratio unless Shift is held"
          className={`inline-flex w-full items-center justify-between font-medium transition ${locked ? "neu-chip-active" : "neu-chip neu-hover-inset"
            }`}
          style={ctrl}
        >
          <span className="inline-flex items-center" style={{ gap: ctrl.gap }}>
            {locked ? (
              <FiLock style={{ width: icon, height: icon, flexShrink: 0 }} />
            ) : (
              <FiUnlock style={{ width: icon, height: icon, flexShrink: 0 }} />
            )}
            Lock aspect ratio
          </span>
          <span
            className={`font-semibold uppercase tracking-wide ${locked ? "neu-chip-active" : "neu-inset neu-text-muted"
              }`}
            style={{
              borderRadius: uiScale * 1.2,
              padding: `${uiScale * 0.5}px ${uiScale * 1.2}px`,
              fontSize: uiScale * 2.8,
            }}
          >
            {locked ? "On" : "Off"}
          </span>
        </button>
      )}

      <div>
        <p
          className="font-semibold uppercase tracking-wide neu-text-muted"
          style={{ marginBottom: uiScale * 1.5, fontSize: uiScale * 2.8 }}
        >
          Layer {element.layer}
        </p>
        <div className="flex items-center" style={{ gap }}>
          <button
            type="button"
            onClick={() => onReorder("up")}
            className="neu-btn inline-flex flex-1 items-center justify-center font-medium"
            style={ctrl}
            title="Bring forward"
          >
            <FiChevronUp style={{ width: icon, height: icon, flexShrink: 0 }} />
            Forward
          </button>
          <button
            type="button"
            onClick={() => onReorder("down")}
            className="neu-btn inline-flex flex-1 items-center justify-center font-medium"
            style={ctrl}
            title="Send backward"
          >
            <FiChevronDown style={{ width: icon, height: icon, flexShrink: 0 }} />
            Backward
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="neu-danger-btn inline-flex items-center justify-center font-medium"
            style={ctrl}
            title="Delete (Del / Backspace)"
            aria-label="Delete element"
          >
            <FiTrash2 style={{ width: icon, height: icon, flexShrink: 0 }} />
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onChange({ cutLine: !element.cutLine })}
        aria-pressed={!!element.cutLine}
        title="Toggle 0.5pt cutting line"
        className={`inline-flex w-full items-center justify-between font-medium transition ${element.cutLine ? "neu-chip-active" : "neu-chip neu-hover-inset"
          }`}
        style={ctrl}
      >
        <span className="inline-flex items-center" style={{ gap: ctrl.gap }}>
          <FiScissors style={{ width: icon, height: icon, flexShrink: 0 }} />
          Cutting line · 0.5pt
        </span>
        <span
          className={`font-semibold uppercase tracking-wide ${element.cutLine ? "neu-chip-active" : "neu-inset neu-text-muted"
            }`}
          style={{
            borderRadius: uiScale * 1.2,
            padding: `${uiScale * 0.5}px ${uiScale * 1.2}px`,
            fontSize: uiScale * 2.8,
          }}
        >
          {element.cutLine ? "On" : "Off"}
        </span>
      </button>
    </div>
  );
}

function uniformDimensionMm(elements, key) {
  if (elements.length === 0) return null;
  const first = elements[0][key];
  const same = elements.every((el) => Math.abs(el[key] - first) < 0.01);
  return same ? first : null;
}

function MultiSelectionPanel({
  count,
  uniformWidth,
  uniformHeight,
  onSetUniformSize,
  allCutLineOn,
  onToggleCutLine,
  allAspectLocked,
  onToggleLockAspect,
  onDuplicate,
  onDelete,
  uiScale = 1,
}) {
  const icon = propertiesIconSize(uiScale);
  const ctrl = propertiesControlStyle(uiScale);
  const gap = uiScale * 2;
  const sectionGap = uiScale * 3;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: sectionGap }}>
      <div>
        <p
          className="font-semibold uppercase tracking-wide neu-text-muted"
          style={{ marginBottom: uiScale * 1.5, fontSize: uiScale * 2.8 }}
        >
          Size · all {count} selected
        </p>
        <div className="grid grid-cols-2" style={{ gap }}>
          <NumField
            uiScale={uiScale}
            label="Width (mm)"
            value={uniformWidth}
            placeholder="Mixed"
            min={5}
            onChange={(v) => onSetUniformSize({ width: Math.max(5, v) })}
          />
          <NumField
            uiScale={uiScale}
            label="Height (mm)"
            value={uniformHeight}
            placeholder="Mixed"
            min={5}
            onChange={(v) => onSetUniformSize({ height: Math.max(5, v) })}
          />
        </div>
        <p className="neu-text-muted" style={{ marginTop: uiScale * 1.5, fontSize: uiScale * 2.8 }}>
          Sets every selected image to the same dimensions. Use the group handles on the artboard to
          scale together.
        </p>
      </div>

      <p className="leading-relaxed neu-text-muted" style={{ fontSize: uiScale * 3.2 }}>
        Drag any selected item to move the group. Shift-click to toggle, Esc to clear,
        Ctrl/Cmd+A to select all.
      </p>
      <button
        type="button"
        onClick={onToggleLockAspect}
        aria-pressed={allAspectLocked}
        className={`inline-flex w-full items-center justify-between font-medium transition ${allAspectLocked ? "neu-chip-active" : "neu-chip neu-hover-inset"
          }`}
        style={ctrl}
      >
        <span className="inline-flex items-center" style={{ gap: ctrl.gap }}>
          {allAspectLocked ? (
            <FiLock style={{ width: icon, height: icon, flexShrink: 0 }} />
          ) : (
            <FiUnlock style={{ width: icon, height: icon, flexShrink: 0 }} />
          )}
          Lock aspect ratio
        </span>
        <span
          className={`font-semibold uppercase tracking-wide ${allAspectLocked ? "neu-chip-active" : "neu-inset neu-text-muted"
            }`}
          style={{
            borderRadius: uiScale * 1.2,
            padding: `${uiScale * 0.5}px ${uiScale * 1.2}px`,
            fontSize: uiScale * 2.8,
          }}
        >
          {allAspectLocked ? "On" : "Off"}
        </span>
      </button>
      <button
        type="button"
        onClick={onToggleCutLine}
        aria-pressed={allCutLineOn}
        className={`inline-flex w-full items-center justify-between font-medium transition ${allCutLineOn ? "neu-chip-active" : "neu-chip neu-hover-inset"
          }`}
        style={ctrl}
      >
        <span className="inline-flex items-center" style={{ gap: ctrl.gap }}>
          <FiScissors style={{ width: icon, height: icon, flexShrink: 0 }} />
          Cutting line · 0.5pt
        </span>
        <span
          className={`font-semibold uppercase tracking-wide ${allCutLineOn ? "neu-chip-active" : "neu-inset neu-text-muted"
            }`}
          style={{
            borderRadius: uiScale * 1.2,
            padding: `${uiScale * 0.5}px ${uiScale * 1.2}px`,
            fontSize: uiScale * 2.8,
          }}
        >
          {allCutLineOn ? "On" : "Off"}
        </span>
      </button>
      <div className="flex items-center" style={{ gap }}>
        <button
          type="button"
          onClick={onDuplicate}
          className="neu-btn inline-flex flex-1 items-center justify-center font-medium"
          style={ctrl}
          title="Duplicate selection (Ctrl/Cmd+D)"
        >
          <FiCopy style={{ width: icon, height: icon, flexShrink: 0 }} />
          Duplicate
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="neu-danger-btn inline-flex items-center justify-center font-medium"
          style={ctrl}
          title="Delete selection (Del / Backspace)"
          aria-label="Delete selection"
        >
          <FiTrash2 style={{ width: icon, height: icon, flexShrink: 0 }} />
        </button>
      </div>
    </div>
  );
}

function NumField({ label, value, onChange, min, uiScale = 1, placeholder = "" }) {
  const s = uiScale;
  const display =
    value == null || !Number.isFinite(value) ? "" : String(Math.round(value * 100) / 100);
  return (
    <label className="font-medium neu-text-muted" style={{ fontSize: s * 3.5 }}>
      {label}
      <input
        type="number"
        min={min}
        value={display}
        placeholder={placeholder}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
        className={inputClass}
        style={{
          marginTop: s * 1,
          padding: `${s * 1.2}px ${s * 1.5}px`,
          fontSize: s * 3.2,
          borderRadius: s * 1.6,
          width: "100%",
        }}
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
  } else if (mode.startsWith("resize-")) {
    const minSize = 5;

    if (mode === "resize-se") {
      // Only right and bottom edges move with the SE handle.
      const candX = [{ offset: 0, value: box.x + box.width }];
      const candY = [{ offset: 0, value: box.y + box.height }];
      const bestX = pickBest(candX, targetsX);
      if (bestX) {
        result.width = Math.max(minSize, bestX.target - box.x);
        guides.xs.push(bestX.target);
      }
      const bestY = pickBest(candY, targetsY);
      if (bestY) {
        result.height = Math.max(minSize, bestY.target - box.y);
        guides.ys.push(bestY.target);
      }
    } else if (mode === "resize-nw") {
      // Left + top edges move; bottom-right stays fixed.
      const candX = [{ offset: 0, value: box.x }];
      const candY = [{ offset: 0, value: box.y }];
      const bestX = pickBest(candX, targetsX);
      if (bestX) {
        const right = box.x + box.width;
        result.x = bestX.target;
        result.width = Math.max(minSize, right - result.x);
        guides.xs.push(bestX.target);
      }
      const bestY = pickBest(candY, targetsY);
      if (bestY) {
        const bottom = box.y + box.height;
        result.y = bestY.target;
        result.height = Math.max(minSize, bottom - result.y);
        guides.ys.push(bestY.target);
      }
    } else if (mode === "resize-ne") {
      // Right + top edges move; bottom-left stays fixed.
      const candX = [{ offset: 0, value: box.x + box.width }];
      const candY = [{ offset: 0, value: box.y }];
      const bestX = pickBest(candX, targetsX);
      if (bestX) {
        result.width = Math.max(minSize, bestX.target - box.x);
        guides.xs.push(bestX.target);
      }
      const bestY = pickBest(candY, targetsY);
      if (bestY) {
        const bottom = box.y + box.height;
        result.y = bestY.target;
        result.height = Math.max(minSize, bottom - result.y);
        guides.ys.push(bestY.target);
      }
    } else if (mode === "resize-sw") {
      // Left + bottom edges move; top-right stays fixed.
      const candX = [{ offset: 0, value: box.x }];
      const candY = [{ offset: 0, value: box.y + box.height }];
      const bestX = pickBest(candX, targetsX);
      if (bestX) {
        const right = box.x + box.width;
        result.x = bestX.target;
        result.width = Math.max(minSize, right - result.x);
        guides.xs.push(bestX.target);
      }
      const bestY = pickBest(candY, targetsY);
      if (bestY) {
        result.height = Math.max(minSize, bestY.target - box.y);
        guides.ys.push(bestY.target);
      }
    } else if (mode === "resize-e") {
      const candX = [{ offset: 0, value: box.x + box.width }];
      const bestX = pickBest(candX, targetsX);
      if (bestX) {
        result.width = Math.max(minSize, bestX.target - box.x);
        guides.xs.push(bestX.target);
      }
    } else if (mode === "resize-w") {
      const candX = [{ offset: 0, value: box.x }];
      const bestX = pickBest(candX, targetsX);
      if (bestX) {
        const right = box.x + box.width;
        result.x = bestX.target;
        result.width = Math.max(minSize, right - result.x);
        guides.xs.push(bestX.target);
      }
    } else if (mode === "resize-s") {
      const candY = [{ offset: 0, value: box.y + box.height }];
      const bestY = pickBest(candY, targetsY);
      if (bestY) {
        result.height = Math.max(minSize, bestY.target - box.y);
        guides.ys.push(bestY.target);
      }
    } else if (mode === "resize-n") {
      const candY = [{ offset: 0, value: box.y }];
      const bestY = pickBest(candY, targetsY);
      if (bestY) {
        const bottom = box.y + box.height;
        result.y = bestY.target;
        result.height = Math.max(minSize, bottom - result.y);
        guides.ys.push(bestY.target);
      }
    }
  }

  return { box: result, guides };
}

function artboardSurfaceStyles(artboard) {
  if (artboard.background && artboard.background !== "transparent") {
    return { backgroundColor: artboard.background, backgroundImage: "none" };
  }
  const light = "var(--artboard-checker-light)";
  const dark = "var(--artboard-checker-dark)";
  return {
    backgroundColor: light,
    backgroundImage: `linear-gradient(45deg, ${dark} 25%, transparent 25%), linear-gradient(-45deg, ${dark} 25%, transparent 25%), linear-gradient(45deg, transparent 75%, ${dark} 75%), linear-gradient(-45deg, transparent 75%, ${dark} 75%)`,
    backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
    backgroundSize: "16px 16px",
  };
}

const MIN_VIEW_ZOOM = 0.25;
const MAX_VIEW_ZOOM = 8;
const ZOOM_WHEEL_FACTOR = 1.08;

function isEditableTarget(target) {
  const tag = (target?.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable;
}

function blurNonEditableFocus() {
  const active = document.activeElement;
  if (active && active !== document.body && !isEditableTarget(active)) {
    active.blur();
  }
}

function isAltModifierKey(e) {
  return e.code === "AltLeft" || e.code === "AltRight" || e.key === "Alt";
}

function suppressBrowserAltChrome(e) {
  if (isEditableTarget(e.target)) return false;
  if (!isAltModifierKey(e)) return false;
  e.preventDefault();
  e.stopPropagation();
  return true;
}

function clientPointToArtboardMm(clientX, clientY, containerEl, artboard, displayScale, pan) {
  const rect = containerEl.getBoundingClientRect();
  const mx = clientX - rect.left;
  const my = clientY - rect.top;
  const boardW = artboard.width * displayScale;
  const boardH = artboard.height * displayScale;
  const boardLeft = (rect.width - boardW) / 2 + pan.x;
  const boardTop = (rect.height - boardH) / 2 + pan.y;
  return {
    x: (mx - boardLeft) / displayScale,
    y: (my - boardTop) / displayScale,
  };
}

function isLibraryDragEvent(e) {
  return [...(e.dataTransfer?.types ?? [])].includes(LIBRARY_DRAG_MIME);
}

function ArtboardStage({
  artboard,
  elements,
  selectedIds,
  setSelectedIds,
  patchElement,
  patchElements,
  updateElement,
  updateSelected,
  resizeSelectedToUniformSize,
  removeElement,
  removeSelected,
  duplicateSelectedInPlace,
  duplicateElements,
  copyElements,
  removeElements,
  toggleCutLineForElements,
  toggleLockAspectRatioForElements,
  reorderLayer,
  pushUndoSnapshot,
  snapEnabled,
  viewport,
  setViewport,
  placeFromLibrary,
  onLibraryDragOverChange,
}) {
  const containerRef = useRef(null);
  const boardRef = useRef(null);
  const [fitScale, setFitScale] = useState(1);
  const pan = viewport.pan;
  const viewZoom = viewport.viewZoom;
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [guides, setGuides] = useState({ xs: [], ys: [] });
  const [marquee, setMarquee] = useState(null); // { x, y, w, h } in mm during marquee drag
  const [contextMenu, setContextMenu] = useState(null); // { x, y, elementId, targetIds }
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const wheelVelocityRef = useRef({ x: 0, y: 0 }); // px / frame impulse (smoothed in rAF)
  const wheelRafRef = useRef(0);
  const wheelLastTsRef = useRef(0);

  const displayScale = fitScale * viewZoom;
  const panRef = useRef(pan);
  panRef.current = pan;
  const fitScaleRef = useRef(fitScale);
  fitScaleRef.current = fitScale;
  const viewZoomRef = useRef(viewZoom);
  viewZoomRef.current = viewZoom;
  const spaceHeldRef = useRef(false);
  const panDragRef = useRef(null);

  const setPan = useCallback(
    (next) => {
      setViewport((prev) => ({
        ...prev,
        pan: typeof next === "function" ? next(prev.pan) : next,
      }));
    },
    [setViewport]
  );

  const setViewZoom = useCallback(
    (next) => {
      setViewport((prev) => ({
        ...prev,
        viewZoom: typeof next === "function" ? next(prev.viewZoom) : next,
      }));
    },
    [setViewport]
  );

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
  const scaleRef = useRef(displayScale);
  scaleRef.current = displayScale;
  const snapEnabledRef = useRef(snapEnabled);
  snapEnabledRef.current = snapEnabled;
  const artboardRef = useRef(artboard);
  artboardRef.current = artboard;

  useEffect(() => {
    const releaseSpace = () => {
      spaceHeldRef.current = false;
      setSpaceHeld(false);
      panDragRef.current = null;
      setIsPanning(false);
    };

    const onKeyDown = (e) => {
      if (isEditableTarget(e.target)) return;
      if (suppressBrowserAltChrome(e)) return;
      if (e.code !== "Space" || e.repeat) return;
      e.preventDefault();
      e.stopPropagation();
      blurNonEditableFocus();
      spaceHeldRef.current = true;
      setSpaceHeld(true);
      containerRef.current?.focus({ preventScroll: true });
    };

    const onKeyUp = (e) => {
      if (isEditableTarget(e.target)) return;
      if (suppressBrowserAltChrome(e)) return;
      if (e.code !== "Space") return;
      e.preventDefault();
      e.stopPropagation();
      releaseSpace();
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("keyup", onKeyUp, { capture: true });
    window.addEventListener("blur", releaseSpace);
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("keyup", onKeyUp, { capture: true });
      window.removeEventListener("blur", releaseSpace);
    };
  }, []);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const zoomAtPoint = (clientX, clientY, deltaY) => {
      const rect = node.getBoundingClientRect();
      const mx = clientX - rect.left;
      const my = clientY - rect.top;
      const fit = fitScaleRef.current;
      const prevZoom = viewZoomRef.current;
      const factor = deltaY < 0 ? ZOOM_WHEEL_FACTOR : 1 / ZOOM_WHEEL_FACTOR;
      const nextZoom = clamp(prevZoom * factor, MIN_VIEW_ZOOM, MAX_VIEW_ZOOM);
      if (Math.abs(nextZoom - prevZoom) < 1e-6) return;

      const board = artboardRef.current;
      const prevScale = fit * prevZoom;
      const boardW = board.width * prevScale;
      const boardH = board.height * prevScale;
      const boardLeft = (rect.width - boardW) / 2 + panRef.current.x;
      const boardTop = (rect.height - boardH) / 2 + panRef.current.y;

      const mmX = (mx - boardLeft) / prevScale;
      const mmY = (my - boardTop) / prevScale;

      const nextScale = fit * nextZoom;
      const newBoardW = board.width * nextScale;
      const newBoardH = board.height * nextScale;
      const newBoardLeft = mx - mmX * nextScale;
      const newBoardTop = my - mmY * nextScale;

      setViewZoom(nextZoom);
      setPan({
        x: newBoardLeft - (rect.width - newBoardW) / 2,
        y: newBoardTop - (rect.height - newBoardH) / 2,
      });
    };

    const onWheel = (e) => {
      if (isEditableTarget(e.target)) return;

      // Alt+wheel zoom (existing behavior).
      if (e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        zoomAtPoint(e.clientX, e.clientY, e.deltaY);
        return;
      }

      // Don't hijack browser zoom / OS-level gestures.
      if (e.ctrlKey || e.metaKey) return;

      // Normal wheel pans vertically; Shift+wheel pans horizontally.
      // Trackpads can emit both deltaX and deltaY; we keep deltaX unless Shift is held.
      const rawX = e.deltaX || 0;
      const rawY = e.deltaY || 0;
      const dx = e.shiftKey ? rawY : rawX;
      const dy = e.shiftKey ? 0 : rawY;

      if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return;

      e.preventDefault();
      e.stopPropagation();

      // Softer movement: accumulate wheel impulses into a short inertial glide.
      // Keep this subtle so the workspace still feels precise.
      const IMPULSE = 0.55; // < 1 = softer / slower per wheel tick
      wheelVelocityRef.current.x += -dx * IMPULSE;
      wheelVelocityRef.current.y += -dy * IMPULSE;

      if (wheelRafRef.current) return;
      wheelLastTsRef.current = 0;

      const step = (ts) => {
        const last = wheelLastTsRef.current || ts;
        wheelLastTsRef.current = ts;
        // Normalize to 60fps-ish frames so decay feels consistent.
        const dt = Math.min(32, Math.max(8, ts - last));
        const frame = dt / 16.67;

        const v = wheelVelocityRef.current;

        // Apply movement (proportional to dt).
        const moveX = v.x * frame;
        const moveY = v.y * frame;
        if (Math.abs(moveX) > 0.01 || Math.abs(moveY) > 0.01) {
          setPan((prev) => ({ x: prev.x + moveX, y: prev.y + moveY }));
        }

        // Exponential decay.
        const DECAY = 0.82; // smaller = stops sooner; larger = more glide
        v.x *= Math.pow(DECAY, frame);
        v.y *= Math.pow(DECAY, frame);

        if (Math.abs(v.x) < 0.15 && Math.abs(v.y) < 0.15) {
          wheelVelocityRef.current = { x: 0, y: 0 };
          wheelRafRef.current = 0;
          wheelLastTsRef.current = 0;
          return;
        }

        wheelRafRef.current = requestAnimationFrame(step);
      };

      wheelRafRef.current = requestAnimationFrame(step);
    };

    node.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      node.removeEventListener("wheel", onWheel);
      if (wheelRafRef.current) cancelAnimationFrame(wheelRafRef.current);
      wheelRafRef.current = 0;
      wheelLastTsRef.current = 0;
      wheelVelocityRef.current = { x: 0, y: 0 };
    };
  }, []);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      const padding = 32;
      const maxW = Math.max(100, rect.width - padding);
      const maxH = Math.max(100, rect.height - padding);
      const s = Math.min(maxW / artboard.width, maxH / artboard.height);
      setFitScale(Number.isFinite(s) && s > 0 ? s : 1);
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

  const boardPxW = artboard.width * displayScale;
  const boardPxH = artboard.height * displayScale;

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedElements = useMemo(
    () => elements.filter((el) => selectedSet.has(el.id)),
    [elements, selectedSet]
  );
  const singleSelected = selectedElements.length === 1 ? selectedElements[0] : null;

  const selectionBounds = useMemo(() => {
    if (selectedElements.length < 2) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const el of selectedElements) {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + el.width);
      maxY = Math.max(maxY, el.y + el.height);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }, [selectedElements]);

  const selectionOverlayZ = useMemo(() => {
    if (selectedElements.length < 2) return 0;
    return Math.max(...selectedElements.map((el) => el.layer)) + 2;
  }, [selectedElements]);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const closePropertiesPanel = useCallback(() => setPropertiesOpen(false), []);
  /** Top-left position in workspace pixels; null = default beside the artboard */
  const [propertiesAnchorPx, setPropertiesAnchorPx] = useState(null);

  const openPropertiesPanel = useCallback(() => {
    setContextMenu(null);
    setPropertiesAnchorPx(null);
    setPropertiesOpen(true);
  }, []);

  const openElementContextMenu = useCallback(
    (elementId, e) => {
      if (spaceHeldRef.current) return;
      e.preventDefault();
      e.stopPropagation();

      const current = selectedIdsRef.current;
      const inSel = current.includes(elementId);
      const targetIds = inSel ? current : [elementId];
      if (!inSel) setSelectedIds([elementId]);

      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        elementId,
        targetIds,
      });
    },
    [setSelectedIds]
  );

  const runMenuAction = useCallback((action) => {
    action();
    setContextMenu(null);
  }, []);

  // Called by each ElementView at pointerdown. Updates the selection based on
  // modifier keys, handles Alt-duplicate, and snapshots origins for the drag.
  // Returns true if the caller should begin a drag.
  const beginElementDrag = useCallback(
    (id, e, mode) => {
      if (spaceHeldRef.current) return false;

      const shift = e.shiftKey;
      const mod = e.metaKey || e.ctrlKey;
      const current = selectedIdsRef.current;
      const inSel = current.includes(id);

      let nextSelection;
      if (mode.startsWith("resize-")) {
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
      const willDuplicate = e.altKey && mode === "move";
      if (!willDuplicate) {
        pushUndoSnapshot();
      }
      if (willDuplicate) {
        duplicateSelectedInPlace();
      }

      const idsToDrag = mode.startsWith("resize-") ? [id] : nextSelection;
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
    [duplicateSelectedInPlace, pushUndoSnapshot, setSelectedIds]
  );

  const beginGroupResize = useCallback(
    (e, mode) => {
      if (spaceHeldRef.current) return false;
      const ids = selectedIdsRef.current;
      if (ids.length < 2) return false;

      pushUndoSnapshot();
      const idSet = new Set(ids);
      const origins = {};
      for (const el of elementsRef.current) {
        if (idSet.has(el.id)) {
          origins[el.id] = { x: el.x, y: el.y, width: el.width, height: el.height };
        }
      }
      dragOriginsRef.current = {
        ids,
        origins,
        primaryId: ids[0],
        mode,
        groupBounds: selectionBoundsFromOrigins(origins),
      };
      return true;
    },
    [pushUndoSnapshot]
  );

  const patchElementRef = useRef(patchElement);
  patchElementRef.current = patchElement;
  const patchElementsRef = useRef(patchElements);
  patchElementsRef.current = patchElements;

  const markGroupAspectBroken = useCallback((ids) => {
    const updates = {};
    for (const elId of ids) {
      const el = elementsRef.current.find((item) => item.id === elId);
      if (el?.lockAspectRatio && !el.aspectRatioLockDisabled) {
        updates[elId] = { lockAspectRatio: false, aspectRatioLockDisabled: true };
      }
    }
    if (Object.keys(updates).length > 0) {
      patchElementsRef.current(updates);
    }
  }, []);

  const handleDragMoveDelta = useCallback((id, dxMm, dyMm, mode, shiftKey = false) => {
    const d = dragOriginsRef.current;
    if (!d) return;
    const board = artboardRef.current;

    if (mode === "__mark-aspect-broken__") {
      patchElementRef.current(id, { lockAspectRatio: false, aspectRatioLockDisabled: true });
      return;
    }

    if (mode.startsWith("resize-")) {
      const { ids, origins, groupBounds } = d;
      const lockAspect = shouldLockAspectOnResize(mode, shiftKey);

      if (ids.length > 1 && groupBounds) {
        const newBounds = computeResizedBox(groupBounds, dxMm, dyMm, mode, board, {
          lockAspectRatio: lockAspect,
        });
        let box = newBounds;
        if (snapEnabledRef.current) {
          const idSet = new Set(ids);
          const others = elementsRef.current.filter((el) => !idSet.has(el.id));
          const thresholdMm = SNAP_THRESHOLD_PX / Math.max(scaleRef.current, 0.001);
          const res = applySnap(newBounds, mode, board, others, thresholdMm);
          setGuides(res.guides);
          box = res.box;
        } else {
          setGuides({ xs: [], ys: [] });
        }
        patchElementsRef.current(applyGroupResizeToOrigins(origins, groupBounds, box, mode));
        return;
      }

      const origin = origins[id];
      if (!origin) return;
      const box = computeResizedBox(origin, dxMm, dyMm, mode, board, {
        lockAspectRatio: lockAspect,
      });

      if (snapEnabledRef.current) {
        const others = elementsRef.current.filter((item) => item.id !== id);
        const thresholdMm = SNAP_THRESHOLD_PX / Math.max(scaleRef.current, 0.001);
        const res = applySnap(box, mode, board, others, thresholdMm);
        setGuides(res.guides);
        patchElementRef.current(id, {
          x: res.box.x,
          y: res.box.y,
          width: res.box.width,
          height: res.box.height,
        });
      } else {
        setGuides({ xs: [], ys: [] });
        patchElementRef.current(id, { x: box.x, y: box.y, width: box.width, height: box.height });
      }
      return;
    }

    // move — possibly a group drag
    const { ids, origins, primaryId } = d;

    let cdx = dxMm;
    let cdy = dyMm;

    // Snap using the primary (grabbed) element's bounds; others follow by the same delta.
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
      }
    }
    setGuides(guideLines);

    const updates = {};
    for (const aid of ids) {
      const o = origins[aid];
      updates[aid] = { x: o.x + cdx, y: o.y + cdy };
    }
    patchElementsRef.current(updates);
  }, []);

  const handleDragEnd = useCallback(() => {
    dragOriginsRef.current = null;
    setGuides({ xs: [], ys: [] });
  }, []);

  // ---- Marquee selection across the workspace frame (including outside the artboard) ----
  const pointToMm = useCallback((clientX, clientY) => {
    const node = boardRef.current;
    if (!node) return { x: 0, y: 0 };
    const rect = node.getBoundingClientRect();
    const s = scaleRef.current;
    return {
      x: (clientX - rect.left) / s,
      y: (clientY - rect.top) / s,
    };
  }, []);

  const updateMarqueeSelection = useCallback(
    (startX, startY, cx, cy, additive, baseSelection) => {
      const x = Math.min(startX, cx);
      const y = Math.min(startY, cy);
      const w = Math.abs(cx - startX);
      const h = Math.abs(cy - startY);
      setMarquee({ x, y, w, h });

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
      if (additive) {
        const combined = new Set(baseSelection);
        for (const id of hit) combined.add(id);
        setSelectedIds(Array.from(combined));
      } else {
        setSelectedIds(hit);
      }
    },
    [setSelectedIds]
  );

  const startMarquee = useCallback(
    (e) => {
      if (spaceHeldRef.current || e.button !== 0) return;
      e.preventDefault();
      window.getSelection()?.removeAllRanges();
      const additive = e.shiftKey || e.metaKey || e.ctrlKey;
      if (!additive) setSelectedIds([]);
      const { x, y } = pointToMm(e.clientX, e.clientY);
      marqueeStateRef.current = {
        startX: x,
        startY: y,
        additive,
        baseSelection: additive ? [...selectedIdsRef.current] : [],
        pointerId: e.pointerId,
      };
      setMarquee({ x, y, w: 0, h: 0 });
      try {
        containerRef.current?.setPointerCapture(e.pointerId);
      } catch {
        // ignore capture errors
      }
    },
    [pointToMm, setSelectedIds]
  );

  const onMarqueePointerMove = useCallback(
    (e) => {
      const m = marqueeStateRef.current;
      if (!m || m.pointerId !== e.pointerId) return;
      const { x: cx, y: cy } = pointToMm(e.clientX, e.clientY);
      updateMarqueeSelection(m.startX, m.startY, cx, cy, m.additive, m.baseSelection);
    },
    [pointToMm, updateMarqueeSelection]
  );

  const endMarquee = useCallback((e) => {
    if (!marqueeStateRef.current) return;
    if (e && marqueeStateRef.current.pointerId !== e.pointerId) return;
    try {
      containerRef.current?.releasePointerCapture(e?.pointerId);
    } catch {
      // ignore
    }
    marqueeStateRef.current = null;
    setMarquee(null);
  }, []);

  const startPan = useCallback((e) => {
    e.preventDefault();
    window.getSelection()?.removeAllRanges();
    panDragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: panRef.current.x,
      originY: panRef.current.y,
    };
    setIsPanning(true);
    try {
      containerRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }, []);

  const onPanPointerMove = useCallback((e) => {
    const p = panDragRef.current;
    if (!p || p.pointerId !== e.pointerId) return;
    setPan({
      x: p.originX + (e.clientX - p.startX),
      y: p.originY + (e.clientY - p.startY),
    });
  }, []);

  const endPan = useCallback((e) => {
    if (!panDragRef.current) return;
    if (e && panDragRef.current.pointerId !== e.pointerId) return;
    panDragRef.current = null;
    setIsPanning(false);
    try {
      containerRef.current?.releasePointerCapture(e?.pointerId);
    } catch {
      // ignore
    }
  }, []);

  const panCursor = isPanning ? "cursor-grabbing" : spaceHeld ? "cursor-grab" : "";

  let marqueeBoardOffset = { left: 0, top: 0 };
  if (marquee && containerRef.current && boardRef.current) {
    const containerRect = containerRef.current.getBoundingClientRect();
    const boardRect = boardRef.current.getBoundingClientRect();
    marqueeBoardOffset = {
      left: boardRect.left - containerRect.left,
      top: boardRect.top - containerRect.top,
    };
  }

  const handleLibraryDragOver = useCallback(
    (e) => {
      if (!isLibraryDragEvent(e)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
      onLibraryDragOverChange?.(true);
    },
    [onLibraryDragOverChange]
  );

  const handleLibraryDragLeave = useCallback(
    (e) => {
      if (!isLibraryDragEvent(e)) return;
      const next = e.relatedTarget;
      if (next instanceof Node && e.currentTarget.contains(next)) return;
      onLibraryDragOverChange?.(false);
    },
    [onLibraryDragOverChange]
  );

  const handleLibraryDrop = useCallback(
    (e) => {
      const libraryId = e.dataTransfer.getData(LIBRARY_DRAG_MIME);
      if (!libraryId || !containerRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      onLibraryDragOverChange?.(false);
      const position = clientPointToArtboardMm(
        e.clientX,
        e.clientY,
        containerRef.current,
        artboardRef.current,
        scaleRef.current,
        panRef.current
      );
      placeFromLibrary(libraryId, position);
    },
    [placeFromLibrary, onLibraryDragOverChange]
  );

  useEffect(() => {
    const resetLibraryDrag = () => onLibraryDragOverChange?.(false);
    window.addEventListener("dragend", resetLibraryDrag);
    return () => window.removeEventListener("dragend", resetLibraryDrag);
  }, [onLibraryDragOverChange]);

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      role="application"
      aria-label="Artboard workspace. Scroll to pan, Shift+scroll to pan horizontally, Alt+scroll to zoom. Hold Space to pan with drag."
      className={`dropio-artboard-workspace relative h-full min-h-0 w-full overflow-hidden rounded-[var(--radius-lg)] neu-workspace p-3 outline-none ${panCursor}`}
      onDragOver={handleLibraryDragOver}
      onDragLeave={handleLibraryDragLeave}
      onDrop={handleLibraryDrop}
      onPointerDown={(e) => {
        if (!e.target.closest("[data-artboard-context-menu]")) {
          closeContextMenu();
        }
        e.currentTarget.focus({ preventScroll: true });
        if (spaceHeldRef.current && e.button === 0) {
          startPan(e);
          return;
        }
        startMarquee(e);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
      }}
      onPointerMove={(e) => {
        onPanPointerMove(e);
        onMarqueePointerMove(e);
      }}
      onPointerUp={(e) => {
        endPan(e);
        endMarquee(e);
      }}
      onPointerCancel={(e) => {
        endPan(e);
        endMarquee(e);
      }}
    >
      <div
        className="flex h-full w-full select-none items-center justify-center"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}
      >
        <div
          ref={boardRef}
          className="relative"
          style={{
            width: boardPxW,
            height: boardPxH,
            touchAction: "none",
            overflow: "visible",
          }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-sm neu-artboard-shadow"
            style={artboardSurfaceStyles(artboard)}
          />
          {elements.map((el) => (
            <ElementView
              key={el.id}
              element={el}
              scale={displayScale}
              isSelected={selectedIds.includes(el.id)}
              beginElementDrag={beginElementDrag}
              onDragMove={handleDragMoveDelta}
              onDragEnd={handleDragEnd}
              onContextMenu={openElementContextMenu}
              canShowResizeHandle={selectedIds.length === 1 && selectedIds[0] === el.id}
              panToolActive={spaceHeld}
            />
          ))}
          {selectionBounds && selectedIds.length > 1 ? (
            <SelectionGroupOverlay
              bounds={selectionBounds}
              scale={displayScale}
              zIndex={selectionOverlayZ}
              primaryId={selectedIds[0]}
              selectedIds={selectedIds}
              panToolActive={spaceHeld}
              beginGroupResize={beginGroupResize}
              onDragMove={handleDragMoveDelta}
              onDragEnd={handleDragEnd}
              markGroupAspectBroken={markGroupAspectBroken}
            />
          ) : null}
          <SnapGuides guides={guides} scale={displayScale} boardPxW={boardPxW} boardPxH={boardPxH} />
        </div>
      </div>
      {marquee ? (
        <MarqueeOverlay
          marquee={marquee}
          scale={displayScale}
          boardOffsetPx={marqueeBoardOffset}
        />
      ) : null}
      {contextMenu ? (
        <ElementContextMenu
          menu={contextMenu}
          elements={elements}
          onClose={closeContextMenu}
          onProperties={openPropertiesPanel}
          onDuplicate={() => runMenuAction(() => duplicateElements(contextMenu.targetIds))}
          onCopy={() => runMenuAction(() => copyElements(contextMenu.targetIds))}
          onDelete={() => runMenuAction(() => removeElements(contextMenu.targetIds))}
          onBringForward={() =>
            runMenuAction(() => reorderLayer(contextMenu.elementId, "up"))
          }
          onSendBackward={() =>
            runMenuAction(() => reorderLayer(contextMenu.elementId, "down"))
          }
          onToggleCutLine={() =>
            runMenuAction(() => toggleCutLineForElements(contextMenu.targetIds))
          }
          onToggleLockAspect={() =>
            runMenuAction(() => toggleLockAspectRatioForElements(contextMenu.targetIds))
          }
        />
      ) : null}
      {propertiesOpen ? (
        <ArtboardPropertiesPanel
          boardRef={boardRef}
          containerRef={containerRef}
          anchorPx={propertiesAnchorPx}
          onAnchorPxChange={setPropertiesAnchorPx}
          onClose={closePropertiesPanel}
          title="Properties"
          subtitle={
            selectedElements.length === 0
              ? null
              : singleSelected
                ? singleSelected.name
                : `${selectedElements.length} selected`
          }
          layoutKey={`${pan.x}-${pan.y}-${viewZoom}-${fitScale}-${boardPxW}-${boardPxH}`}
        >
          {selectedElements.length === 0 ? null : singleSelected ? (
            <ElementProperties
              uiScale={PROPERTIES_PANEL_UI_SCALE}
              artboard={artboard}
              element={singleSelected}
              onChange={(patch) => updateElement(singleSelected.id, patch)}
              onReorder={(direction) => reorderLayer(singleSelected.id, direction)}
              onDelete={() => removeElement(singleSelected.id)}
            />
          ) : (
            <MultiSelectionPanel
              uiScale={PROPERTIES_PANEL_UI_SCALE}
              count={selectedElements.length}
              uniformWidth={uniformDimensionMm(selectedElements, "width")}
              uniformHeight={uniformDimensionMm(selectedElements, "height")}
              onSetUniformSize={resizeSelectedToUniformSize}
              allCutLineOn={selectedElements.every((el) => el.cutLine)}
              onToggleCutLine={() => {
                const allOn = selectedElements.every((el) => el.cutLine);
                updateSelected({ cutLine: !allOn });
              }}
              allAspectLocked={selectedElements.every((el) => el.lockAspectRatio)}
              onToggleLockAspect={() =>
                toggleLockAspectRatioForElements(selectedIds)
              }
              onDuplicate={duplicateSelectedInPlace}
              onDelete={removeSelected}
            />
          )}
        </ArtboardPropertiesPanel>
      ) : null}
    </div>
  );
}

function modKeyLabel() {
  if (typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.userAgent)) {
    return "⌘";
  }
  return "Ctrl";
}

const PROPERTIES_PANEL_WIDTH_PX = 240;
const PROPERTIES_PANEL_UI_SCALE = 3.2;
const PROPERTIES_PANEL_GAP_PX = 12;

function defaultPropertiesAnchorPx(boardRect, containerRect, panelWidth, panelHeight) {
  const boardLeft = boardRect.left - containerRect.left;
  const boardTop = boardRect.top - containerRect.top;
  const boardRight = boardLeft + boardRect.width;
  const pad = PROPERTIES_PANEL_GAP_PX;

  let left = boardRight + pad;
  if (left + panelWidth > containerRect.width - pad) {
    left = boardLeft - panelWidth - pad;
  }
  left = Math.max(pad, Math.min(left, containerRect.width - panelWidth - pad));

  let top = boardTop + boardRect.height / 2 - panelHeight / 2;
  top = Math.max(pad, Math.min(top, containerRect.height - panelHeight - pad));

  return { x: left, y: top };
}

function ArtboardPropertiesPanel({
  boardRef,
  containerRef,
  anchorPx,
  onAnchorPxChange,
  onClose,
  title,
  subtitle,
  layoutKey,
  children,
}) {
  const panelRef = useRef(null);
  const dragRef = useRef(null);
  const [position, setPosition] = useState({ left: 0, top: 0, ready: false });
  const [isDragging, setIsDragging] = useState(false);

  const uiScale = PROPERTIES_PANEL_UI_SCALE;
  const panelWidthPx = PROPERTIES_PANEL_WIDTH_PX;
  const pad = uiScale * 3;
  const headerPadY = uiScale * 2.5;
  const headerPadX = uiScale * 3;
  const bodyPad = uiScale * 3;
  const titleSize = uiScale * 3.6;
  const subtitleSize = uiScale * 3.2;
  const closeSize = uiScale * 7;
  const closeIcon = uiScale * 3.5;
  const radius = uiScale * 2.4;

  const resolveAnchorPx = useCallback(() => {
    if (anchorPx) return anchorPx;
    const container = containerRef.current;
    const board = boardRef.current;
    const panel = panelRef.current;
    if (!container || !board) return { x: pad, y: pad };
    const containerRect = container.getBoundingClientRect();
    const boardRect = board.getBoundingClientRect();
    const panelHeight = panel?.offsetHeight ?? 200;
    return defaultPropertiesAnchorPx(containerRect, boardRect, panelWidthPx, panelHeight);
  }, [anchorPx, boardRef, containerRef, pad, panelWidthPx]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const panel = panelRef.current;
    if (!container || !panel) return;

    const anchor = resolveAnchorPx();
    const containerRect = container.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const padPx = pad;

    let left = anchor.x;
    let top = anchor.y;
    left = Math.max(padPx, Math.min(left, containerRect.width - panelRect.width - padPx));
    top = Math.max(padPx, Math.min(top, containerRect.height - panelRect.height - padPx));

    setPosition({ left, top, ready: true });
  }, [anchorPx, boardRef, containerRef, layoutKey, resolveAnchorPx, pad, children]);

  const beginDrag = useCallback(
    (e) => {
      if (e.button !== 0) return;
      if (e.target.closest("button")) return;
      e.preventDefault();
      e.stopPropagation();

      const anchor = resolveAnchorPx();
      dragRef.current = {
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startAnchor: anchor,
      };
      setIsDragging(true);
      panelRef.current?.setPointerCapture(e.pointerId);
    },
    [resolveAnchorPx]
  );

  const onDragMove = useCallback(
    (e) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      e.preventDefault();
      e.stopPropagation();

      onAnchorPxChange({
        x: drag.startAnchor.x + (e.clientX - drag.startClientX),
        y: drag.startAnchor.y + (e.clientY - drag.startClientY),
      });
    },
    [onAnchorPxChange]
  );

  const endDrag = useCallback((e) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (e && drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setIsDragging(false);
    try {
      panelRef.current?.releasePointerCapture(e?.pointerId);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      data-artboard-properties-panel
      className="neu-panel absolute z-40 overflow-hidden shadow-[var(--shadow-md)]"
      style={{
        left: position.left,
        top: position.top,
        width: panelWidthPx,
        visibility: position.ready ? "visible" : "hidden",
        borderRadius: radius,
        touchAction: "none",
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={onDragMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div
        role="toolbar"
        aria-label="Properties panel"
        className="flex items-start justify-between border-b border-[var(--border)]"
        style={{
          padding: `${headerPadY}px ${headerPadX}px`,
          gap: uiScale * 2,
          cursor: isDragging ? "grabbing" : "grab",
        }}
        onPointerDown={beginDrag}
      >
        <div className="min-w-0 flex-1 select-none">
          <p className="font-semibold neu-text-strong" style={{ fontSize: titleSize }}>
            {title}
          </p>
          {subtitle ? (
            <p className="truncate neu-text-muted" style={{ fontSize: subtitleSize }}>
              {subtitle}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          onPointerDown={(e) => e.stopPropagation()}
          className="neu-icon-btn inline-flex shrink-0 items-center justify-center"
          style={{ width: closeSize, height: closeSize, borderRadius: uiScale * 1.6 }}
          aria-label="Close properties"
        >
          <FiX style={{ width: closeIcon, height: closeIcon }} aria-hidden />
        </button>
      </div>
      {children ? <div style={{ padding: bodyPad }}>{children}</div> : null}
    </div>
  );
}

function ElementContextMenu({
  menu,
  elements,
  onClose,
  onProperties,
  onDuplicate,
  onCopy,
  onDelete,
  onBringForward,
  onSendBackward,
  onToggleCutLine,
  onToggleLockAspect,
}) {
  const menuRef = useRef(null);
  const [position, setPosition] = useState({ x: menu.x, y: menu.y });
  const mod = modKeyLabel();
  const count = menu.targetIds.length;
  const suffix = count > 1 ? ` (${count})` : "";
  const targetEls = elements.filter((el) => menu.targetIds.includes(el.id));
  const cutLineOn = targetEls.length > 0 && targetEls.every((el) => el.cutLine);
  const aspectLocked = targetEls.length > 0 && targetEls.every((el) => el.lockAspectRatio);
  const sortedByLayer = useMemo(
    () => [...elements].sort((a, b) => a.layer - b.layer),
    [elements]
  );
  const layerIndex = sortedByLayer.findIndex((el) => el.id === menu.elementId);
  const canBringForward = layerIndex >= 0 && layerIndex < sortedByLayer.length - 1;
  const canSendBackward = layerIndex > 0;

  useLayoutEffect(() => {
    const node = menuRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const pad = 8;
    const x = Math.min(menu.x, window.innerWidth - rect.width - pad);
    const y = Math.min(menu.y, window.innerHeight - rect.height - pad);
    setPosition({ x: Math.max(pad, x), y: Math.max(pad, y) });
  }, [menu.x, menu.y]);

  useEffect(() => {
    const onPointerDown = (e) => {
      if (menuRef.current?.contains(e.target)) return;
      onClose();
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    const onScroll = () => onClose();
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Layout actions"
      data-artboard-context-menu
      className="neu-context-menu fixed z-50 min-w-[200px] overflow-hidden rounded-[var(--radius-sm)] py-1"
      style={{ left: position.x, top: position.y }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <ContextMenuItem icon={FiCopy} label={`Duplicate${suffix}`} shortcut={`${mod}D`} onClick={onDuplicate} />
      <ContextMenuItem icon={FiClipboard} label={`Copy${suffix}`} shortcut={`${mod}C`} onClick={onCopy} />
      <ContextMenuDivider />
      <ContextMenuItem icon={FiSliders} label="Properties" onClick={onProperties} />
      <ContextMenuItem
        icon={aspectLocked ? FiUnlock : FiLock}
        label={aspectLocked ? `Unlock aspect ratio${suffix}` : `Lock aspect ratio${suffix}`}
        onClick={onToggleLockAspect}
      />
      <ContextMenuDivider />
      <ContextMenuItem
        icon={FiChevronUp}
        label="Bring forward"
        onClick={onBringForward}
        disabled={!canBringForward}
      />
      <ContextMenuItem
        icon={FiChevronDown}
        label="Send backward"
        onClick={onSendBackward}
        disabled={!canSendBackward}
      />
      <ContextMenuItem
        icon={FiScissors}
        label={cutLineOn ? `Remove cut line${suffix}` : `Add cut line${suffix}`}
        onClick={onToggleCutLine}
      />
      <ContextMenuDivider />
      <ContextMenuItem icon={FiTrash2} label={`Delete${suffix}`} shortcut="Del" danger onClick={onDelete} />
    </div>
  );
}

function ContextMenuItem({ icon: Icon, label, shortcut, danger, disabled, onClick }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (disabled) return;
        onClick();
      }}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs font-medium transition ${disabled
        ? "cursor-not-allowed text-zinc-300 dark:text-zinc-600"
        : danger
          ? "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
          : "neu-text neu-menu-item"
        }`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {shortcut ? <span className="shrink-0 text-[10px] font-normal neu-text-muted">{shortcut}</span> : null}
    </button>
  );
}

function ContextMenuDivider() {
  return <div className="my-1 neu-divider" role="separator" />;
}

function MarqueeOverlay({ marquee, scale, boardOffsetPx }) {
  return (
    <div
      className="pointer-events-none absolute z-20"
      aria-hidden
      style={{
        left: boardOffsetPx.left + marquee.x * scale,
        top: boardOffsetPx.top + marquee.y * scale,
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

function ResizeHandles({ onPointerDownMode, onPointerMove, onPointerUp, onPointerCancel }) {
  const handleProps = (mode) => ({
    onPointerDown: (e) => onPointerDownMode(mode, e),
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  });
  const corner = {
    width: 12,
    height: 12,
    background: "rgb(59 130 246)",
    border: "2px solid white",
    borderRadius: 3,
    touchAction: "none",
    pointerEvents: "auto",
  };
  const edge = {
    width: 12,
    height: 12,
    background: "rgb(59 130 246)",
    border: "2px solid white",
    borderRadius: 999,
    touchAction: "none",
    pointerEvents: "auto",
  };

  return (
    <>
      <span
        {...handleProps("resize-n")}
        style={{
          position: "absolute",
          left: "50%",
          top: -6,
          transform: "translateX(-50%)",
          cursor: "ns-resize",
          ...edge,
        }}
        aria-label="Resize from top"
      />
      <span
        {...handleProps("resize-s")}
        style={{
          position: "absolute",
          left: "50%",
          bottom: -6,
          transform: "translateX(-50%)",
          cursor: "ns-resize",
          ...edge,
        }}
        aria-label="Resize from bottom"
      />
      <span
        {...handleProps("resize-w")}
        style={{
          position: "absolute",
          top: "50%",
          left: -6,
          transform: "translateY(-50%)",
          cursor: "ew-resize",
          ...edge,
        }}
        aria-label="Resize from left"
      />
      <span
        {...handleProps("resize-e")}
        style={{
          position: "absolute",
          top: "50%",
          right: -6,
          transform: "translateY(-50%)",
          cursor: "ew-resize",
          ...edge,
        }}
        aria-label="Resize from right"
      />
      <span
        {...handleProps("resize-nw")}
        style={{ position: "absolute", left: -6, top: -6, cursor: "nwse-resize", ...corner }}
        aria-label="Resize from top-left"
      />
      <span
        {...handleProps("resize-ne")}
        style={{ position: "absolute", right: -6, top: -6, cursor: "nesw-resize", ...corner }}
        aria-label="Resize from top-right"
      />
      <span
        {...handleProps("resize-sw")}
        style={{ position: "absolute", left: -6, bottom: -6, cursor: "nesw-resize", ...corner }}
        aria-label="Resize from bottom-left"
      />
      <span
        {...handleProps("resize-se")}
        style={{ position: "absolute", right: -6, bottom: -6, cursor: "nwse-resize", ...corner }}
        aria-label="Resize from bottom-right"
      />
    </>
  );
}

function SelectionGroupOverlay({
  bounds,
  scale,
  zIndex,
  primaryId,
  selectedIds,
  panToolActive,
  beginGroupResize,
  onDragMove,
  onDragEnd,
  markGroupAspectBroken,
}) {
  const ref = useRef(null);
  const dragState = useRef(null);

  const onPointerDownResizeWithMode = (mode, e) => {
    if (e.button !== 0) return;
    if (panToolActive) return;
    e.preventDefault();
    e.stopPropagation();
    const started = beginGroupResize(e, mode);
    if (!started) return;
    if (resizeOverridesAspectLock(mode, e.shiftKey)) {
      markGroupAspectBroken(selectedIds);
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    dragState.current = {
      mode,
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
    onDragMove(primaryId, dxMm, dyMm, s.mode, e.shiftKey);
  };

  const endDrag = (e) => {
    const s = dragState.current;
    if (!s) return;
    try {
      s.pointerNode?.releasePointerCapture(s.pointerId ?? e.pointerId);
    } catch {
      // ignore
    }
    dragState.current = null;
    onDragEnd?.();
  };

  return (
    <div
      ref={ref}
      aria-hidden={false}
      style={{
        position: "absolute",
        left: bounds.x * scale,
        top: bounds.y * scale,
        width: bounds.width * scale,
        height: bounds.height * scale,
        zIndex,
        pointerEvents: "none",
        boxShadow: "0 0 0 2px var(--accent)",
        touchAction: "none",
      }}
    >
      <ResizeHandles
        onPointerDownMode={onPointerDownResizeWithMode}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
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
  onContextMenu,
  canShowResizeHandle,
  panToolActive,
}) {
  const ref = useRef(null);
  // dragState carries data only needed by this element's pointer handlers
  // (pointer id + start coordinates). Group state lives in the parent.
  const dragState = useRef(null);

  const onPointerDownMove = (e) => {
    if (e.button !== 0) return;
    if (panToolActive) return;
    e.preventDefault();
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
    // Back-compat: existing callsites without a mode.
    return onPointerDownResizeWithMode("resize-se", e);
  };

  const onPointerDownResizeWithMode = (mode, e) => {
    if (e.button !== 0) return;
    if (panToolActive) return;
    e.preventDefault();
    e.stopPropagation();
    const started = beginElementDrag(element.id, e, mode);
    if (!started) return;
    if (
      resizeOverridesAspectLock(mode, e.shiftKey) &&
      element.lockAspectRatio &&
      !element.aspectRatioLockDisabled
    ) {
      onDragMove(element.id, 0, 0, "__mark-aspect-broken__");
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    dragState.current = {
      mode,
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
    onDragMove(element.id, dxMm, dyMm, s.mode, e.shiftKey);
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

  const selectionStyle = isSelected
    ? { boxShadow: "0 0 0 2px var(--accent)" }
    : { boxShadow: "0 0 0 1px rgba(0,0,0,0.06)" };

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={-1}
      onPointerDown={onPointerDownMove}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onContextMenu={(e) => onContextMenu?.(element.id, e)}
      style={{
        position: "absolute",
        left: leftPx,
        top: topPx,
        width: widthPx,
        height: heightPx,
        zIndex: element.layer + 1,
        touchAction: "none",
        cursor: panToolActive ? "grab" : "move",
        outline: "none",
        background: "transparent",
        ...selectionStyle,
      }}
    >
      {element.type === "shape" ? (
        <ShapeElementGraphic element={element} />
      ) : element.type === "image" ? (
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
        <ResizeHandles
          onPointerDownMode={(mode, e) => onPointerDownResizeWithMode(mode, e)}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
      ) : null}
    </div>
  );
}
