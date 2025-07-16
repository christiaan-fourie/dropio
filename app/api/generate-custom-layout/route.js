import { NextResponse } from 'next/server';
import { PDFDocument, rgb, degrees } from 'pdf-lib';

const SHEET_SIZES = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
  A2: { width: 420, height: 594 },
  A1: { width: 594, height: 841 },
  A0: { width: 841, height: 1189 }
};

// Convert mm to points (1mm = 2.834645669 points)
const mmToPoints = (mm) => mm * 2.834645669;

function calculateOptimalLayout(itemWidth, itemHeight, sheetSize, quantity) {
  const sheet = SHEET_SIZES[sheetSize];
  const itemSpacing = 1; // 1mm space between items
  
  // Try different grid configurations to find the best fit
  let bestLayout = null;
  let maxItemsPerSheet = 0;
  
  // Calculate maximum possible columns and rows
  const maxCols = Math.floor((sheet.width + itemSpacing) / (itemWidth + itemSpacing));
  const maxRows = Math.floor((sheet.height + itemSpacing) / (itemHeight + itemSpacing));
  
  // Try different combinations
  for (let cols = 1; cols <= maxCols; cols++) {
    for (let rows = 1; rows <= maxRows; rows++) {
      // Calculate total space needed including spacing
      const totalWidth = (cols * itemWidth) + ((cols - 1) * itemSpacing);
      const totalHeight = (rows * itemHeight) + ((rows - 1) * itemSpacing);
      
      // Check if it fits within sheet dimensions
      if (totalWidth <= sheet.width && totalHeight <= sheet.height) {
        const itemsPerSheet = cols * rows;
        
        // Choose layout with maximum items per sheet
        if (itemsPerSheet > maxItemsPerSheet) {
          maxItemsPerSheet = itemsPerSheet;
          
          bestLayout = {
            cols,
            rows,
            itemsPerSheet,
            totalWidth,
            totalHeight,
            margin: {
              horizontal: (sheet.width - totalWidth) / 2,
              vertical: (sheet.height - totalHeight) / 2
            }
          };
        }
      }
    }
  }
  
  if (!bestLayout) {
    throw new Error(`Items (${itemWidth}×${itemHeight}mm) are too large for ${sheetSize} sheet`);
  }
  
  return {
    ...bestLayout,
    itemWidth,
    itemHeight,
    itemSpacing,
    totalSheets: Math.ceil(quantity / bestLayout.itemsPerSheet),
    sheetSize
  };
}

