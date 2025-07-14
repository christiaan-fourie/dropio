import { NextResponse } from 'next/server';
import { PDFDocument, rgb } from 'pdf-lib';

const BUSINESS_CARD = {
  width: 90,  // 9cm in mm
  height: 50, // 5cm in mm
  bleed: 0    // No bleed
};

const SHEET_SIZES = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 }
};

// Convert mm to points (1mm = 2.834645669 points)
const mmToPoints = (mm) => mm * 2.834645669;

function calculateLayout(sheetSize, cardCount) {
  const sheet = SHEET_SIZES[sheetSize];
  const cardWidth = BUSINESS_CARD.width; // 90mm (no bleed)
  const cardHeight = BUSINESS_CARD.height; // 50mm (no bleed)
  const cardSpacing = 1; // 1mm space between cards
  
  let cols, rows, margin;
  
  if (sheetSize === 'A4') {
    // A4: 210×297mm - Optimal layout for 10 cards (2×5)
    cols = 2;
    rows = 5;
    
    // Calculate total width/height needed including spacing
    const totalWidth = (cols * cardWidth) + ((cols - 1) * cardSpacing);
    const totalHeight = (rows * cardHeight) + ((rows - 1) * cardSpacing);
    
    margin = {
      horizontal: (sheet.width - totalWidth) / 2,  // Center horizontally
      vertical: (sheet.height - totalHeight) / 2   // Center vertically
    };
  } else if (sheetSize === 'A3') {
    // A3: 297×420mm - Try 3×8 layout for 24 cards first (better fit)
    cols = 3;
    rows = 8;
    
    // Calculate total width/height needed including spacing
    const totalWidth = (cols * cardWidth) + ((cols - 1) * cardSpacing);   // (3 * 90) + (2 * 1) = 272mm
    const totalHeight = (rows * cardHeight) + ((rows - 1) * cardSpacing); // (8 * 50) + (7 * 1) = 407mm
    
    margin = {
      horizontal: (sheet.width - totalWidth) / 2,  // (297 - 272) / 2 = 12.5mm
      vertical: (sheet.height - totalHeight) / 2   // (420 - 407) / 2 = 6.5mm
    };
    
    // Check if margins are acceptable (at least 5mm)
    if (margin.horizontal < 5 || margin.vertical < 5) {
      // Fallback to 4×6 layout if 3×8 doesn't fit well
      cols = 4;
      rows = 6;
      const totalWidth4x6 = (cols * cardWidth) + ((cols - 1) * cardSpacing);   // (4 * 90) + (3 * 1) = 363mm
      const totalHeight4x6 = (rows * cardHeight) + ((rows - 1) * cardSpacing); // (6 * 50) + (5 * 1) = 305mm
      
      // Check if 4×6 fits better (though it likely won't due to width)
      if (totalWidth4x6 <= sheet.width && totalHeight4x6 <= sheet.height) {
        margin = {
          horizontal: (sheet.width - totalWidth4x6) / 2,
          vertical: (sheet.height - totalHeight4x6) / 2
        };
      } else {
        // Revert to 3×8 as it's the best option for A3
        cols = 3;
        rows = 8;
        margin = {
          horizontal: (sheet.width - totalWidth) / 2,  // 12.5mm
          vertical: (sheet.height - totalHeight) / 2   // 6.5mm
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
    cardSpacing,
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
  // Add border to all cards for visibility during cutting
  return true;
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const frontFiles = formData.getAll('frontFiles');
    const backFiles = formData.getAll('backFiles');
    const sheetSize = formData.get('sheetSize');
    const sheets = parseInt(formData.get('sheets')); // CHANGED: now expects 'sheets'
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

    if (!sheets || sheets < 1 || sheets > 10000) {
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid sheet count' 
      }, { status: 400 });
    }

    const layout = calculateLayout(sheetSize, 1); // Get cardsPerSheet
    const cardsPerSheet = layout.cardsPerSheet;
    const totalCards = sheets * cardsPerSheet;
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
    for (let sheetNum = 0; sheetNum < sheets; sheetNum++) {
      const page = pdfDoc.addPage([mmToPoints(sheet.width), mmToPoints(sheet.height)]);
      
      for (let row = 0; row < layout.rows; row++) {
        for (let col = 0; col < layout.cols; col++) {
          if (cardIndex >= totalCards) break;
          
          const imageIndex = cardIndex % processedFrontImages.length;
          
          // Calculate position with spacing
          const x = mmToPoints(layout.startX + (col * (layout.cardWidth + layout.cardSpacing)));
          const y = mmToPoints(sheet.height - layout.startY - (row * (layout.cardHeight + layout.cardSpacing)) - layout.cardHeight);
          
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
              
              // Add subtle border to help distinguish card edges
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
        if (cardIndex >= totalCards) break;
      }
    }

    // Generate back sheets (if double-sided)
    if (doubleSided && processedBackImages.length) {
      cardIndex = 0;
      
      for (let sheetNum = 0; sheetNum < sheets; sheetNum++) {
        const page = pdfDoc.addPage([mmToPoints(sheet.width), mmToPoints(sheet.height)]);
        
        for (let row = 0; row < layout.rows; row++) {
          for (let col = 0; col < layout.cols; col++) {
            if (cardIndex >= totalCards) break;
            
            const imageIndex = cardIndex % processedBackImages.length;
            const mirroredCol = layout.cols - 1 - col;
            // Mirror the column position for back side alignment
            const x = mmToPoints(layout.startX + (mirroredCol * (layout.cardWidth + layout.cardSpacing)));
            const y = mmToPoints(sheet.height - layout.startY - (row * (layout.cardHeight + layout.cardSpacing)) - layout.cardHeight);
            
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
          if (cardIndex >= totalCards) break;
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
        'Content-Disposition': `attachment; filename="business-cards-${sheetSize}-${sheets}sheets${doubleSided ? '-doublesided' : ''}.pdf"`,
        'Content-Length': pdfBytes.length.toString(),
      }
    });
  } catch (error) {
    console.error('PDF generation error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to generate PDF' },
      { status: 500 }
    );
  }
}