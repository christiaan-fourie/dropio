import { PDFDocument, rgb, degrees } from "pdf-lib";
import { mmToPoints, processImageForPDF } from "./workers";
import { SHEETS, pickBestSheetSize, resolveManualSheetLayout, getPrintableInnerMm } from "./customLayoutMath";

function drawImage(page, image, x, y, itemWidthPts, itemHeightPts, itemWidth, itemHeight, layout) {
  const imageAspectRatio = image.width / image.height;
  const itemAspectRatio = itemWidth / itemHeight;
  const needsRotation =
    Math.abs(1 / imageAspectRatio - itemAspectRatio) < Math.abs(imageAspectRatio - itemAspectRatio);

  if (layout.oversized) {
    const sheetSpec = SHEETS[layout.sheetSize];
    const { inset, innerWidth, innerHeight } = getPrintableInnerMm(sheetSpec);
    const insetPts = mmToPoints(inset);
    const innerWpts = mmToPoints(innerWidth);
    const innerHpts = mmToPoints(innerHeight);
    const maxWidthPts = Math.min(itemWidthPts, innerWpts);
    const maxHeightPts = Math.min(itemHeightPts, innerHpts);
    const scale = Math.min(maxWidthPts / itemWidthPts, maxHeightPts / itemHeightPts, 1);
    const finalWidthPts = itemWidthPts * scale;
    const finalHeightPts = itemHeightPts * scale;
    const centerX = insetPts + (innerWpts - finalWidthPts) / 2;
    const centerY = insetPts + (innerHpts - finalHeightPts) / 2;

    if (needsRotation) {
      page.drawImage(image, {
        x: centerX + finalWidthPts,
        y: centerY,
        width: finalHeightPts,
        height: finalWidthPts,
        rotate: degrees(90),
      });
    } else {
      page.drawImage(image, { x: centerX, y: centerY, width: finalWidthPts, height: finalHeightPts });
    }
    return;
  }

  if (needsRotation) {
    page.drawImage(image, {
      x: x + itemWidthPts,
      y,
      width: itemHeightPts,
      height: itemWidthPts,
      rotate: degrees(90),
    });
  } else {
    page.drawImage(image, { x, y, width: itemWidthPts, height: itemHeightPts });
  }
}

function drawPlacedPages(
  pdfDoc,
  sheet,
  layout,
  quantity,
  processedImages,
  itemWidth,
  itemHeight,
  imageSource,
  mirrorCols
) {
  let itemIndex = 0;
  const itemWidthPts = mmToPoints(layout.itemWidth);
  const itemHeightPts = mmToPoints(layout.itemHeight);

  for (let sheetNum = 0; sheetNum < layout.totalSheets; sheetNum++) {
    const page = pdfDoc.addPage([mmToPoints(sheet.width), mmToPoints(sheet.height)]);
    const remaining = quantity - itemIndex;
    const n = Math.min(layout.targetItemsPerSheet, remaining);

    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / layout.cols);
      const col = i % layout.cols;
      const colDraw = mirrorCols ? layout.cols - 1 - col : col;

      const x = layout.oversized
        ? mmToPoints(layout.margin.horizontal)
        : mmToPoints(layout.margin.horizontal + colDraw * (layout.itemWidth + layout.itemSpacing));
      const y = layout.oversized
        ? mmToPoints(sheet.height - layout.margin.vertical - itemHeight)
        : mmToPoints(
            sheet.height -
              layout.margin.vertical -
              row * (layout.itemHeight + layout.itemSpacing) -
              layout.itemHeight
          );

      const imageIdx = imageSource === "single" ? 0 : itemIndex % processedImages.length;
      const image = processedImages[imageIdx];

      if (image) {
        try {
          drawImage(page, image, x, y, itemWidthPts, itemHeightPts, itemWidth, itemHeight, layout);
          if (!layout.oversized) {
            page.drawRectangle({
              x,
              y,
              width: itemWidthPts,
              height: itemHeightPts,
              borderColor: rgb(0.8, 0.8, 0.8),
              borderWidth: 1,
            });
          }
        } catch {
          page.drawRectangle({
            x,
            y,
            width: itemWidthPts,
            height: itemHeightPts,
            color: rgb(0.95, 0.95, 0.95),
            borderColor: rgb(0.7, 0.7, 0.7),
            borderWidth: 1,
          });
        }
      }
      itemIndex++;
    }
  }
}

/**
 * @param {object} params
 * @param {'cycle'|'single'} [params.imageSource] cycle = use all uploads in order; single = repeat first image only
 * @param {'auto'|'fixed'} [params.sheetLayout] auto = max pack; fixed = params.itemsPerPage per sheet
 * @param {number} [params.itemsPerPage] required when sheetLayout === 'fixed'
 */
