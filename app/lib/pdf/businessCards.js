import { PDFDocument, rgb, degrees } from "pdf-lib";
import { mmToPoints, processImageForPDF } from "./workers";

const BUSINESS_CARD = {
  width: 90,
  height: 50,
};

const SHEETS = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
};

function calculateBusinessCardLayout(sheetSize, cardCount) {
  const sheet = SHEETS[sheetSize];
  const cardWidth = BUSINESS_CARD.width;
  const cardHeight = BUSINESS_CARD.height;
  const cardSpacing = 1;

  let cols;
  let rows;
  let margin;

  if (sheetSize === "A4") {
    cols = 2;
    rows = 5;
  } else {
    cols = 3;
    rows = 8;
  }

  const totalWidth = (cols * cardWidth) + ((cols - 1) * cardSpacing);
  const totalHeight = (rows * cardHeight) + ((rows - 1) * cardSpacing);
  margin = {
    horizontal: (sheet.width - totalWidth) / 2,
    vertical: (sheet.height - totalHeight) / 2,
  };

  const cardsPerSheet = cols * rows;
  return {
    cols,
    rows,
    cardsPerSheet,
    startX: margin.horizontal,
    startY: margin.vertical,
    cardWidth,
    cardHeight,
    cardSpacing,
    totalSheets: Math.ceil(cardCount / cardsPerSheet),
  };
}

function drawBusinessCardImage(page, image, x, y, cardWidthPts, cardHeightPts) {
  const imageAspectRatio = image.width / image.height;
  const needsRotation = imageAspectRatio < 1;

  if (needsRotation) {
    page.drawImage(image, {
      x: x + cardWidthPts,
      y,
      width: cardHeightPts,
      height: cardWidthPts,
      rotate: degrees(90),
    });
    return;
  }

  page.drawImage(image, {
    x,
    y,
    width: cardWidthPts,
    height: cardHeightPts,
  });
}

export async function generateBusinessCardsPDF({
  frontFiles,
  backFiles = [],
  sheetSize,
  sheets,
  doubleSided,
}) {
  if (!frontFiles?.length) throw new Error("No front images provided");
  if (!sheetSize || !["A4", "A3"].includes(sheetSize)) throw new Error("Invalid sheet size");
  if (!sheets || sheets < 1 || sheets > 10000) throw new Error("Invalid sheet count");
  if (doubleSided && !backFiles?.length) throw new Error("Back images required for double-sided printing");

  const layout = calculateBusinessCardLayout(sheetSize, 1);
  const totalCards = sheets * layout.cardsPerSheet;
  const sheet = SHEETS[sheetSize];
  const pdfDoc = await PDFDocument.create();

  const processedFrontImages = await Promise.all(
    frontFiles.map(async (file) => {
      const imageBytes = await processImageForPDF(file);
      try {
        return file.type === "image/png" ? pdfDoc.embedPng(imageBytes) : pdfDoc.embedJpg(imageBytes);
      } catch {
        return null;
      }
    })
  );

  const processedBackImages = doubleSided && backFiles.length
    ? await Promise.all(
      backFiles.map(async (file) => {
        const imageBytes = await processImageForPDF(file);
        try {
          return file.type === "image/png" ? pdfDoc.embedPng(imageBytes) : pdfDoc.embedJpg(imageBytes);
        } catch {
          return null;
        }
      })
    )
    : [];

  let cardIndex = 0;

  for (let sheetNum = 0; sheetNum < sheets; sheetNum++) {
    const page = pdfDoc.addPage([mmToPoints(sheet.width), mmToPoints(sheet.height)]);
    for (let row = 0; row < layout.rows; row++) {
      for (let col = 0; col < layout.cols; col++) {
        if (cardIndex >= totalCards) break;
        const imageIndex = cardIndex % processedFrontImages.length;
        const x = mmToPoints(layout.startX + (col * (layout.cardWidth + layout.cardSpacing)));
        const y = mmToPoints(sheet.height - layout.startY - (row * (layout.cardHeight + layout.cardSpacing)) - layout.cardHeight);
        const cardWidthPts = mmToPoints(layout.cardWidth);
        const cardHeightPts = mmToPoints(layout.cardHeight);
        const image = processedFrontImages[imageIndex];

        if (image) {
          try {
            drawBusinessCardImage(page, image, x, y, cardWidthPts, cardHeightPts);
            page.drawRectangle({ x, y, width: cardWidthPts, height: cardHeightPts, borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 1 });
          } catch {
            page.drawRectangle({ x, y, width: cardWidthPts, height: cardHeightPts, color: rgb(0.95, 0.95, 0.95), borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 1 });
          }
        } else {
          page.drawRectangle({ x, y, width: cardWidthPts, height: cardHeightPts, color: rgb(0.95, 0.95, 0.95), borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 1 });
        }

        cardIndex++;
      }
      if (cardIndex >= totalCards) break;
    }
  }

  if (doubleSided && processedBackImages.length) {
    cardIndex = 0;
    for (let sheetNum = 0; sheetNum < sheets; sheetNum++) {
      const page = pdfDoc.addPage([mmToPoints(sheet.width), mmToPoints(sheet.height)]);
      for (let row = 0; row < layout.rows; row++) {
        for (let col = 0; col < layout.cols; col++) {
          if (cardIndex >= totalCards) break;
          const imageIndex = cardIndex % processedBackImages.length;
          const mirroredCol = layout.cols - 1 - col;
          const x = mmToPoints(layout.startX + (mirroredCol * (layout.cardWidth + layout.cardSpacing)));
          const y = mmToPoints(sheet.height - layout.startY - (row * (layout.cardHeight + layout.cardSpacing)) - layout.cardHeight);
          const cardWidthPts = mmToPoints(layout.cardWidth);
          const cardHeightPts = mmToPoints(layout.cardHeight);
          const image = processedBackImages[imageIndex];

          if (image) {
            try {
              drawBusinessCardImage(page, image, x, y, cardWidthPts, cardHeightPts);
              page.drawRectangle({ x, y, width: cardWidthPts, height: cardHeightPts, borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 1 });
            } catch {
              page.drawRectangle({ x, y, width: cardWidthPts, height: cardHeightPts, color: rgb(0.95, 0.95, 0.95), borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 1 });
            }
          } else {
            page.drawRectangle({ x, y, width: cardWidthPts, height: cardHeightPts, color: rgb(0.95, 0.95, 0.95), borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 1 });
          }

          cardIndex++;
        }
        if (cardIndex >= totalCards) break;
      }
    }
  }

  const pdfBytes = await pdfDoc.save({ useObjectStreams: false, addDefaultPage: false });
  return {
    pdfBytes,
    filename: `business-cards-${sheetSize}-${sheets}sheets${doubleSided ? "-doublesided" : ""}.pdf`,
  };
}
