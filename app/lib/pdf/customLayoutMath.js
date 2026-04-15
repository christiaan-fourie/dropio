/** @typedef {'auto' | 'fixed'} SheetLayoutMode */

/** Minimum inset from each sheet edge (mm) for typical office printer non-printable areas. */
export const PRINT_SAFE_MARGIN_MM = 5;

/**
 * @param {{ width: number; height: number }} sheet
 * @returns {{ inset: number; innerWidth: number; innerHeight: number }}
 */
export function getPrintableInnerMm(sheet) {
  const inset = PRINT_SAFE_MARGIN_MM;
  return {
    inset,
    innerWidth: Math.max(0, sheet.width - 2 * inset),
    innerHeight: Math.max(0, sheet.height - 2 * inset),
  };
}

/**
 * mm offset from sheet edge so content stays within print-safe bounds when it physically fits.
 * @param {number} sheetDim
 * @param {number} itemDim
 * @param {number} [inset]
 */
export function clampedPrintMarginStart(sheetDim, itemDim, inset = PRINT_SAFE_MARGIN_MM) {
  if (itemDim >= sheetDim) return inset;
  const lo = inset;
  const hi = sheetDim - itemDim - inset;
  if (hi < lo) return inset;
  const centered = (sheetDim - itemDim) / 2;
  return Math.max(lo, Math.min(hi, centered));
}

export const SHEETS = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
  A2: { width: 420, height: 594 },
  A1: { width: 594, height: 841 },
  A0: { width: 841, height: 1189 },
};

const SHEET_ORDER = ["A4", "A3", "A2", "A1", "A0"];

/**
 * Pack as many items per sheet as possible (original behaviour).
 */
export function computeMaxPackLayout(itemWidth, itemHeight, sheetSize, quantity) {
  const sheet = SHEETS[sheetSize];
  const itemSpacing = 1;
  const { inset, innerWidth, innerHeight } = getPrintableInnerMm(sheet);

  if (itemWidth > innerWidth || itemHeight > innerHeight) {
    return {
      cols: 1,
      rows: 1,
      itemsPerSheet: 1,
      targetItemsPerSheet: 1,
      margin: {
        horizontal: clampedPrintMarginStart(sheet.width, itemWidth, inset),
        vertical: clampedPrintMarginStart(sheet.height, itemHeight, inset),
      },
      itemWidth,
      itemHeight,
      itemSpacing,
      totalSheets: quantity,
      sheetSize,
      oversized: true,
    };
  }

  let best = null;
  let maxItemsPerSheet = 0;
  const maxCols = Math.floor((innerWidth + itemSpacing) / (itemWidth + itemSpacing));
  const maxRows = Math.floor((innerHeight + itemSpacing) / (itemHeight + itemSpacing));

  for (let cols = 1; cols <= maxCols; cols++) {
    for (let rows = 1; rows <= maxRows; rows++) {
      const totalWidth = cols * itemWidth + (cols - 1) * itemSpacing;
      const totalHeight = rows * itemHeight + (rows - 1) * itemSpacing;
      if (totalWidth <= innerWidth && totalHeight <= innerHeight) {
        const itemsPerSheet = cols * rows;
        if (itemsPerSheet > maxItemsPerSheet) {
          maxItemsPerSheet = itemsPerSheet;
          best = {
            cols,
            rows,
            itemsPerSheet,
            margin: {
              horizontal: inset + (innerWidth - totalWidth) / 2,
              vertical: inset + (innerHeight - totalHeight) / 2,
            },
          };
        }
      }
    }
  }

  if (!best) {
    return {
      cols: 1,
      rows: 1,
      itemsPerSheet: 1,
      targetItemsPerSheet: 1,
      margin: {
        horizontal: clampedPrintMarginStart(sheet.width, itemWidth, inset),
        vertical: clampedPrintMarginStart(sheet.height, itemHeight, inset),
      },
      itemWidth,
      itemHeight,
      itemSpacing,
      totalSheets: quantity,
      sheetSize,
      oversized: true,
    };
  }

  return {
    ...best,
    targetItemsPerSheet: best.itemsPerSheet,
    itemWidth,
    itemHeight,
    itemSpacing,
    totalSheets: Math.ceil(quantity / best.itemsPerSheet),
    sheetSize,
    oversized: false,
  };
}

