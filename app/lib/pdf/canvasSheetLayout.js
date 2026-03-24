const SHEETS = [
  { name: "A4", width: 210, height: 297 },
  { name: "A3", width: 297, height: 420 },
  { name: "A2", width: 420, height: 594 },
  { name: "A1", width: 594, height: 841 },
  { name: "A0", width: 841, height: 1189 },
];

export function getOptimalSheetSize(printWidth, printHeight) {
  for (const sheet of SHEETS) {
    if (
      (printWidth <= sheet.width && printHeight <= sheet.height) ||
      (printWidth <= sheet.height && printHeight <= sheet.width)
    ) {
      return sheet;
    }
  }
  return SHEETS[SHEETS.length - 1];
}

/**
 * Same geometry as generateCanvasWrapPDF: print block = face + bleed on all sides, centered on sheet.
 * Coordinates in mm, origin top-left (matches jsPDF placement).
 */
export function getCanvasWrapLayoutMm({ width, height, thickness, extra }) {
  const totalBleed = thickness + extra;
  const printWidth = width + totalBleed * 2;
  const printHeight = height + totalBleed * 2;
  const optimalSheet = getOptimalSheetSize(printWidth, printHeight);
  const needsLandscape = printWidth > printHeight;
  const sheetWidth = needsLandscape
    ? Math.max(optimalSheet.width, optimalSheet.height)
    : Math.min(optimalSheet.width, optimalSheet.height);
  const sheetHeight = needsLandscape
    ? Math.min(optimalSheet.width, optimalSheet.height)
    : Math.max(optimalSheet.width, optimalSheet.height);

  const printOffsetX = (sheetWidth - printWidth) / 2;
  const printOffsetY = (sheetHeight - printHeight) / 2;
  const faceOffsetX = printOffsetX + totalBleed;
  const faceOffsetY = printOffsetY + totalBleed;

  return {
    sheetWidth,
    sheetHeight,
    sheetName: optimalSheet.name,
    printWidth,
    printHeight,
    printOffsetX,
    printOffsetY,
    faceWidth: width,
    faceHeight: height,
    faceOffsetX,
    faceOffsetY,
    bleedMm: totalBleed,
  };
}
