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
  
  // For very large items that exceed sheet dimensions, return single item layout
  if (itemWidth > sheet.width || itemHeight > sheet.height) {
    return {
      cols: 1,
      rows: 1,
      itemsPerSheet: 1,
      totalWidth: itemWidth,
      totalHeight: itemHeight,
      margin: {
        horizontal: Math.max(0, (sheet.width - itemWidth) / 2),
        vertical: Math.max(0, (sheet.height - itemHeight) / 2)
      },
      itemWidth,
      itemHeight,
      itemSpacing,
      totalSheets: quantity,
      sheetSize,
      oversized: true
    };
  }
  
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
  
  // If no layout found, return single item layout
  if (!bestLayout) {
    return {
      cols: 1,
      rows: 1,
      itemsPerSheet: 1,
      totalWidth: itemWidth,
      totalHeight: itemHeight,
      margin: {
        horizontal: Math.max(0, (sheet.width - itemWidth) / 2),
        vertical: Math.max(0, (sheet.height - itemHeight) / 2)
      },
      itemWidth,
      itemHeight,
      itemSpacing,
      totalSheets: quantity,
      sheetSize,
      oversized: true
    };
  }
  
  return {
    ...bestLayout,
    itemWidth,
    itemHeight,
    itemSpacing,
    totalSheets: Math.ceil(quantity / bestLayout.itemsPerSheet),
    sheetSize,
    oversized: false
  };
}

function findBestSheetSize(itemWidth, itemHeight, quantity) {
  const sheetOrder = ['A4', 'A3', 'A2', 'A1', 'A0'];
  
  // For extremely large items, go straight to A0
  if (itemWidth > 841 || itemHeight > 841) {
    const layout = calculateOptimalLayout(itemWidth, itemHeight, 'A0', quantity);
    const efficiency = layout.oversized ? 0.1 : 
      (layout.itemsPerSheet * layout.itemWidth * layout.itemHeight) / 
      (SHEET_SIZES['A0'].width * SHEET_SIZES['A0'].height);
    
    return { layout, sheetSize: 'A0', efficiency };
  }
  
  for (const sheetSize of sheetOrder) {
    const layout = calculateOptimalLayout(itemWidth, itemHeight, sheetSize, quantity);
    
    // Calculate efficiency
    const efficiency = layout.oversized ? 0.1 : 
      (layout.itemsPerSheet * layout.itemWidth * layout.itemHeight) / 
      (SHEET_SIZES[sheetSize].width * SHEET_SIZES[sheetSize].height);
    
    // For large items (>500mm), accept lower efficiency thresholds
    const efficiencyThreshold = (itemWidth > 500 || itemHeight > 500) ? 0.1 : 0.15;
    
    // If efficiency is reasonable or it's the largest sheet, use this
    if (efficiency > efficiencyThreshold || sheetSize === 'A0') {
      return { layout, sheetSize, efficiency };
    }
  }
  
  // Fallback to A0 with single item layout
  const layout = calculateOptimalLayout(itemWidth, itemHeight, 'A0', quantity);
  const efficiency = 0.1; // Low efficiency for oversized items
  
  return { layout, sheetSize: 'A0', efficiency };
}

