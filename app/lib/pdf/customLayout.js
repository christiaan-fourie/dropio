import { PDFDocument, rgb, degrees } from "pdf-lib";
import { mmToPoints, processImageForPDF } from "./workers";

const SHEETS = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
  A2: { width: 420, height: 594 },
  A1: { width: 594, height: 841 },
  A0: { width: 841, height: 1189 },
};

function calculateLayout(itemWidth, itemHeight, sheetSize, quantity) {
  const sheet = SHEETS[sheetSize];
  const itemSpacing = 1;

  if (itemWidth > sheet.width || itemHeight > sheet.height) {
    return {
      cols: 1,
      rows: 1,
      itemsPerSheet: 1,
      margin: {
        horizontal: Math.max(0, (sheet.width - itemWidth) / 2),
        vertical: Math.max(0, (sheet.height - itemHeight) / 2),
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
  const maxCols = Math.floor((sheet.width + itemSpacing) / (itemWidth + itemSpacing));
  const maxRows = Math.floor((sheet.height + itemSpacing) / (itemHeight + itemSpacing));

  for (let cols = 1; cols <= maxCols; cols++) {
    for (let rows = 1; rows <= maxRows; rows++) {
      const totalWidth = (cols * itemWidth) + ((cols - 1) * itemSpacing);
      const totalHeight = (rows * itemHeight) + ((rows - 1) * itemSpacing);
      if (totalWidth <= sheet.width && totalHeight <= sheet.height) {
        const itemsPerSheet = cols * rows;
        if (itemsPerSheet > maxItemsPerSheet) {
          maxItemsPerSheet = itemsPerSheet;
          best = {
            cols,
            rows,
            itemsPerSheet,
            margin: {
              horizontal: (sheet.width - totalWidth) / 2,
              vertical: (sheet.height - totalHeight) / 2,
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
      margin: {
        horizontal: Math.max(0, (sheet.width - itemWidth) / 2),
        vertical: Math.max(0, (sheet.height - itemHeight) / 2),
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
    itemWidth,
    itemHeight,
    itemSpacing,
    totalSheets: Math.ceil(quantity / best.itemsPerSheet),
    sheetSize,
    oversized: false,
  };
}

function findBestSheetSize(itemWidth, itemHeight, quantity) {
  const sheetOrder = ["A4", "A3", "A2", "A1", "A0"];

  if (itemWidth > 841 || itemHeight > 841) {
    const layout = calculateLayout(itemWidth, itemHeight, "A0", quantity);
    return { layout, sheetSize: "A0", efficiency: 0.1 };
  }

  for (const sheetSize of sheetOrder) {
    const layout = calculateLayout(itemWidth, itemHeight, sheetSize, quantity);
    const efficiency = layout.oversized
      ? 0.1
      : (layout.itemsPerSheet * layout.itemWidth * layout.itemHeight) / (SHEETS[sheetSize].width * SHEETS[sheetSize].height);
    const threshold = (itemWidth > 500 || itemHeight > 500) ? 0.1 : 0.15;
    if (efficiency > threshold || sheetSize === "A0") {
      return { layout, sheetSize, efficiency };
    }
  }

  const layout = calculateLayout(itemWidth, itemHeight, "A0", quantity);
  return { layout, sheetSize: "A0", efficiency: 0.1 };
}

function drawImage(page, image, x, y, itemWidthPts, itemHeightPts, itemWidth, itemHeight, layout) {
  const imageAspectRatio = image.width / image.height;
  const itemAspectRatio = itemWidth / itemHeight;
  const needsRotation = Math.abs((1 / imageAspectRatio) - itemAspectRatio) < Math.abs(imageAspectRatio - itemAspectRatio);

  if (layout.oversized) {
    const sheetWidthPts = mmToPoints(SHEETS[layout.sheetSize].width);
    const sheetHeightPts = mmToPoints(SHEETS[layout.sheetSize].height);
    const maxWidthPts = Math.min(itemWidthPts, sheetWidthPts - mmToPoints(10));
    const maxHeightPts = Math.min(itemHeightPts, sheetHeightPts - mmToPoints(10));
    const scale = Math.min(maxWidthPts / itemWidthPts, maxHeightPts / itemHeightPts, 1);
    const finalWidthPts = itemWidthPts * scale;
    const finalHeightPts = itemHeightPts * scale;
    const centerX = (sheetWidthPts - finalWidthPts) / 2;
    const centerY = (sheetHeightPts - finalHeightPts) / 2;

    if (needsRotation) {
      page.drawImage(image, { x: centerX + finalWidthPts, y: centerY, width: finalHeightPts, height: finalWidthPts, rotate: degrees(90) });
    } else {
      page.drawImage(image, { x: centerX, y: centerY, width: finalWidthPts, height: finalHeightPts });
    }
    return;
  }

  if (needsRotation) {
    page.drawImage(image, { x: x + itemWidthPts, y, width: itemHeightPts, height: itemWidthPts, rotate: degrees(90) });
  } else {
    page.drawImage(image, { x, y, width: itemWidthPts, height: itemHeightPts });
  }
}

export async function generateCustomLayoutPDF({
  frontFiles,
  backFiles = [],
  itemWidth,
  itemHeight,
  quantity,
  doubleSided,
  autoSheetSize,
  sheetSize,
}) {
  if (!frontFiles?.length) throw new Error("No front images provided");
  if (!itemWidth || !itemHeight || itemWidth < 10 || itemHeight < 10 || itemWidth > 2000 || itemHeight > 2000) {
    throw new Error("Invalid item dimensions (must be between 10-2000mm)");
  }
  if (!quantity || quantity < 1 || quantity > 10000) throw new Error("Invalid quantity (1-10000)");
  if (doubleSided && !backFiles?.length) throw new Error("Back images required for double-sided printing");
  if (!autoSheetSize && (!sheetSize || !SHEETS[sheetSize])) throw new Error("Invalid sheet size");

  const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/tiff", "application/pdf"];
  for (const file of frontFiles) {
    if (!allowedTypes.includes(file.type)) {
      throw new Error(`Unsupported file type: ${file.type}. Please use JPEG, PNG, TIFF, or PDF.`);
    }
  }

  const result = autoSheetSize
    ? findBestSheetSize(itemWidth, itemHeight, quantity)
    : (() => {
      const layout = calculateLayout(itemWidth, itemHeight, sheetSize, quantity);
      const efficiency = layout.oversized
        ? 0.1
        : (layout.itemsPerSheet * layout.itemWidth * layout.itemHeight) / (SHEETS[sheetSize].width * SHEETS[sheetSize].height);
      return { layout, sheetSize, efficiency };
    })();

  const { layout, sheetSize: resolvedSheetSize, efficiency } = result;
  const sheet = SHEETS[resolvedSheetSize];
  const pdfDoc = await PDFDocument.create();

  const processedFrontImages = [];
  for (const file of frontFiles) {
    const imageBytes = await processImageForPDF(file);
    try {
      if (file.type === "image/png") processedFrontImages.push(await pdfDoc.embedPng(imageBytes));
      else if (file.type !== "application/pdf") processedFrontImages.push(await pdfDoc.embedJpg(imageBytes));
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
        else if (file.type !== "application/pdf") processedBackImages.push(await pdfDoc.embedJpg(imageBytes));
      } catch {
        // Ignore unreadable image.
      }
    }
  }

  let itemIndex = 0;
  for (let sheetNum = 0; sheetNum < layout.totalSheets; sheetNum++) {
    const page = pdfDoc.addPage([mmToPoints(sheet.width), mmToPoints(sheet.height)]);
    for (let row = 0; row < layout.rows; row++) {
      for (let col = 0; col < layout.cols; col++) {
        if (itemIndex >= quantity) break;
        const imageIndex = itemIndex % processedFrontImages.length;
        const x = layout.oversized
          ? mmToPoints((sheet.width - itemWidth) / 2)
          : mmToPoints(layout.margin.horizontal + (col * (layout.itemWidth + layout.itemSpacing)));
        const y = layout.oversized
          ? mmToPoints((sheet.height - itemHeight) / 2)
          : mmToPoints(sheet.height - layout.margin.vertical - (row * (layout.itemHeight + layout.itemSpacing)) - layout.itemHeight);
        const itemWidthPts = mmToPoints(layout.itemWidth);
        const itemHeightPts = mmToPoints(layout.itemHeight);
        const image = processedFrontImages[imageIndex];

        if (image) {
          try {
            drawImage(page, image, x, y, itemWidthPts, itemHeightPts, itemWidth, itemHeight, layout);
            if (!layout.oversized) {
              page.drawRectangle({ x, y, width: itemWidthPts, height: itemHeightPts, borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 1 });
            }
          } catch {
            page.drawRectangle({ x, y, width: itemWidthPts, height: itemHeightPts, color: rgb(0.95, 0.95, 0.95), borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 1 });
          }
        }
        itemIndex++;
      }
      if (itemIndex >= quantity) break;
    }
  }

  if (doubleSided && processedBackImages.length) {
    itemIndex = 0;
    for (let sheetNum = 0; sheetNum < layout.totalSheets; sheetNum++) {
      const page = pdfDoc.addPage([mmToPoints(sheet.width), mmToPoints(sheet.height)]);
      for (let row = 0; row < layout.rows; row++) {
        for (let col = 0; col < layout.cols; col++) {
          if (itemIndex >= quantity) break;
          const imageIndex = itemIndex % processedBackImages.length;
          const x = layout.oversized
            ? mmToPoints((sheet.width - itemWidth) / 2)
            : mmToPoints(layout.margin.horizontal + ((layout.cols - 1 - col) * (layout.itemWidth + layout.itemSpacing)));
          const y = layout.oversized
            ? mmToPoints((sheet.height - itemHeight) / 2)
            : mmToPoints(sheet.height - layout.margin.vertical - (row * (layout.itemHeight + layout.itemSpacing)) - layout.itemHeight);
          const itemWidthPts = mmToPoints(layout.itemWidth);
          const itemHeightPts = mmToPoints(layout.itemHeight);
          const image = processedBackImages[imageIndex];

          if (image) {
            try {
              drawImage(page, image, x, y, itemWidthPts, itemHeightPts, itemWidth, itemHeight, layout);
              if (!layout.oversized) {
                page.drawRectangle({ x, y, width: itemWidthPts, height: itemHeightPts, borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 1 });
              }
            } catch {
              page.drawRectangle({ x, y, width: itemWidthPts, height: itemHeightPts, color: rgb(0.95, 0.95, 0.95), borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 1 });
            }
          }
          itemIndex++;
        }
        if (itemIndex >= quantity) break;
      }
    }
  }

  const pdfBytes = await pdfDoc.save({ useObjectStreams: false, addDefaultPage: false, objectsPerTick: 50 });
  const sizeInfo = layout.oversized ? "oversized" : `${layout.cols}x${layout.rows}`;
  const filename = `custom-layout-${itemWidth}x${itemHeight}mm-${resolvedSheetSize}-${sizeInfo}-${layout.totalSheets}sheets${doubleSided ? "-doublesided" : ""}.pdf`;

  return {
    pdfBytes,
    filename,
    layoutInfo: {
      itemsPerSheet: layout.itemsPerSheet,
      totalSheets: layout.totalSheets,
      efficiency: (efficiency * 100).toFixed(1),
      oversized: layout.oversized,
    },
  };
}
