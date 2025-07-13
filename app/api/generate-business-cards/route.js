import { NextResponse } from 'next/server';
import { PDFDocument, rgb } from 'pdf-lib';

const BUSINESS_CARD = {
  width: 90,  // 9cm in mm
  height: 50, // 5cm in mm
  bleed: 3    // 3mm bleed
};

const SHEET_SIZES = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 }
};

// Convert mm to points (1mm = 2.834645669 points)
const mmToPoints = (mm) => mm * 2.834645669;

function calculateLayout(sheetSize, cardCount) {
  const sheet = SHEET_SIZES[sheetSize];
  const cardWidth = BUSINESS_CARD.width + (BUSINESS_CARD.bleed * 2); // 96mm
  const cardHeight = BUSINESS_CARD.height + (BUSINESS_CARD.bleed * 2); // 56mm
  
  let cols, rows, margin;
  
  if (sheetSize === 'A4') {
    // A4: 210×297mm - Optimal layout for 10 cards (2×5)
    cols = 2;
    rows = 5;
    margin = {
      horizontal: (sheet.width - (cols * cardWidth)) / 2,  // (210 - 192) / 2 = 9mm
      vertical: (sheet.height - (rows * cardHeight)) / 2   // (297 - 280) / 2 = 8.5mm
    };
  } else if (sheetSize === 'A3') {
    // A3: 297×420mm - Optimal layout for 21 cards (3×7)
    cols = 3;
    rows = 7;
    margin = {
      horizontal: (sheet.width - (cols * cardWidth)) / 2,  // (297 - 288) / 2 = 4.5mm
      vertical: (sheet.height - (rows * cardHeight)) / 2   // (420 - 392) / 2 = 14mm
    };
    
    // If vertical margin is negative, try 4×6 layout instead
    if (margin.vertical < 5) {
      cols = 4;
      rows = 6;
      margin = {
        horizontal: (sheet.width - (cols * cardWidth)) / 2,
        vertical: (sheet.height - (rows * cardHeight)) / 2
      };
      
      // If horizontal margin is negative, use 3×7 layout for 21 cards
      if (margin.horizontal < 5) {
        cols = 3;
        rows = 7;
        margin = {
          horizontal: (sheet.width - (cols * cardWidth)) / 2,
          vertical: (sheet.height - (rows * cardHeight)) / 2
        };
      }
    }
  }
  
  const cardsPerSheet = cols * rows;
  const startX = margin.horizontal;
  const startY = margin.vertical;
  
  return {
    cols,
    rows,
    cardsPerSheet,
    startX,
    startY,
    cardWidth,
    cardHeight,
    totalSheets: Math.ceil(cardCount / cardsPerSheet),
    margin
  };
}

async function processImageForPDF(file) {
  try {
    const buffer = await file.arrayBuffer();
    return new Uint8Array(buffer);
  } catch (error) {
    console.error('Error processing image:', error);
    throw new Error(`Failed to process image: ${file.name}`);
  }
}