function findBestSheetSize(itemWidth, itemHeight, quantity) {
  const sheetOrder = ['A4', 'A3', 'A2', 'A1', 'A0'];
  
  for (const sheetSize of sheetOrder) {
    try {
      const layout = calculateOptimalLayout(itemWidth, itemHeight, sheetSize, quantity);
      
      // Prefer layouts that minimize waste and sheets
      const efficiency = (layout.itemsPerSheet * layout.itemWidth * layout.itemHeight) / 
                        (SHEET_SIZES[sheetSize].width * SHEET_SIZES[sheetSize].height);
      
      // If efficiency is reasonable (>20%) and fits quantity well, use this sheet
      if (efficiency > 0.2 || sheetSize === 'A0') {
        return { layout, sheetSize, efficiency };
      }
    } catch (error) {
      continue; // Try next sheet size
    }
  }
  
  throw new Error('Items are too large for any available sheet size');
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

// Smart orientation detection for custom layouts
function getSmartImageDimensions(image, itemWidth, itemHeight) {
  const imageWidth = image.width;
  const imageHeight = image.height;
  const itemAspectRatio = itemWidth / itemHeight;
  const imageAspectRatio = imageWidth / imageHeight;
  
  // Determine if rotation would better match the item aspect ratio
  const landscapeDiff = Math.abs(imageAspectRatio - itemAspectRatio);
  const portraitDiff = Math.abs((1 / imageAspectRatio) - itemAspectRatio);
  
  const needsRotation = portraitDiff < landscapeDiff;
  
  return {
    needsRotation,
    originalWidth: imageWidth,
    originalHeight: imageHeight,
    finalWidth: needsRotation ? imageHeight : imageWidth,
    finalHeight: needsRotation ? imageWidth : imageHeight,
    rotation: needsRotation ? 90 : 0
  };
}

// Function to draw image with smart orientation for custom layouts
function drawImageWithOrientation(page, image, x, y, itemWidthPts, itemHeightPts, itemWidth, itemHeight) {
  const orientation = getSmartImageDimensions(image, itemWidth, itemHeight);
  
  if (orientation.needsRotation) {
    // Rotate 90 degrees clockwise and adjust position
    page.drawImage(image, {
      x: x + itemWidthPts, // Move to right edge
      y: y, // Keep Y position
      width: itemHeightPts, // Swap dimensions
      height: itemWidthPts,
      rotate: degrees(90), // Rotate 90 degrees clockwise
    });
  } else {
    // Normal orientation
    page.drawImage(image, {
      x: x,
      y: y,
      width: itemWidthPts,
      height: itemHeightPts,
    });
  }
}

// Function to add border for cutting guides
function shouldAddBorder() {
  return true; // Always add border for custom layouts
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const frontFiles = formData.getAll('frontFiles');
    const backFiles = formData.getAll('backFiles');
    const itemWidth = parseFloat(formData.get('itemWidth'));
    const itemHeight = parseFloat(formData.get('itemHeight'));
    const quantity = parseInt(formData.get('quantity'));
    const doubleSided = formData.get('doubleSided') === 'true';
    const autoSheetSize = formData.get('autoSheetSize') === 'true';
    const manualSheetSize = formData.get('sheetSize');

    // Validation
    if (!frontFiles.length) {
      return NextResponse.json({ 
        success: false, 
        error: 'No front images provided' 
      }, { status: 400 });
    }

    if (!itemWidth || !itemHeight || itemWidth < 10 || itemHeight < 10 || 
        itemWidth > 500 || itemHeight > 500) {
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid item dimensions (must be between 10-500mm)' 
      }, { status: 400 });
    }

    if (!quantity || quantity < 1 || quantity > 10000) {
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid quantity (1-10000)' 
      }, { status: 400 });
    }

    if (doubleSided && backFiles.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'Back images required for double-sided printing' 
      }, { status: 400 });
    }

    // Determine optimal layout
    let layout, sheetSize, efficiency;
    
    if (autoSheetSize) {
      const result = findBestSheetSize(itemWidth, itemHeight, quantity);
      layout = result.layout;
      sheetSize = result.sheetSize;
      efficiency = result.efficiency;
    } else {
      if (!manualSheetSize || !SHEET_SIZES[manualSheetSize]) {
        return NextResponse.json({ 
          success: false, 
          error: 'Invalid sheet size' 
        }, { status: 400 });
      }
      sheetSize = manualSheetSize;
      layout = calculateOptimalLayout(itemWidth, itemHeight, sheetSize, quantity);
      efficiency = (layout.itemsPerSheet * layout.itemWidth * layout.itemHeight) / 
                   (SHEET_SIZES[sheetSize].width * SHEET_SIZES[sheetSize].height);
    }

    const sheet = SHEET_SIZES[sheetSize];
    const totalItems = layout.totalSheets * layout.itemsPerSheet;
    
    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    
    // Process front images with orientation detection
    const processedFrontImages = await Promise.all(
      frontFiles.map(async (file) => {
        const imageBytes = await processImageForPDF(file);
        try {
          let embeddedImage;
          if (file.type === 'image/png') {
            embeddedImage = await pdfDoc.embedPng(imageBytes);
          } else {
            embeddedImage = await pdfDoc.embedJpg(imageBytes);
          }
          
          // Log orientation info for debugging
          const orientation = getSmartImageDimensions(embeddedImage, itemWidth, itemHeight);
          console.log(`Image ${file.name}: ${orientation.originalWidth}x${orientation.originalHeight}, rotation: ${orientation.rotation}°`);
          
          return embeddedImage;
        } catch (error) {
          console.warn(`Failed to embed image ${file.name}, using fallback`);
          return null;
        }
      })
    );

    // Process back images if double-sided
    let processedBackImages = [];
    if (doubleSided && backFiles.length) {
      processedBackImages = await Promise.all(
        backFiles.map(async (file) => {
          const imageBytes = await processImageForPDF(file);
          try {
            let embeddedImage;
            if (file.type === 'image/png') {
              embeddedImage = await pdfDoc.embedPng(imageBytes);
            } else {
              embeddedImage = await pdfDoc.embedJpg(imageBytes);
            }
            
            const orientation = getSmartImageDimensions(embeddedImage, itemWidth, itemHeight);
            console.log(`Back image ${file.name}: ${orientation.originalWidth}x${orientation.originalHeight}, rotation: ${orientation.rotation}°`);
            
            return embeddedImage;
          } catch (error) {
            console.warn(`Failed to embed back image ${file.name}`);
            return null;
          }
        })
      );
    }

    let itemIndex = 0;
    
    // Generate front sheets
    for (let sheetNum = 0; sheetNum < layout.totalSheets; sheetNum++) {
      const page = pdfDoc.addPage([mmToPoints(sheet.width), mmToPoints(sheet.height)]);
      
      for (let row = 0; row < layout.rows; row++) {
        for (let col = 0; col < layout.cols; col++) {
          if (itemIndex >= quantity) break;
          
          const imageIndex = itemIndex % processedFrontImages.length;
          
          // Calculate position with spacing
          const x = mmToPoints(layout.margin.horizontal + (col * (layout.itemWidth + layout.itemSpacing)));
          const y = mmToPoints(sheet.height - layout.margin.vertical - (row * (layout.itemHeight + layout.itemSpacing)) - layout.itemHeight);
          
          const itemWidthPts = mmToPoints(layout.itemWidth);
          const itemHeightPts = mmToPoints(layout.itemHeight);
          
          // Add image with smart orientation
          if (processedFrontImages[imageIndex]) {
            try {
              drawImageWithOrientation(page, processedFrontImages[imageIndex], x, y, itemWidthPts, itemHeightPts, itemWidth, itemHeight);
              
              // Add cutting border
              if (shouldAddBorder()) {
                page.drawRectangle({
                  x: x,
                  y: y,
                  width: itemWidthPts,
                  height: itemHeightPts,
                  borderColor: rgb(0.8, 0.8, 0.8), // Light gray border
                  borderWidth: 1, // 1pt border
                });
              }
              
            } catch (error) {
              console.warn(`Failed to draw front image ${imageIndex}:`, error);
              // Draw placeholder
              page.drawRectangle({
                x: x,
                y: y,
                width: itemWidthPts,
                height: itemHeightPts,
                color: rgb(0.95, 0.95, 0.95),
                borderColor: rgb(0.7, 0.7, 0.7),
                borderWidth: 1,
              });
            }
          } else {
            // Draw placeholder
            page.drawRectangle({
              x: x,
              y: y,
              width: itemWidthPts,
              height: itemHeightPts,
              color: rgb(0.95, 0.95, 0.95),
              borderColor: rgb(0.7, 0.7, 0.7),
              borderWidth: 1,
            });
          }
          
          itemIndex++;
        }
        if (itemIndex >= quantity) break;
      }
    }

    // Generate back sheets (if double-sided)
    if (doubleSided && processedBackImages.length) {
      itemIndex = 0;
      
      for (let sheetNum = 0; sheetNum < layout.totalSheets; sheetNum++) {
        const page = pdfDoc.addPage([mmToPoints(sheet.width), mmToPoints(sheet.height)]);
        
        for (let row = 0; row < layout.rows; row++) {
          for (let col = 0; col < layout.cols; col++) {
            if (itemIndex >= quantity) break;
            
            const imageIndex = itemIndex % processedBackImages.length;
            // Mirror column position for back side alignment
            const mirroredCol = layout.cols - 1 - col;
            const x = mmToPoints(layout.margin.horizontal + (mirroredCol * (layout.itemWidth + layout.itemSpacing)));
            const y = mmToPoints(sheet.height - layout.margin.vertical - (row * (layout.itemHeight + layout.itemSpacing)) - layout.itemHeight);
            
            const itemWidthPts = mmToPoints(layout.itemWidth);
            const itemHeightPts = mmToPoints(layout.itemHeight);
            
            // Add back image with smart orientation
            if (processedBackImages[imageIndex]) {
              try {
                drawImageWithOrientation(page, processedBackImages[imageIndex], x, y, itemWidthPts, itemHeightPts, itemWidth, itemHeight);
                
                // Add cutting border
                if (shouldAddBorder()) {
                  page.drawRectangle({
                    x: x,
                    y: y,
                    width: itemWidthPts,
                    height: itemHeightPts,
                    borderColor: rgb(0.8, 0.8, 0.8),
                    borderWidth: 1,
                  });
                }
                
              } catch (error) {
                console.warn(`Failed to draw back image ${imageIndex}:`, error);
                page.drawRectangle({
                  x: x,
                  y: y,
                  width: itemWidthPts,
                  height: itemHeightPts,
                  color: rgb(0.95, 0.95, 0.95),
                  borderColor: rgb(0.7, 0.7, 0.7),
                  borderWidth: 1,
                });
              }
            } else {
              page.drawRectangle({
                x: x,
                y: y,
                width: itemWidthPts,
                height: itemHeightPts,
                color: rgb(0.95, 0.95, 0.95),
                borderColor: rgb(0.7, 0.7, 0.7),
                borderWidth: 1,
              });
            }
            
            itemIndex++;
          }
          if (itemIndex >= quantity) break;
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
        'Content-Disposition': `attachment; filename="custom-layout-${itemWidth}x${itemHeight}mm-${sheetSize}-${layout.totalSheets}sheets${doubleSided ? '-doublesided' : ''}.pdf"`,
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