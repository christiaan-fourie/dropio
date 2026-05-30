import {
  hydrateElementsFromLibrary,
  hydrateLibraryItems,
  migrateLibraryFromElements,
  serializeElementsForStorage,
  serializeLibraryMetadata,
} from "./imageLibrary";
import {
  ensureActiveArtboardId,
  normalizeArtboard,
  normalizeArtboards,
  normalizeElementArtboardIds,
} from "./artboardModel";
import {
  clearLibraryImages,
  getLibraryImage,
  isImageStoreAvailable,
  syncLibraryImages,
} from "./imageStore";

export const STORAGE_KEY = "dropio-state-v1";
export const STORAGE_VERSION = 3;

export const DEFAULT_CANVAS_WRAP = {
  wrapSize: "A3",
  width: 400,
  height: 300,
  thickness: 35,
  extra: 5,
  files: [],
};

export const DEFAULT_VIEWPORT = {
  pan: { x: 0, y: 0 },
  viewZoom: 1,
};

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read file for storage"));
    reader.readAsDataURL(file);
  });
}

async function srcToBlob(src) {
  const res = await fetch(src);
  return res.blob();
}

async function blobUrlToDataUrl(blobUrl) {
  const blob = await srcToBlob(blobUrl);
  return fileToDataUrl(blob);
}

export async function dataUrlToFile(dataUrl, name, type) {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], name || "image", {
    type: type || blob.type || "application/octet-stream",
    lastModified: Date.now(),
  });
}

async function serializeElementsInline(elements, libraryIds) {
  const deduped = serializeElementsForStorage(elements, libraryIds);
  const srcMap = new Map();
  const out = [];

  for (const el of deduped) {
    if (!el.src) {
      out.push(el);
      continue;
    }

    let src = el.src;
    if (typeof src === "string" && src.startsWith("blob:")) {
      if (!srcMap.has(src)) {
        srcMap.set(src, await blobUrlToDataUrl(src));
      }
      src = srcMap.get(src);
    }
    out.push({ ...el, src });
  }

  return out;
}

async function serializeLibraryInline(items) {
  const srcMap = new Map();
  const out = [];

  for (const item of items || []) {
    let src = item.src;
    if (typeof src === "string" && src.startsWith("blob:")) {
      if (!srcMap.has(src)) {
        srcMap.set(src, await blobUrlToDataUrl(src));
      }
      src = srcMap.get(src);
    }
    out.push({ ...item, src });
  }

  return out;
}

async function serializeCanvasFiles(files) {
  const serialized = [];
  for (const file of files || []) {
    serialized.push({
      name: file.name,
      type: file.type,
      dataUrl: await fileToDataUrl(file),
    });
  }
  return serialized;
}

export function loadPersistedState() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || (parsed.version !== 1 && parsed.version !== 2 && parsed.version !== 3)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function buildPersistedSnapshotV2(snapshotInput) {
  const { library = [], elements = [], artboards = [], canvasWrap, ...rest } = snapshotInput;
  const libraryIds = library.map((item) => item.id);
  let useImageStore = isImageStoreAvailable();

  if (useImageStore) {
    try {
      await syncLibraryImages(library, srcToBlob);
    } catch (err) {
      console.warn("Dropio: could not persist library images to IndexedDB, falling back to inline storage:", err);
      useImageStore = false;
    }
  }

  const serializedElements = useImageStore
    ? serializeElementsForStorage(elements, libraryIds)
    : await serializeElementsInline(elements, libraryIds);
  const serializedLibrary = useImageStore
    ? serializeLibraryMetadata(library)
    : await serializeLibraryInline(library);
  const serializedCanvasFiles = await serializeCanvasFiles(canvasWrap?.files);
  const serializedArtboards = (artboards || []).map((board) => ({
    ...normalizeArtboard(board),
  }));

  return {
    version: STORAGE_VERSION,
    ...rest,
    elements: serializedElements,
    library: serializedLibrary,
    artboards: serializedArtboards,
    canvasWrap: {
      wrapSize: canvasWrap?.wrapSize ?? DEFAULT_CANVAS_WRAP.wrapSize,
      width: canvasWrap?.width ?? DEFAULT_CANVAS_WRAP.width,
      height: canvasWrap?.height ?? DEFAULT_CANVAS_WRAP.height,
      thickness: canvasWrap?.thickness ?? DEFAULT_CANVAS_WRAP.thickness,
      extra: canvasWrap?.extra ?? DEFAULT_CANVAS_WRAP.extra,
      files: serializedCanvasFiles,
    },
  };
}