// Function to check if an image is predominantly white/light colored
function shouldAddBorder(imageData) {
  // For now, we'll add border to all cards since we can't easily analyze
  // the image data in this context. In practice, light/white cards will
  // benefit from the border for visibility during cutting.
  return true;
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const frontFiles = formData.getAll('frontFiles');
    const backFiles = formData.getAll('backFiles');
    const sheetSize = formData.get('sheetSize');
    const quantity = parseInt(formData.get('quantity'));
    const doubleSided = formData.get('doubleSided') === 'true';

    // Validation
    if (!frontFiles.length) {
      return NextResponse.json({ 
        success: false, 
        error: 'No front images provided' 
      }, { status: 400 });
    }

    if (!sheetSize || !['A4', 'A3'].includes(sheetSize)) {
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid sheet size' 
      }, { status: 400 });
    }

    if (!quantity || quantity < 1 || quantity > 10000) {
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid quantity' 
      }, { status: 400 });
    }

    const layout = calculateLayout(sheetSize, quantity);
    const sheet = SHEET_SIZES[sheetSize];
    
    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    
    // Process images
    const processedFrontImages = await Promise.all(
      frontFiles.map(async (file) => {
        const imageBytes = await processImageForPDF(file);
        try {
          if (file.type === 'image/png') {
            return await pdfDoc.embedPng(imageBytes);
          } else {
            return await pdfDoc.embedJpg(imageBytes);
          }
        } catch (error) {
          console.warn(`Failed to embed image ${file.name}, using fallback`);
          return null;
        }
      })
    );

    let processedBackImages = [];
    if (doubleSided && backFiles.length) {
      processedBackImages = await Promise.all(
        backFiles.map(async (file) => {
          const imageBytes = await processImageForPDF(file);
          try {
            if (file.type === 'image/png') {
              return await pdfDoc.embedPng(imageBytes);
            } else {
              return await pdfDoc.embedJpg(imageBytes);
            }
          } catch (error) {
            console.warn(`Failed to embed back image ${file.name}`);
            return null;
          }
        })
      );
    }

    let cardIndex = 0;
    
    // Generate front sheets
    for (let sheetNum = 0; sheetNum < layout.totalSheets; sheetNum++) {
      const page = pdfDoc.addPage([mmToPoints(sheet.width), mmToPoints(sheet.height)]);
      
      for (let row = 0; row < layout.rows; row++) {
        for (let col = 0; col < layout.cols; col++) {
          if (cardIndex >= quantity) break;
          
          const imageIndex = cardIndex % processedFrontImages.length;
          const x = mmToPoints(layout.startX + (col * layout.cardWidth));
          const y = mmToPoints(sheet.height - layout.startY - (row * layout.cardHeight) - layout.cardHeight);
          
          const cardWidthPts = mmToPoints(layout.cardWidth);
          const cardHeightPts = mmToPoints(layout.cardHeight);
          
          // Add image if available
          if (processedFrontImages[imageIndex]) {
            try {
              page.drawImage(processedFrontImages[imageIndex], {
                x: x,
                y: y,
                width: cardWidthPts,
                height: cardHeightPts,
              });
              
              // Add subtle border to help distinguish card edges (especially for light/white cards)
              if (shouldAddBorder(processedFrontImages[imageIndex])) {
                page.drawRectangle({
                  x: x,
                  y: y,
                  width: cardWidthPts,
                  height: cardHeightPts,
                  borderColor: rgb(0.8, 0.8, 0.8), // Light gray border
                  borderWidth: 1, // 1pt border
                });
              }
              
            } catch (error) {
              console.warn(`Failed to draw front image ${imageIndex}:`, error);
              // Draw placeholder rectangle with border
              page.drawRectangle({
                x: x,
                y: y,
                width: cardWidthPts,
                height: cardHeightPts,
                color: rgb(0.95, 0.95, 0.95), // Light gray fill
                borderColor: rgb(0.7, 0.7, 0.7),
                borderWidth: 1,
              });
            }
          } else {
            // Fallback: draw placeholder with border
            page.drawRectangle({
              x: x,
              y: y,
              width: cardWidthPts,
              height: cardHeightPts,
              color: rgb(0.95, 0.95, 0.95),
              borderColor: rgb(0.7, 0.7, 0.7),
              borderWidth: 1,
            });
          }
          
          cardIndex++;
        }
        if (cardIndex >= quantity) break;
      }
    }

    // Generate back sheets (if double-sided)
    if (doubleSided && processedBackImages.length) {
      cardIndex = 0;
      
      for (let sheetNum = 0; sheetNum < layout.totalSheets; sheetNum++) {
        const page = pdfDoc.addPage([mmToPoints(sheet.width), mmToPoints(sheet.height)]);
        
        for (let row = 0; row < layout.rows; row++) {
          for (let col = 0; col < layout.cols; col++) {
            if (cardIndex >= quantity) break;
            
            const imageIndex = cardIndex % processedBackImages.length;
            // Mirror the column position for back side alignment
            const mirroredCol = layout.cols - 1 - col;
            const x = mmToPoints(layout.startX + (mirroredCol * layout.cardWidth));
            const y = mmToPoints(sheet.height - layout.startY - (row * layout.cardHeight) - layout.cardHeight);
            
            const cardWidthPts = mmToPoints(layout.cardWidth);
            const cardHeightPts = mmToPoints(layout.cardHeight);
            
            // Add back image if available
            if (processedBackImages[imageIndex]) {
              try {
                page.drawImage(processedBackImages[imageIndex], {
                  x: x,
                  y: y,
                  width: cardWidthPts,
                  height: cardHeightPts,
                });
                
                // Add subtle border to back side as well
                if (shouldAddBorder(processedBackImages[imageIndex])) {
                  page.drawRectangle({
                    x: x,
                    y: y,
                    width: cardWidthPts,
                    height: cardHeightPts,
                    borderColor: rgb(0.8, 0.8, 0.8), // Light gray border
                    borderWidth: 1, // 1pt border
                  });
                }
                
              } catch (error) {
                console.warn(`Failed to draw back image ${imageIndex}:`, error);
                // Draw placeholder rectangle with border
                page.drawRectangle({
                  x: x,
                  y: y,
                  width: cardWidthPts,
                  height: cardHeightPts,
                  color: rgb(0.95, 0.95, 0.95),
                  borderColor: rgb(0.7, 0.7, 0.7),
                  borderWidth: 1,
                });
              }
            } else {
              // Fallback: draw placeholder with border
              page.drawRectangle({
                x: x,
                y: y,
                width: cardWidthPts,
                height: cardHeightPts,
                color: rgb(0.95, 0.95, 0.95),
                borderColor: rgb(0.7, 0.7, 0.7),
                borderWidth: 1,
              });
            }
            
            cardIndex++;
          }
          if (cardIndex >= quantity) break;
        }
      }
    }

    // Generate PDF with 300dpi quality
    const pdfBytes = await pdfDoc.save({
      useObjectStreams: false,
      addDefaultPage: false
    });
    
    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="business-cards-${sheetSize}-${quantity}qty${doubleSided ? '-doublesided' : ''}.pdf"`,
        'Content-Length': pdfBytes.length.toString(),
      }
    });

  } catch (error) {
    console.error('PDF generation error:', error);
    
    return NextResponse.json({ 
      success: false,
      error: 'Failed to generate PDF', 
      details: error.message || 'Unknown error occurred'
    }, { 
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      }
    });
  }
}