async function processImageForPDF(file) {
  try {
    // Validate file size (increased limit for large format)
    const maxSize = 50 * 1024 * 1024; // 50MB for large format images
    if (file.size > maxSize) {
      throw new Error(`File ${file.name} is too large (max 50MB)`);
    }
    
    const buffer = await file.arrayBuffer();
    return new Uint8Array(buffer);
  } catch (error) {
    console.error('Error processing image:', error);
    throw new Error(`Failed to process image: ${file.name} - ${error.message}`);
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
function drawImageWithOrientation(page, image, x, y, itemWidthPts, itemHeightPts, itemWidth, itemHeight, layout) {
  try {
    const orientation = getSmartImageDimensions(image, itemWidth, itemHeight);
    
    // For oversized items, ensure image doesn't exceed sheet bounds
    if (layout.oversized) {
      const sheetWidthPts = mmToPoints(SHEET_SIZES[layout.sheetSize].width);
      const sheetHeightPts = mmToPoints(SHEET_SIZES[layout.sheetSize].height);
      
      // Adjust dimensions if needed
      const maxWidthPts = Math.min(itemWidthPts, sheetWidthPts - mmToPoints(10)); // 5mm margin each side
      const maxHeightPts = Math.min(itemHeightPts, sheetHeightPts - mmToPoints(10)); // 5mm margin each side
      
      // Scale proportionally if needed
      const scaleX = maxWidthPts / itemWidthPts;
      const scaleY = maxHeightPts / itemHeightPts;
      const scale = Math.min(scaleX, scaleY, 1); // Don't upscale
      
      const finalWidthPts = itemWidthPts * scale;
      const finalHeightPts = itemHeightPts * scale;
      
      // Center oversized items
      const centerX = (sheetWidthPts - finalWidthPts) / 2;
      const centerY = (sheetHeightPts - finalHeightPts) / 2;
      
      if (orientation.needsRotation) {
        page.drawImage(image, {
          x: centerX + finalWidthPts,
          y: centerY,
          width: finalHeightPts,
          height: finalWidthPts,
          rotate: degrees(90),
        });
      } else {
        page.drawImage(image, {
          x: centerX,
          y: centerY,
          width: finalWidthPts,
          height: finalHeightPts,
        });
      }
    } else {
      // Normal layout handling
      if (orientation.needsRotation) {
        page.drawImage(image, {
          x: x + itemWidthPts,
          y: y,
          width: itemHeightPts,
          height: itemWidthPts,
          rotate: degrees(90),
        });
      } else {
        page.drawImage(image, {
          x: x,
          y: y,
          width: itemWidthPts,
          height: itemHeightPts,
        });
      }
    }
  } catch (error) {
    console.error('Error drawing image with orientation:', error);
    throw error;
  }
}

// Function to add border for cutting guides
function shouldAddBorder(layout) {
  // Don't add borders for oversized items as they may extend beyond sheet
  return !layout.oversized;
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

    // Enhanced validation
    if (!frontFiles || frontFiles.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'No front images provided' 
      }, { status: 400 });
    }

    // Updated dimension validation for large format support
    if (!itemWidth || !itemHeight || itemWidth < 10 || itemHeight < 10 || 
        itemWidth > 2000 || itemHeight > 2000) {
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid item dimensions (must be between 10-2000mm)' 
      }, { status: 400 });
    }

    if (!quantity || quantity < 1 || quantity > 10000) {
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid quantity (1-10000)' 
      }, { status: 400 });
    }

    if (doubleSided && (!backFiles || backFiles.length === 0)) {
      return NextResponse.json({ 
        success: false, 
        error: 'Back images required for double-sided printing' 
      }, { status: 400 });
    }

    // Validate file types and sizes
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/tiff', 'application/pdf'];
    for (const file of frontFiles) {
      if (!allowedTypes.includes(file.type)) {
        return NextResponse.json({ 
          success: false, 
          error: `Unsupported file type: ${file.type}. Please use JPEG, PNG, TIFF, or PDF.` 
        }, { status: 400 });
      }
    }

    // Determine optimal layout
    let layout, sheetSize, efficiency;
    
    try {
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
        efficiency = layout.oversized ? 0.1 : 
          (layout.itemsPerSheet * layout.itemWidth * layout.itemHeight) / 
          (SHEET_SIZES[sheetSize].width * SHEET_SIZES[sheetSize].height);
      }
    } catch (error) {
      return NextResponse.json({ 
        success: false, 
        error: `Layout calculation failed: ${error.message}` 
      }, { status: 400 });
    }

    const sheet = SHEET_SIZES[sheetSize];
    
    // Create PDF document with appropriate settings
    const pdfDoc = await PDFDocument.create();
    
    // Process front images with enhanced error handling
    const processedFrontImages = [];
    for (let i = 0; i < frontFiles.length; i++) {
      try {
        const file = frontFiles[i];
        const imageBytes = await processImageForPDF(file);
        
        let embeddedImage;
        if (file.type === 'image/png') {
          embeddedImage = await pdfDoc.embedPng(imageBytes);
        } else if (file.type === 'application/pdf') {
          // For PDF files, we'll need to handle them differently
          // For now, skip PDF files in this implementation
          console.warn(`PDF file ${file.name} skipped - not supported in this version`);
          continue;
        } else {
          embeddedImage = await pdfDoc.embedJpg(imageBytes);
        }
        
        // Log orientation info for debugging
        const orientation = getSmartImageDimensions(embeddedImage, itemWidth, itemHeight);
        console.log(`Image ${file.name}: ${orientation.originalWidth}x${orientation.originalHeight}, rotation: ${orientation.rotation}°, oversized: ${layout.oversized}`);
        
        processedFrontImages.push(embeddedImage);
      } catch (error) {
        console.error(`Failed to process front image ${frontFiles[i].name}:`, error);
        // Continue with other images rather than failing completely
      }
    }

    if (processedFrontImages.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'No images could be processed successfully' 
      }, { status: 400 });
    }

    // Process back images if double-sided
    let processedBackImages = [];
    if (doubleSided && backFiles.length) {
      for (let i = 0; i < backFiles.length; i++) {
        try {
          const file = backFiles[i];
          const imageBytes = await processImageForPDF(file);
          
          let embeddedImage;
          if (file.type === 'image/png') {
            embeddedImage = await pdfDoc.embedPng(imageBytes);
          } else if (file.type === 'application/pdf') {
            console.warn(`PDF file ${file.name} skipped - not supported in this version`);
            continue;
          } else {
            embeddedImage = await pdfDoc.embedJpg(imageBytes);
          }
          
          const orientation = getSmartImageDimensions(embeddedImage, itemWidth, itemHeight);
          console.log(`Back image ${file.name}: ${orientation.originalWidth}x${orientation.originalHeight}, rotation: ${orientation.rotation}°`);
          
          processedBackImages.push(embeddedImage);
        } catch (error) {
          console.error(`Failed to process back image ${backFiles[i].name}:`, error);
        }
      }
    }

    let itemIndex = 0;
    
    // Generate front sheets
    for (let sheetNum = 0; sheetNum < layout.totalSheets; sheetNum++) {
      const page = pdfDoc.addPage([mmToPoints(sheet.width), mmToPoints(sheet.height)]);
      
      for (let row = 0; row < layout.rows; row++) {
        for (let col = 0; col < layout.cols; col++) {
          if (itemIndex >= quantity) break;
          
          const imageIndex = itemIndex % processedFrontImages.length;
          
          // Calculate position with spacing (adjusted for oversized items)
          const x = layout.oversized ? 
            mmToPoints((sheet.width - itemWidth) / 2) : 
            mmToPoints(layout.margin.horizontal + (col * (layout.itemWidth + layout.itemSpacing)));
          
          const y = layout.oversized ?
            mmToPoints((sheet.height - itemHeight) / 2) :
            mmToPoints(sheet.height - layout.margin.vertical - (row * (layout.itemHeight + layout.itemSpacing)) - layout.itemHeight);
          
          const itemWidthPts = mmToPoints(layout.itemWidth);
          const itemHeightPts = mmToPoints(layout.itemHeight);
          
          // Add image with smart orientation
          if (processedFrontImages[imageIndex]) {
            try {
              drawImageWithOrientation(page, processedFrontImages[imageIndex], x, y, itemWidthPts, itemHeightPts, itemWidth, itemHeight, layout);
              
              // Add cutting border (only for non-oversized items)
              if (shouldAddBorder(layout)) {
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
              console.warn(`Failed to draw front image ${imageIndex}:`, error);
              // Draw placeholder with error indication
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
            
            // For oversized items, don't mirror - just center
            const x = layout.oversized ? 
              mmToPoints((sheet.width - itemWidth) / 2) : 
              (() => {
                // Mirror column position for back side alignment
                const mirroredCol = layout.cols - 1 - col;
                return mmToPoints(layout.margin.horizontal + (mirroredCol * (layout.itemWidth + layout.itemSpacing)));
              })();
            
            const y = layout.oversized ?
              mmToPoints((sheet.height - itemHeight) / 2) :
              mmToPoints(sheet.height - layout.margin.vertical - (row * (layout.itemHeight + layout.itemSpacing)) - layout.itemHeight);
            
            const itemWidthPts = mmToPoints(layout.itemWidth);
            const itemHeightPts = mmToPoints(layout.itemHeight);
            
            // Add back image with smart orientation
            if (processedBackImages[imageIndex]) {
              try {
                drawImageWithOrientation(page, processedBackImages[imageIndex], x, y, itemWidthPts, itemHeightPts, itemWidth, itemHeight, layout);
                
                // Add cutting border (only for non-oversized items)
                if (shouldAddBorder(layout)) {
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
            }
            
            itemIndex++;
          }
          if (itemIndex >= quantity) break;
        }
      }
    }

    // Generate PDF with optimized settings
    const pdfBytes = await pdfDoc.save({
      useObjectStreams: false,
      addDefaultPage: false,
      objectsPerTick: 50, // Optimize for large documents
    });
    
    // Generate descriptive filename
    const sizeInfo = layout.oversized ? 'oversized' : `${layout.cols}x${layout.rows}`;
    const filename = `custom-layout-${itemWidth}x${itemHeight}mm-${sheetSize}-${sizeInfo}-${layout.totalSheets}sheets${doubleSided ? '-doublesided' : ''}.pdf`;
    
    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBytes.length.toString(),
        'X-Layout-Info': JSON.stringify({
          itemsPerSheet: layout.itemsPerSheet,
          totalSheets: layout.totalSheets,
          efficiency: (efficiency * 100).toFixed(1),
          oversized: layout.oversized
        })
      }
    });

  } catch (error) {
    console.error('PDF generation error:', error);
    
    // Enhanced error response
    const errorResponse = {
      success: false,
      error: 'Failed to generate PDF',
      details: error.message || 'Unknown error occurred',
      timestamp: new Date().toISOString()
    };
    
    // Different status codes for different error types
    let statusCode = 500;
    if (error.message.includes('too large') || error.message.includes('Invalid')) {
      statusCode = 400;
    } else if (error.message.includes('memory') || error.message.includes('heap')) {
      statusCode = 413; // Payload too large
    }
    
    return NextResponse.json(errorResponse, { 
      status: statusCode,
      headers: {
        'Content-Type': 'application/json',
      }
    });
  }
}