export async function buildPersistedSnapshot(snapshotInput) {
  const {
    viewMode,
    artboards,
    activeArtboardId,
    elements,
    library,
    snapEnabled,
    businessSheet,
    layoutGap,
    layoutLockAspect,
    viewport,
    canvasWrap,
  } = snapshotInput;

  return buildPersistedSnapshotV2({
    viewMode,
    artboards,
    activeArtboardId,
    elements,
    library,
    snapEnabled,
    businessSheet,
    layoutGap,
    layoutLockAspect,
    viewport: viewport ?? DEFAULT_VIEWPORT,
    canvasWrap,
  });
}

export async function savePersistedState(snapshotInput) {
  if (typeof window === "undefined") return;
  try {
    const snapshot = await buildPersistedSnapshot(snapshotInput);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch (err) {
    console.warn("Dropio: could not save to localStorage (quota or serialization error):", err);
  }
}

export function clearPersistedState() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    if (isImageStoreAvailable()) {
      void clearLibraryImages();
    }
  } catch {
    // ignore
  }
}

export async function restoreCanvasWrapFiles(serializedFiles) {
  if (!serializedFiles?.length) return [];
  const files = [];
  for (const item of serializedFiles) {
    if (!item?.dataUrl) continue;
    files.push(await dataUrlToFile(item.dataUrl, item.name, item.type));
  }
  return files;
}

export async function hydratePersistedImages(library, elements) {
  const hydratedLibrary = await hydrateLibraryItems(library, getLibraryImage);
  const libraryById = new Map(hydratedLibrary.map((item) => [item.id, item]));
  const hydratedElements = hydrateElementsFromLibrary(elements, libraryById);
  return { library: hydratedLibrary, elements: hydratedElements };
}

export function readInitialEditorState(initialViewMode) {
  const stored = loadPersistedState();
  const viewMode =
    initialViewMode === "canvas-wrap" ? "canvas-wrap" : stored?.viewMode ?? "editor";

  const storedElements = stored?.elements ?? null;
  let library = stored?.library ?? [];
  let elements = storedElements;
  let artboards = normalizeArtboards(stored?.artboards, stored?.artboard);

  if (library.length === 0 && storedElements?.length) {
    const migrated = migrateLibraryFromElements(storedElements);
    library = migrated.library;
    elements = migrated.elements;
  }

  elements = normalizeElementArtboardIds(elements, artboards);
  const activeArtboardId = ensureActiveArtboardId(stored?.activeArtboardId, artboards);

  return {
    stored,
    viewMode,
    artboards,
    activeArtboardId,
    elements,
    library,
    snapEnabled: stored?.snapEnabled ?? true,
    businessSheet: stored?.businessSheet ?? "A4",
    layoutGap: stored?.layoutGap ?? stored?.gridGap ?? 5,
    layoutLockAspect: stored?.layoutLockAspect ?? true,
    viewport: stored?.viewport ?? DEFAULT_VIEWPORT,
    canvasWrapMeta: stored?.canvasWrap
      ? {
          wrapSize: stored.canvasWrap.wrapSize,
          width: stored.canvasWrap.width,
          height: stored.canvasWrap.height,
          thickness: stored.canvasWrap.thickness,
          extra: stored.canvasWrap.extra,
        }
      : DEFAULT_CANVAS_WRAP,
  };
}