/**
 * Fit exactly `itemsPerPage` placements per sheet (row-major), using the smallest grid that holds them.
 */
export function computeFixedCountLayout(itemWidth, itemHeight, sheetSize, itemsPerPage, quantity) {
  const sheet = SHEETS[sheetSize];
  const itemSpacing = 1;
  const { inset, innerWidth, innerHeight } = getPrintableInnerMm(sheet);

  if (!itemsPerPage || itemsPerPage < 1) return null;

  if (itemWidth > innerWidth || itemHeight > innerHeight) {
    return {
      cols: 1,
      rows: 1,
      itemsPerSheet: 1,
      targetItemsPerSheet: 1,
      margin: {
        horizontal: clampedPrintMarginStart(sheet.width, itemWidth, inset),
        vertical: clampedPrintMarginStart(sheet.height, itemHeight, inset),
      },
      itemWidth,
      itemHeight,
      itemSpacing,
      totalSheets: quantity,
      sheetSize,
      oversized: true,
    };
  }

  let best = null;
  let bestScore = Infinity;

  for (let cols = 1; cols <= itemsPerPage; cols++) {
    const rows = Math.ceil(itemsPerPage / cols);
    const totalWidth = cols * itemWidth + (cols - 1) * itemSpacing;
    const totalHeight = rows * itemHeight + (rows - 1) * itemSpacing;
    if (totalWidth > innerWidth || totalHeight > innerHeight) continue;
    const slots = cols * rows;
    if (slots < itemsPerPage) continue;
    const waste = slots - itemsPerPage;
    const score = waste * 10_000 + slots;
    if (score < bestScore) {
      bestScore = score;
      best = { cols, rows, totalWidth, totalHeight };
    }
  }

  if (!best) return null;

  return {
    cols: best.cols,
    rows: best.rows,
    itemsPerSheet: itemsPerPage,
    targetItemsPerSheet: itemsPerPage,
    margin: {
      horizontal: inset + (innerWidth - best.totalWidth) / 2,
      vertical: inset + (innerHeight - best.totalHeight) / 2,
    },
    itemWidth,
    itemHeight,
    itemSpacing,
    totalSheets: Math.ceil(quantity / itemsPerPage),
    sheetSize,
    oversized: false,
  };
}

export function estimateLayoutEfficiency(layout, sheetSize) {
  const sh = SHEETS[sheetSize];
  if (layout.oversized) return 0.1;
  const area = sh.width * sh.height;
  const placed =
    Math.min(layout.targetItemsPerSheet, layout.cols * layout.rows) * layout.itemWidth * layout.itemHeight;
  return placed / area;
}

/**
 * @param {SheetLayoutMode} sheetLayout
 * @param {number} [itemsPerPage] required when sheetLayout === 'fixed'
 */
export function pickBestSheetSize(itemWidth, itemHeight, quantity, sheetLayout, itemsPerPage) {
  if (itemWidth > 841 || itemHeight > 841) {
    const layout =
      sheetLayout === "fixed"
        ? computeFixedCountLayout(itemWidth, itemHeight, "A0", itemsPerPage, quantity)
        : computeMaxPackLayout(itemWidth, itemHeight, "A0", quantity);
    if (sheetLayout === "fixed" && !layout) return null;
    return { layout, sheetSize: "A0", efficiency: layout ? estimateLayoutEfficiency(layout, "A0") : 0.1 };
  }

  for (const sheetSize of SHEET_ORDER) {
    const layout =
      sheetLayout === "fixed"
        ? computeFixedCountLayout(itemWidth, itemHeight, sheetSize, itemsPerPage, quantity)
        : computeMaxPackLayout(itemWidth, itemHeight, sheetSize, quantity);

    if (sheetLayout === "fixed" && !layout) continue;

    const efficiency = estimateLayoutEfficiency(layout, sheetSize);
    const threshold = itemWidth > 500 || itemHeight > 500 ? 0.1 : 0.15;
    if (efficiency > threshold || sheetSize === "A0") {
      return { layout, sheetSize, efficiency };
    }
  }

  const layout =
    sheetLayout === "fixed"
      ? computeFixedCountLayout(itemWidth, itemHeight, "A0", itemsPerPage, quantity)
      : computeMaxPackLayout(itemWidth, itemHeight, "A0", quantity);

  if (sheetLayout === "fixed" && !layout) return null;

  return { layout, sheetSize: "A0", efficiency: layout ? estimateLayoutEfficiency(layout, "A0") : 0.1 };
}

