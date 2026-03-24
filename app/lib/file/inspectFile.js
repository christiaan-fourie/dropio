/**
 * Client-side file sniffing and light inspection (magic bytes, pdf-lib, image decode).
 */

/** @typedef {'pdf'|'jpeg'|'png'|'gif'|'webp'|'svg'|'bmp'|'tiff'|'unknown'} DetectedKind */

export const KIND_LABELS = {
  pdf: "PDF document",
  jpeg: "JPEG image",
  png: "PNG image",
  gif: "GIF image",
  webp: "WebP image",
  svg: "SVG image (vector)",
  bmp: "BMP image",
  tiff: "TIFF image",
  unknown: "Unknown or unsupported binary",
};

const MIME_HINT = {
  "application/pdf": "pdf",
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
  "image/x-ms-bmp": "bmp",
  "image/tiff": "tiff",
  "image/tif": "tiff",
};

const EXT_HINT = {
  pdf: "pdf",
  jpg: "jpeg",
  jpeg: "jpeg",
  png: "png",
  gif: "gif",
  webp: "webp",
  svg: "svg",
  bmp: "bmp",
  tif: "tiff",
  tiff: "tiff",
};

/**
 * @param {ArrayBuffer} buffer
 * @returns {DetectedKind}
 */
export function sniffFormat(buffer) {
  const u8 = new Uint8Array(buffer.byteLength > 2048 ? buffer.slice(0, 2048) : buffer);
  if (u8.length < 4) return "unknown";

  if (u8[0] === 0x25 && u8[1] === 0x50 && u8[2] === 0x44 && u8[3] === 0x46) return "pdf";
  if (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) return "png";
  if (u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff) return "jpeg";
  if (u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x38) return "gif";
  if (u8[0] === 0x42 && u8[1] === 0x4d) return "bmp";

  if (
    u8.length >= 12 &&
    u8[0] === 0x52 &&
    u8[1] === 0x49 &&
    u8[2] === 0x46 &&
    u8[3] === 0x46 &&
    u8[8] === 0x57 &&
    u8[9] === 0x45 &&
    u8[10] === 0x42 &&
    u8[11] === 0x50
  ) {
    return "webp";
  }

  if (
    (u8[0] === 0x49 && u8[1] === 0x49 && u8[2] === 0x2a && u8[3] === 0x00) ||
    (u8[0] === 0x4d && u8[1] === 0x4d && u8[2] === 0x00 && u8[3] === 0x2a)
  ) {
    return "tiff";
  }

  try {
    const head = new TextDecoder("utf-8", { fatal: false }).decode(u8.slice(0, Math.min(512, u8.length))).trimStart();
    if (/^<\?xml/i.test(head) || /^\s*<svg\b/i.test(head)) return "svg";
  } catch {
    /* ignore */
  }

  return "unknown";
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function hexPrefix(u8, max = 8) {
  const n = Math.min(max, u8.length);
  const parts = [];
  for (let i = 0; i < n; i++) parts.push(u8[i].toString(16).padStart(2, "0"));
  return parts.join(" ");
}

function extensionOf(name) {
  const i = name.lastIndexOf(".");
  if (i < 0) return "";
  return name.slice(i + 1).toLowerCase();
}

/**
 * @param {File} file
 * @returns {Promise<{ width: number; height: number; megapixels: string } | null>}
 */
async function decodeBitmapDimensions(file) {
  try {
    const bmp = await createImageBitmap(file);
    const width = bmp.width;
    const height = bmp.height;
    bmp.close();
    return {
      width,
      height,
      megapixels: ((width * height) / 1_000_000).toFixed(2),
    };
  } catch {
    return null;
  }
}

/**
 * @param {ArrayBuffer} buffer
 */
async function inspectPdfBuffer(buffer) {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const pageCount = doc.getPageCount();
  const first = doc.getPage(0);
  const { width, height } = first.getSize();
  const wMm = (width * 25.4) / 72;
  const hMm = (height * 25.4) / 72;
  return {
    pageCount,
    firstPageWidthPt: Math.round(width * 100) / 100,
    firstPageHeightPt: Math.round(height * 100) / 100,
    firstPageWidthMm: Math.round(wMm * 10) / 10,
    firstPageHeightMm: Math.round(hMm * 10) / 10,
  };
}

/**
 * @param {File} file
 */
export async function inspectFile(file) {
  const buffer = await file.arrayBuffer();
  const u8head = new Uint8Array(buffer.byteLength > 16 ? buffer.slice(0, 16) : buffer);
  const magicKind = sniffFormat(buffer);
  const ext = extensionOf(file.name);
  const extKind = EXT_HINT[ext] ?? null;
  const mimeRaw = (file.type || "").trim().toLowerCase();
  const mimeKind = MIME_HINT[mimeRaw] ?? null;

  let kind = magicKind;
  let detectionNote = "Detected from file signature (magic bytes).";
  if (kind === "unknown" && mimeKind) {
    kind = /** @type {DetectedKind} */ (mimeKind);
    detectionNote = "Signature unclear; type inferred from browser-reported MIME type.";
  } else if (kind === "unknown" && extKind) {
    kind = /** @type {DetectedKind} */ (extKind);
    detectionNote = "Signature unclear; type inferred from file extension.";
  } else if (kind !== "unknown" && mimeKind && mimeKind !== kind) {
    detectionNote = `Signature says ${KIND_LABELS[kind] ?? kind}; MIME reports ${mimeRaw || "(empty)"} (often harmless).`;
  }

  /** @type {Record<string, string | number | boolean>} */
  const details = {
    "File name": file.name,
    "File size": formatBytes(file.size),
    "Bytes (exact)": file.size,
    "Reported MIME": file.type || "— (browser did not set a type)",
    Extension: ext ? `.${ext}` : "—",
    "First bytes (hex)": hexPrefix(u8head, 12),
  };

  if (kind === "pdf") {
    try {
      const pdf = await inspectPdfBuffer(buffer);
      details["Page count"] = pdf.pageCount;
      details["First page size"] = `${pdf.firstPageWidthPt} × ${pdf.firstPageHeightPt} pt`;
      details["First page (approx.)"] = `${pdf.firstPageWidthMm} × ${pdf.firstPageHeightMm} mm`;
    } catch (e) {
      details["PDF details"] = `Could not parse: ${e instanceof Error ? e.message : String(e)}`;
    }
  } else if (["jpeg", "png", "gif", "webp", "bmp"].includes(kind)) {
    const dim = await decodeBitmapDimensions(file);
    if (dim) {
      details["Pixel size"] = `${dim.width} × ${dim.height} px`;
      details["Megapixels"] = dim.megapixels;
      details["Aspect ratio"] =
        dim.height > 0 ? (Math.round((1000 * dim.width) / dim.height) / 1000).toFixed(3) : "—";
    } else {
      details["Pixel size"] = "Could not decode in this browser (file may be corrupt or an unusual variant).";
    }
  } else if (kind === "svg") {
    details["Note"] = "Vector format: no fixed pixel dimensions until rasterized.";
  } else if (kind === "tiff") {
    const dim = await decodeBitmapDimensions(file);
    if (dim) {
      details["Pixel size"] = `${dim.width} × ${dim.height} px`;
    } else {
      details["Pixel size"] = "TIFF detected; raster decode not available in this environment.";
    }
  }

  return {
    kind,
    label: KIND_LABELS[kind] ?? KIND_LABELS.unknown,
    detectionNote,
    details,
  };
}
