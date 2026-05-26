export function makeLibraryId() {
  return `lib_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
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

export async function createLibraryItemFromFile(file, trackBlobUrl) {
  const { url, naturalWidth, naturalHeight } = await loadImageMeta(file);
  if (trackBlobUrl) trackBlobUrl(url);
  return {
    id: makeLibraryId(),
    name: file.name || "image",
    src: url,
    mimeType: file.type || "",
    naturalWidth,
    naturalHeight,
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function createElementFromLibraryItem(item, board, layer, makeElementId, position) {
  const ratio = item.naturalWidth / item.naturalHeight || 1;
  let width = Math.min(board.width * 0.4, 120);
  let height = width / ratio;
  if (height > board.height * 0.4) {
    height = board.height * 0.4;
    width = height * ratio;
  }
  let x;
  let y;
  if (position) {
    x = position.x - width / 2;
    y = position.y - height / 2;
    x = clamp(x, 0, board.width - width);
    y = clamp(y, 0, board.height - height);
  } else {
    x = clamp((board.width - width) / 2, 0, board.width - width);
    y = clamp((board.height - height) / 2, 0, board.height - height);
  }

  return {
    id: makeElementId(),
    type: "image",
    libraryId: item.id,
    src: item.src,
    name: item.name,
    mimeType: item.mimeType || "",
    naturalWidth: item.naturalWidth,
    naturalHeight: item.naturalHeight,
    x,
    y,
    width,
    height,
    layer,
    cutLine: false,
    lockAspectRatio: false,
  };
}

export function migrateLibraryFromElements(elements) {
  const library = [];
  const srcToId = new Map();

  for (const el of elements || []) {
    if (el.type !== "image" || !el.src) continue;
    if (srcToId.has(el.src)) continue;
    const id = el.libraryId || makeLibraryId();
    srcToId.set(el.src, id);
    library.push({
      id,
      name: el.name || "image",
      src: el.src,
      mimeType: el.mimeType || "",
      naturalWidth: el.naturalWidth,
      naturalHeight: el.naturalHeight,
    });
  }

  const patchedElements = (elements || []).map((el) => {
    if (el.type !== "image" || !el.src || el.libraryId) return el;
    const libraryId = srcToId.get(el.src);
    return libraryId ? { ...el, libraryId } : el;
  });

  return { library, elements: patchedElements };
}

export function serializeLibraryMetadata(items) {
  return (items || []).map(({ src, ...item }) => item);
}

export function serializeElementsForStorage(elements, libraryIds) {
  const libraryIdSet = new Set(libraryIds || []);
  return (elements || []).map((el) => {
    if (el.libraryId && libraryIdSet.has(el.libraryId)) {
      const { src, ...rest } = el;
      return rest;
    }
    return { ...el };
  });
}

export async function hydrateLibraryItems(items, getStoredBlob) {
  const out = [];

  for (const item of items || []) {
    if (item.src) {
      out.push({ ...item });
      continue;
    }

    const blob = await getStoredBlob(item.id);
    if (!blob) continue;

    out.push({
      ...item,
      src: URL.createObjectURL(blob),
    });
  }

  return out;
}

export function hydrateElementsFromLibrary(elements, libraryById) {
  return (elements || []).map((el) => {
    if (el.src || !el.libraryId) return el;

    const item = libraryById.get(el.libraryId);
    if (!item?.src) return el;

    return {
      ...el,
      src: item.src,
      name: el.name ?? item.name,
      mimeType: el.mimeType ?? item.mimeType,
      naturalWidth: el.naturalWidth ?? item.naturalWidth,
      naturalHeight: el.naturalHeight ?? item.naturalHeight,
    };
  });
}

export function isSrcInUse(src, { library, elements, excludeLibraryId }) {
  if (!src) return false;
  if (library?.some((item) => item.src === src && item.id !== excludeLibraryId)) return true;
  if (elements?.some((el) => el.src === src)) return true;
  return false;
}