export function resolveManualSheetLayout(itemWidth, itemHeight, sheetSize, quantity, sheetLayout, itemsPerPage) {
  if (sheetLayout === "fixed") {
    const layout = computeFixedCountLayout(itemWidth, itemHeight, sheetSize, itemsPerPage, quantity);
    if (!layout) return null;
    const efficiency = estimateLayoutEfficiency(layout, sheetSize);
    return { layout, sheetSize, efficiency };
  }
  const layout = computeMaxPackLayout(itemWidth, itemHeight, sheetSize, quantity);
  const efficiency = estimateLayoutEfficiency(layout, sheetSize);
  return { layout, sheetSize, efficiency };
}

/** Floor to 2 decimals so rounding never exceeds sheet bounds. */
function floor2(x) {
  return Math.floor(x * 100) / 100;
}

/**
 * Largest item size (keeping width/height ratio) that fits `itemsPerPage` in a row-major grid on `sheetSize`.
 */
export function computeBestItemSizeForItemsPerPage(sheetSize, itemsPerPage, aspectWOverH) {
  const sheet = SHEETS[sheetSize];
  const { innerWidth, innerHeight } = getPrintableInnerMm(sheet);
  const spacing = 1;
  const r = Math.max(0.05, Math.min(20, Number(aspectWOverH) || 1));
  let best = null;
  let bestArea = -1;
  let bestWaste = 999;

  for (let cols = 1; cols <= itemsPerPage; cols++) {
    const rows = Math.ceil(itemsPerPage / cols);
    const slots = cols * rows;
    if (slots < itemsPerPage) continue;

    const hFromW = (innerWidth - (cols - 1) * spacing) / (cols * r);
    const hFromH = (innerHeight - (rows - 1) * spacing) / rows;
    const h = Math.min(hFromW, hFromH);
    if (h < 10) continue;
    const w = r * h;
    if (w < 10) continue;
    const totalW = cols * w + (cols - 1) * spacing;
    const totalH = rows * h + (rows - 1) * spacing;
    if (totalW > innerWidth + 1e-6 || totalH > innerHeight + 1e-6) continue;

    const area = w * h;
    const waste = slots - itemsPerPage;
    if (area > bestArea + 1e-9 || (Math.abs(area - bestArea) < 1e-9 && waste < bestWaste)) {
      bestArea = area;
      bestWaste = waste;
      best = {
        cols,
        rows,
        itemWidth: floor2(w),
        itemHeight: floor2(h),
      };
    }
  }
  return best;
}

/**
 * Smallest standard sheet (A4→A0) when auto; otherwise only `manualSheetSize`.
 */
export function solvePerSheetItemLayout({ itemsPerPage, aspectWOverH, autoSheetSize, manualSheetSize }) {
  if (!itemsPerPage || itemsPerPage < 1) return null;
  const order = autoSheetSize ? SHEET_ORDER : [manualSheetSize];
  for (const sheetSize of order) {
    const res = computeBestItemSizeForItemsPerPage(sheetSize, itemsPerPage, aspectWOverH);
    if (res) return { sheetSize, ...res };
  }
  return null;
}

/** Layout object compatible with PDF placement for a known grid and item size. */
export function buildFixedLayoutFromGrid(sheetSize, cols, rows, itemWidth, itemHeight, targetItemsPerPage, quantity) {
  const sheet = SHEETS[sheetSize];
  const itemSpacing = 1;
  const { inset, innerWidth, innerHeight } = getPrintableInnerMm(sheet);
  const totalW = cols * itemWidth + (cols - 1) * itemSpacing;
  const totalH = rows * itemHeight + (rows - 1) * itemSpacing;
  return {
    cols,
    rows,
    targetItemsPerSheet: targetItemsPerPage,
    itemsPerSheet: targetItemsPerPage,
    margin: {
      horizontal: inset + (innerWidth - totalW) / 2,
      vertical: inset + (innerHeight - totalH) / 2,
    },
    itemWidth,
    itemHeight,
    itemSpacing,
    totalSheets: Math.ceil(quantity / targetItemsPerPage),
    sheetSize,
    oversized: false,
  };
}
