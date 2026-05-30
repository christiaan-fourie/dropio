import { drawShapeOnCanvas2d } from "./shapes";
import { boardElements } from "./artboardModel";
import { createZipBlob } from "../file/zip";

const DEFAULT_DPI = 300;
const MM_PER_INCH = 25.4;

function safeFilename(name, fallback = "page") {
  return (
    (name || fallback)
      .replace(/[^a-z0-9-_ ]+/gi, "")
      .trim()
      .replace(/\s+/g, "-") || fallback
  );
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image for export"));
    img.src = src;
  });
}

function drawBackground(ctx, width, height, background) {
  if (!background || background === "transparent") return;
  ctx.save();
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

export async function renderPageToCanvas({ artboard, elements, dpi = DEFAULT_DPI }) {
  if (!artboard) throw new Error("No artboard provided");

  const scale = dpi / MM_PER_INCH;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(artboard.width * scale));
  canvas.height = Math.max(1, Math.round(artboard.height * scale));

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create export canvas");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  drawBackground(ctx, canvas.width, canvas.height, artboard.background);

  const ordered = [...(elements || [])].sort((a, b) => a.layer - b.layer);
  for (const el of ordered) {
    if (el.type === "shape") {
      drawShapeOnCanvas2d(ctx, el, scale);
      if (el.cutLine) {
        ctx.save();
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = Math.max(1, Math.round((0.5 / 72) * dpi));
        ctx.strokeRect(el.x * scale, el.y * scale, el.width * scale, el.height * scale);
        ctx.restore();
      }
      continue;
    }
    if (el.type !== "image" || !el.src) continue;
    const img = await loadImage(el.src);
    ctx.drawImage(
      img,
      Math.round(el.x * scale),
      Math.round(el.y * scale),
      Math.round(el.width * scale),
      Math.round(el.height * scale)
    );
    if (el.cutLine) {
      ctx.save();
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = Math.max(1, Math.round((0.5 / 72) * dpi));
      ctx.strokeRect(el.x * scale, el.y * scale, el.width * scale, el.height * scale);
      ctx.restore();
    }
  }

  return canvas;
}

export async function generatePagePNG({ artboard, elements, dpi = DEFAULT_DPI }) {
  if (Array.isArray(artboard)) {
    const boards = artboard.filter(Boolean);
    if (boards.length === 0) throw new Error("No artboards provided");
    if (boards.length === 1) {
      const single = boards[0];
      const canvas = await renderPageToCanvas({
        artboard: single,
        elements: boardElements(elements, single.id),
        dpi,
      });
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG export failed"))), "image/png");
      });
      const filename = `${safeFilename(single?.name)}-${single.width}x${single.height}mm-${dpi}dpi.png`;
      return { blob, filename };
    }
    const files = [];
    for (const board of boards) {
      const canvas = await renderPageToCanvas({ artboard: board, elements: boardElements(elements, board.id), dpi });
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG export failed"))), "image/png");
      });
      files.push({
        name: `${safeFilename(board?.name)}-${board.width}x${board.height}mm-${dpi}dpi.png`,
        data: blob,
      });
    }
    return { blob: await createZipBlob(files), filename: `${safeFilename(boards[0]?.name || "artboards")}.zip` };
  }

  const canvas = await renderPageToCanvas({ artboard, elements, dpi });
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG export failed"))), "image/png");
  });
  const filename = `${safeFilename(artboard?.name)}-${artboard.width}x${artboard.height}mm-${dpi}dpi.png`;
  return { blob, filename };
}

export function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}
