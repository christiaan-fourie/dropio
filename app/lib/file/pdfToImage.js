/**
 * Browser-side PDF -> raster image conversion.
 *
 * Unifies upload handling across layout tools: a PDF upload is rasterized
 * (first page) into a PNG File so every downstream pipeline can treat it
 * exactly like an image.
 */

let pdfjsLibPromise = null;

async function loadPdfJs() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = (async () => {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
      return pdfjsLib;
    })();
  }
  return pdfjsLibPromise;
}

export function isPdfFile(file) {
  if (!file) return false;
  if (file.type === "application/pdf") return true;
  return typeof file.name === "string" && /\.pdf$/i.test(file.name);
}

/**
 * Rasterize the first page of a PDF file into a PNG File.
 * Aims for ~300 DPI with a pixel cap to avoid memory blow-ups on huge pages.
 *
 * @param {File} pdfFile
 * @param {{ targetDpi?: number; maxPixelDim?: number }} [opts]
 * @returns {Promise<File>}
 */
export async function convertPdfToImageFile(pdfFile, opts = {}) {
  const { targetDpi = 300, maxPixelDim = 4096 } = opts;
  const pdfjsLib = await loadPdfJs();

  const buffer = await pdfFile.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  try {
    const page = await pdf.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });

    const dpiScale = targetDpi / 72;
    const maxDim = Math.max(baseViewport.width, baseViewport.height);
    const capScale = maxDim > 0 ? maxPixelDim / maxDim : dpiScale;
    const scale = Math.max(1, Math.min(dpiScale, capScale));
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not acquire 2D canvas context for PDF rasterization");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport, canvas }).promise;

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))), "image/png");
    });

    const name = pdfFile.name.replace(/\.pdf$/i, "") + ".png";
    return new File([blob], name, { type: "image/png", lastModified: Date.now() });
  } finally {
    try {
      await pdf.cleanup();
      await pdf.destroy();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Convert any PDF files in the list into PNG Files; other files pass through unchanged.
 * Preserves original order.
 *
 * @param {Iterable<File>} files
 * @returns {Promise<File[]>}
 */
export async function normalizeUploadsToImages(files) {
  const arr = Array.from(files ?? []);
  return Promise.all(arr.map((f) => (isPdfFile(f) ? convertPdfToImageFile(f) : f)));
}
