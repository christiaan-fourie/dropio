import jsPDF from "jspdf";
import { drawShapeOnPdf } from "../page/shapes";

const DPI = 300;
const MM_PER_INCH = 25.4;
const MM_TO_PX_AT_300_DPI = DPI / MM_PER_INCH;
// 1 pt = 1/72 inch = 25.4/72 mm ≈ 0.3528 mm, so 0.5pt ≈ 0.1764 mm
const CUT_LINE_WIDTH_MM = (0.5 * MM_PER_INCH) / 72;

/**
 * Render the Page document (artboard + elements) into a PDF at exactly 300 DPI.
 *
 * Each image is rasterized to its target physical pixel size
 * (width_mm × 300 / 25.4) before being embedded, so the PDF output is exactly
 * 300 DPI regardless of the source image's native resolution. High-res sources
 * are downsampled (keeping file size reasonable) and low-res sources are
 * upscaled (the best we can do without synthetic detail).
 *
 * @param {Object} args
 * @param {{ name: string, width: number, height: number, unit: "mm" }} args.artboard
 * @param {Array<{
 *   id: string, type: "image", src: string, name: string,
 *   x: number, y: number, width: number, height: number, layer: number,
 *   mimeType?: string,
 * }>} args.elements
 * @returns {Promise<{ pdfBytes: ArrayBuffer, filename: string }>}
 */
export async function generatePagePDF({ artboard, elements }) {
  if (!artboard) throw new Error("No artboard provided");

  const pdf = new jsPDF({
    orientation: artboard.width >= artboard.height ? "landscape" : "portrait",
    unit: "mm",
    format: [artboard.width, artboard.height],
    compress: true,
  });

  // Render in layer order so the PDF's painter's algorithm matches the editor.
  const ordered = [...(elements || [])].sort((a, b) => a.layer - b.layer);

  for (const el of ordered) {
    if (el.type === "shape") {
      drawShapeOnPdf(pdf, el);
      if (el.cutLine) {
        pdf.setLineWidth(CUT_LINE_WIDTH_MM);
        pdf.setDrawColor(0, 0, 0);
        pdf.rect(el.x, el.y, el.width, el.height, "S");
      }
      continue;
    }
    if (el.type !== "image" || !el.src) continue;
    const targetPxW = Math.max(1, Math.round(el.width * MM_TO_PX_AT_300_DPI));
    const targetPxH = Math.max(1, Math.round(el.height * MM_TO_PX_AT_300_DPI));
    const { dataUrl, format } = await rasterizeAt(el.src, targetPxW, targetPxH, el.mimeType);
    pdf.addImage(
      dataUrl,
      format,
      el.x,
      el.y,
      el.width,
      el.height,
      undefined,
      format === "PNG" ? "FAST" : "NONE"
    );
    if (el.cutLine) {
      // Stroke a hairline rectangle on the element's footprint. The stroke is
      // centered on the path in PDF, so the visible frame lands exactly on the
      // element's boundary (matching the dashed overlay shown in the editor).
      pdf.setLineWidth(CUT_LINE_WIDTH_MM);
      pdf.setDrawColor(0, 0, 0);
      pdf.rect(el.x, el.y, el.width, el.height, "S");
    }
  }

  const pdfBytes = pdf.output("arraybuffer");
  const safeName =
    (artboard.name || "page")
      .replace(/[^a-z0-9-_ ]+/gi, "")
      .trim()
      .replace(/\s+/g, "-") || "page";

  return {
    pdfBytes,
    filename: `${safeName}-${artboard.width}x${artboard.height}mm-300dpi.pdf`,
  };
}

async function rasterizeAt(src, targetPxW, targetPxH, mimeType) {
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = targetPxW;
  canvas.height = targetPxH;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, targetPxW, targetPxH);

  // JPEG sources can't have alpha and are considerably smaller at high
  // resolutions; everything else is treated as potentially transparent and
  // encoded as lossless PNG.
  const isJpeg = /^image\/jpe?g$/i.test(mimeType || "");
  if (isJpeg) {
    return { dataUrl: canvas.toDataURL("image/jpeg", 0.95), format: "JPEG" };
  }
  return { dataUrl: canvas.toDataURL("image/png"), format: "PNG" };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image for PDF export"));
    img.src = src;
  });
}