export async function generateCustomLayoutPDF({
  frontFiles,
  backFiles = [],
  itemWidth,
  itemHeight,
  quantity,
  doubleSided,
  autoSheetSize,
  sheetSize,
  imageSource = "cycle",
  sheetLayout = "auto",
  itemsPerPage = 6,
  /** When set, skip internal layout resolution (e.g. per-sheet size solver on the client). */
  resolvedLayoutResult = null,
}) {
  if (!frontFiles?.length) throw new Error("No front images provided");
  if (!quantity || quantity < 1 || quantity > 10000) throw new Error("Invalid quantity (1-10000)");
  if (doubleSided && !backFiles?.length) throw new Error("Back images required for double-sided printing");

  const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/tiff"];
  for (const file of frontFiles) {
    if (!allowedTypes.includes(file.type)) {
      throw new Error(`Unsupported file type: ${file.type}. Please use JPEG, PNG, TIFF, or PDF.`);
    }
  }

  let result = null;
  if (resolvedLayoutResult?.layout && resolvedLayoutResult?.sheetSize && SHEETS[resolvedLayoutResult.sheetSize]) {
    result = resolvedLayoutResult;
  }
  if (!result) {
    if (!itemWidth || !itemHeight || itemWidth < 10 || itemHeight < 10 || itemWidth > 2000 || itemHeight > 2000) {
      throw new Error("Invalid item dimensions (must be between 10-2000mm)");
    }
    if (!autoSheetSize && (!sheetSize || !SHEETS[sheetSize])) throw new Error("Invalid sheet size");
    if (sheetLayout === "fixed") {
      if (!itemsPerPage || itemsPerPage < 1 || itemsPerPage > 500) {
        throw new Error("Items per page must be between 1 and 500 when using fixed layout");
      }
    }
    result = autoSheetSize
      ? pickBestSheetSize(itemWidth, itemHeight, quantity, sheetLayout, itemsPerPage)
      : resolveManualSheetLayout(itemWidth, itemHeight, sheetSize, quantity, sheetLayout, itemsPerPage);
  }

  if (!result || !result.layout) {
    throw new Error(
      sheetLayout === "fixed" || resolvedLayoutResult
        ? "Cannot fit that many items per page at this size on the selected sheet. Lower items per page or enlarge the sheet."
        : "Could not compute a layout for these settings."
    );
  }

  const { layout, sheetSize: resolvedSheetSize, efficiency } = result;
  const effItemWidth = layout.itemWidth;
  const effItemHeight = layout.itemHeight;
  const sheet = SHEETS[resolvedSheetSize];
  const pdfDoc = await PDFDocument.create();

  const processedFrontImages = [];
  for (const file of frontFiles) {
    const imageBytes = await processImageForPDF(file);
    try {
      if (file.type === "image/png") processedFrontImages.push(await pdfDoc.embedPng(imageBytes));
      else processedFrontImages.push(await pdfDoc.embedJpg(imageBytes));
    } catch {
      // Ignore unreadable image.
    }
  }

  if (!processedFrontImages.length) throw new Error("No images could be processed successfully");

  const processedBackImages = [];
  if (doubleSided && backFiles.length) {
    for (const file of backFiles) {
      const imageBytes = await processImageForPDF(file);
      try {
        if (file.type === "image/png") processedBackImages.push(await pdfDoc.embedPng(imageBytes));
        else processedBackImages.push(await pdfDoc.embedJpg(imageBytes));
      } catch {
        // Ignore unreadable image.
      }
    }
  }

  drawPlacedPages(
    pdfDoc,
    sheet,
    layout,
    quantity,
    processedFrontImages,
    effItemWidth,
    effItemHeight,
    imageSource,
    false
  );

  if (doubleSided && processedBackImages.length) {
    drawPlacedPages(
      pdfDoc,
      sheet,
      layout,
      quantity,
      processedBackImages,
      effItemWidth,
      effItemHeight,
      imageSource,
      true
    );
  }

  const pdfBytes = await pdfDoc.save({ useObjectStreams: false, addDefaultPage: false, objectsPerTick: 50 });
  const sizeInfo = layout.oversized ? "oversized" : `${layout.cols}x${layout.rows}`;
  const ippTag = resolvedLayoutResult ? layout.targetItemsPerSheet : itemsPerPage;
  const modeTag = resolvedLayoutResult || sheetLayout === "fixed" ? `p${ippTag}` : "auto";
  const imgTag = imageSource === "single" ? "1img" : "multi";
  const filename = `custom-layout-${effItemWidth}x${effItemHeight}mm-${resolvedSheetSize}-${sizeInfo}-${modeTag}-${imgTag}-${layout.totalSheets}sheets${doubleSided ? "-doublesided" : ""}.pdf`;

  return {
    pdfBytes,
    filename,
    layoutInfo: {
      itemsPerSheet: layout.targetItemsPerSheet,
      totalSheets: layout.totalSheets,
      efficiency: (efficiency * 100).toFixed(1),
      oversized: layout.oversized,
      sheetLayout,
      imageSource,
    },
  };
}

export {
  SHEETS,
  computeMaxPackLayout,
  computeFixedCountLayout,
  pickBestSheetSize,
  resolveManualSheetLayout,
  PRINT_SAFE_MARGIN_MM,
  getPrintableInnerMm,
  clampedPrintMarginStart,
} from "./customLayoutMath";
