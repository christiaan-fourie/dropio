/** @typedef {"rectangle" | "ellipse" | "line"} ShapeKind */

export const SHAPE_CATALOG = [
  {
    kind: "rectangle",
    label: "Rectangle",
    defaultWidth: 60,
    defaultHeight: 40,
    lockAspectRatio: false,
    fill: "#3b82f6",
    stroke: "#1e3a8a",
  },
  {
    kind: "ellipse",
    label: "Ellipse",
    defaultWidth: 50,
    defaultHeight: 50,
    lockAspectRatio: true,
    fill: "#ec4899",
    stroke: "#9d174d",
  },
  {
    kind: "line",
    label: "Line",
    defaultWidth: 80,
    defaultHeight: 8,
    lockAspectRatio: false,
    fill: "transparent",
    stroke: "#18181b",
  },
];

export const DEFAULT_SHAPE_STROKE_WIDTH_MM = 0.5;

export function shapeDefinition(kind) {
  return SHAPE_CATALOG.find((entry) => entry.kind === kind) ?? SHAPE_CATALOG[0];
}

/**
 * @param {ShapeKind} shapeKind
 * @param {{ width: number, height: number }} board
 * @param {number} layer
 * @param {() => string} makeElementId
 * @param {{ x: number, y: number } | undefined} position
 */
export function createShapeElement(shapeKind, board, layer, makeElementId, position) {
  const def = shapeDefinition(shapeKind);
  const width = Math.min(def.defaultWidth, board.width * 0.6);
  const height = Math.min(def.defaultHeight, board.height * 0.6);
  let x;
  let y;

  if (position) {
    x = position.x - width / 2;
    y = position.y - height / 2;
  } else {
    x = (board.width - width) / 2;
    y = (board.height - height) / 2;
  }

  return {
    id: makeElementId(),
    type: "shape",
    shapeKind: def.kind,
    name: def.label,
    x,
    y,
    width,
    height,
    layer,
    fill: def.fill,
    stroke: def.stroke,
    strokeWidth: DEFAULT_SHAPE_STROKE_WIDTH_MM,
    cutLine: false,
    lockAspectRatio: def.lockAspectRatio,
  };
}

export function parseHexColor(color, fallback = { r: 0, g: 0, b: 0 }) {
  if (!color || color === "transparent") return null;
  const match = /^#?([0-9a-f]{6})$/i.exec(String(color).trim());
  if (!match) return fallback;
  const value = parseInt(match[1], 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function rgbCss(color) {
  if (!color) return "transparent";
  return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

function pdfStyle(fill, stroke, strokeWidthMm) {
  const hasFill = fill && fill !== "transparent";
  const hasStroke = stroke && strokeWidthMm > 0;
  if (hasFill && hasStroke) return "FD";
  if (hasFill) return "F";
  if (hasStroke) return "S";
  return "";
}

/**
 * Draw a shape element onto a 2D canvas context.
 * Coordinates are in the same space as the context (typically export pixels).
 */
export function drawShapeOnCanvas2d(ctx, element, scale = 1) {
  const { shapeKind, fill, stroke, strokeWidth = DEFAULT_SHAPE_STROKE_WIDTH_MM } = element;
  const x = element.x * scale;
  const y = element.y * scale;
  const width = element.width * scale;
  const height = element.height * scale;
  const lineWidth = Math.max(0.5, strokeWidth * scale);
  const fillRgb = parseHexColor(fill);
  const strokeRgb = parseHexColor(stroke) ?? { r: 0, g: 0, b: 0 };

  ctx.save();
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";

  if (shapeKind === "line") {
    ctx.strokeStyle = rgbCss(strokeRgb);
    ctx.beginPath();
    ctx.moveTo(x, y + height / 2);
    ctx.lineTo(x + width, y + height / 2);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (shapeKind === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(x + width / 2, y + height / 2, Math.max(0, width / 2), Math.max(0, height / 2), 0, 0, Math.PI * 2);
    if (fillRgb) {
      ctx.fillStyle = rgbCss(fillRgb);
      ctx.fill();
    }
    if (stroke && strokeWidth > 0) {
      ctx.strokeStyle = rgbCss(strokeRgb);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  if (fillRgb) {
    ctx.fillStyle = rgbCss(fillRgb);
    ctx.fillRect(x, y, width, height);
  }
  if (stroke && strokeWidth > 0) {
    ctx.strokeStyle = rgbCss(strokeRgb);
    ctx.strokeRect(x + lineWidth / 2, y + lineWidth / 2, Math.max(0, width - lineWidth), Math.max(0, height - lineWidth));
  }
  ctx.restore();
}

/** Draw a shape element onto a jsPDF instance (mm units). */
export function drawShapeOnPdf(pdf, element) {
  const { shapeKind, fill, stroke, strokeWidth = DEFAULT_SHAPE_STROKE_WIDTH_MM } = element;
  const fillRgb = parseHexColor(fill);
  const strokeRgb = parseHexColor(stroke) ?? { r: 0, g: 0, b: 0 };
  const style = pdfStyle(fill, stroke, strokeWidth);
  if (!style) return;

  if (stroke && strokeWidth > 0) {
    pdf.setLineWidth(strokeWidth);
    pdf.setDrawColor(strokeRgb.r, strokeRgb.g, strokeRgb.b);
  }
  if (fillRgb) {
    pdf.setFillColor(fillRgb.r, fillRgb.g, fillRgb.b);
  }

  if (shapeKind === "line") {
    pdf.line(element.x, element.y + element.height / 2, element.x + element.width, element.y + element.height / 2);
    return;
  }

  if (shapeKind === "ellipse") {
    pdf.ellipse(
      element.x + element.width / 2,
      element.y + element.height / 2,
      element.width / 2,
      element.height / 2,
      style
    );
    return;
  }

  pdf.rect(element.x, element.y, element.width, element.height, style);
}
