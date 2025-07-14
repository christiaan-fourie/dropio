'use client'

import { useState, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { FiUpload, FiImage, FiX, FiCheck, FiLoader, FiSettings, FiEye } from "react-icons/fi";

const BUSINESS_CARD = {
  width: 90,  // 9cm in mm
  height: 50, // 5cm in mm
  bleed: 0    // No bleed (updated)
};

const SHEET_SIZES = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 }
};

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
    // A3: 297×420mm - Optimal layout for 24 cards (3×8)
    cols = 3;
    rows = 8;
    
    // Calculate total width/height needed including spacing
    const totalWidth = (cols * cardWidth) + ((cols - 1) * cardSpacing);   // (3 * 90) + (2 * 1) = 272mm
    const totalHeight = (rows * cardHeight) + ((rows - 1) * cardSpacing); // (8 * 50) + (7 * 1) = 407mm
    
    margin = {
      horizontal: (sheet.width - totalWidth) / 2,  // (297 - 272) / 2 = 12.5mm
      vertical: (sheet.height - totalHeight) / 2   // (420 - 407) / 2 = 6.5mm
    };
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

export default function BusinessCards() {
  const [frontFiles, setFrontFiles] = useState([]);
  const [backFiles, setBackFiles] = useState([]);
  const [sheetSize, setSheetSize] = useState("A4");
  const [quantity, setQuantity] = useState(100);
  const [doubleSided, setDoubleSided] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const onDropFront = (acceptedFiles) => {
    setFrontFiles(prev => [...prev, ...acceptedFiles]);
  };

  const onDropBack = (acceptedFiles) => {
    setBackFiles(prev => [...prev, ...acceptedFiles]);
  };

  const { getRootProps: getFrontRootProps, getInputProps: getFrontInputProps, isDragActive: frontDragActive } = useDropzone({
    accept: { 
      "image/*": [".png", ".jpg", ".jpeg", ".tiff", ".tif"],
      "application/pdf": [".pdf"]
    },
    onDrop: onDropFront,
  });

  const { getRootProps: getBackRootProps, getInputProps: getBackInputProps, isDragActive: backDragActive } = useDropzone({
    accept: { 
      "image/*": [".png", ".jpg", ".jpeg", ".tiff", ".tif"],
      "application/pdf": [".pdf"]
    },
    onDrop: onDropBack,
    disabled: !doubleSided,
  });

  const layout = calculateLayout(sheetSize, quantity);

  // Auto-adjust quantity to match uploaded images
  useEffect(() => {
    if (frontFiles.length > 0 && frontFiles.length <= 500 && quantity === 100) {
      const suggestedQty = Math.max(frontFiles.length, Math.ceil(frontFiles.length / layout.cardsPerSheet) * layout.cardsPerSheet);
      setQuantity(suggestedQty);
    }
  }, [frontFiles.length, layout.cardsPerSheet]);

  // Clear back files when double-sided is turned off
  useEffect(() => {
    if (!doubleSided) {
      setBackFiles([]);
    }
  }, [doubleSided]);

  const removeFile = (index, type) => {
    if (type === 'front') {
      setFrontFiles(prev => prev.filter((_, i) => i !== index));
    } else {
      setBackFiles(prev => prev.filter((_, i) => i !== index));
    }
  };

  const handleGeneratePDF = async () => {
    if (frontFiles.length === 0) return;
    
    if (doubleSided && backFiles.length === 0) {
      alert('Please upload back images for double-sided printing or disable the double-sided option.');
      return;
    }
    
    setIsGenerating(true);
    
    try {
      const formData = new FormData();
      
      frontFiles.forEach(file => formData.append('frontFiles', file));
      if (doubleSided && backFiles.length) {
        backFiles.forEach(file => formData.append('backFiles', file));
      }
      
      formData.append('sheetSize', sheetSize);
      formData.append('quantity', quantity.toString());
      formData.append('doubleSided', doubleSided.toString());

      const response = await fetch('/api/generate-business-cards', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          throw new Error(errorData.error || errorData.details || 'Failed to generate PDF');
        } else {
          const errorText = await response.text();
          throw new Error(errorText || `HTTP ${response.status}: Failed to generate PDF`);
        }
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `business-cards-${sheetSize}-${quantity}qty${doubleSided ? '-doublesided' : ''}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert(`Failed to generate PDF: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const canGenerate = frontFiles.length > 0 && (!doubleSided || backFiles.length > 0);

  return (
    <div className="p-6">

      {/* Main Content Card */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        
        {/* Quick Stats Bar */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span className="font-medium text-gray-700">{layout.cardsPerSheet} cards per sheet</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="font-medium text-gray-700">{layout.totalSheets} sheets needed</span>
              </div>
              {doubleSided && (
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
                  <span className="font-medium text-gray-700">Double-sided</span>
                </div>
              )}
            </div>
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="flex items-center space-x-1 text-blue-600 hover:text-blue-700 font-medium"
            >
              <FiEye className="w-4 h-4" />
              <span>{showPreview ? 'Hide' : 'Show'} Preview</span>
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* Settings Row */}
          <div className="flex items-center space-x-4 mb-6 p-4 bg-gray-50 rounded-lg">
            <FiSettings className="w-5 h-5 text-gray-500" />
            <div className="flex items-center space-x-4 flex-1">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Sheet Size</label>
                <select
                  value={sheetSize}
                  onChange={(e) => setSheetSize(e.target.value)}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="A4">A4 (10 cards)</option>
                  <option value="A3">A3 (24 cards)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Quantity</label>
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="w-24 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-center">
                <input
                  id="double-sided"
                  type="checkbox"
                  checked={doubleSided}
                  onChange={(e) => setDoubleSided(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="double-sided" className="ml-2 text-sm text-gray-700">
                  Double-sided
                </label>
              </div>
            </div>
          </div>

          {/* Upload Sections */}
          <div className={`grid ${doubleSided ? 'grid-cols-2' : 'grid-cols-1'} gap-6 mb-6`}>
            {/* Front Images */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Front Images
                {frontFiles.length > 0 && (
                  <span className="ml-2 text-blue-600 font-normal">({frontFiles.length} files)</span>
                )}
              </label>
              <div
                {...getFrontRootProps()}
                className={`border-2 border-dashed rounded-lg p-4 cursor-pointer transition-all duration-200 ${
                  frontDragActive
                    ? "border-blue-500 bg-blue-50"
                    : frontFiles.length > 0
                    ? "border-green-300 bg-green-50"
                    : "border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50"
                }`}
              >
                <input {...getFrontInputProps()} />
                <div className="text-center">
                  {frontFiles.length === 0 ? (
                    <>
                      <FiUpload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                      <p className="text-sm text-gray-600">Drop files or click to upload</p>
                      <p className="text-xs text-gray-500 mt-1">PNG, JPEG, TIFF, PDF</p>
                    </>
                  ) : (
                    <>
                      <FiCheck className="mx-auto h-6 w-6 text-green-500 mb-2" />
                      <p className="text-sm text-green-700 font-medium">
                        {frontFiles.length} file{frontFiles.length !== 1 ? 's' : ''} ready
                      </p>
                    </>
                  )}
                </div>
              </div>
              
              {frontFiles.length > 0 && (
                <div className="mt-2 space-y-1 max-h-24 overflow-y-auto">
                  {frontFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between bg-white px-2 py-1 rounded border text-xs">
                      <div className="flex items-center min-w-0 flex-1">
                        <FiImage className="h-3 w-3 text-blue-500 mr-2 flex-shrink-0" />
                        <span className="text-gray-700 truncate">{file.name}</span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(index, 'front');
                        }}
                        className="text-red-500 hover:text-red-700 ml-2"
                      >
                        <FiX className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Back Images (conditional) */}
            {doubleSided && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Back Images
                  {backFiles.length > 0 && (
                    <span className="ml-2 text-blue-600 font-normal">({backFiles.length} files)</span>
                  )}
                </label>
                <div
                  {...getBackRootProps()}
                  className={`border-2 border-dashed rounded-lg p-4 cursor-pointer transition-all duration-200 ${
                    backDragActive
                      ? "border-blue-500 bg-blue-50"
                      : backFiles.length > 0
                      ? "border-green-300 bg-green-50"
                      : "border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50"
                  }`}
                >
                  <input {...getBackInputProps()} />
                  <div className="text-center">
                    {backFiles.length === 0 ? (
                      <>
                        <FiUpload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                        <p className="text-sm text-gray-600">Drop files or click to upload</p>
                        <p className="text-xs text-gray-500 mt-1">Will be mirrored for alignment</p>
                      </>
                    ) : (
                      <>
                        <FiCheck className="mx-auto h-6 w-6 text-green-500 mb-2" />
                        <p className="text-sm text-green-700 font-medium">
                          {backFiles.length} file{backFiles.length !== 1 ? 's' : ''} ready
                        </p>
                      </>
                    )}
                  </div>
                </div>
                
                {backFiles.length > 0 && (
                  <div className="mt-2 space-y-1 max-h-24 overflow-y-auto">
                    {backFiles.map((file, index) => (
                      <div key={index} className="flex items-center justify-between bg-white px-2 py-1 rounded border text-xs">
                        <div className="flex items-center min-w-0 flex-1">
                          <FiImage className="h-3 w-3 text-blue-500 mr-2 flex-shrink-0" />
                          <span className="text-gray-700 truncate">{file.name}</span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFile(index, 'back');
                          }}
                          className="text-red-500 hover:text-red-700 ml-2"
                        >
                          <FiX className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Preview Section (collapsible) */}
          {showPreview && (
            <div className="border-t border-gray-200 pt-6 mb-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Layout Details */}
                <div className="space-y-4">
                  <h4 className="font-medium text-gray-900">Layout Details</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Grid layout:</span>
                      <span className="font-medium">{layout.cols} × {layout.rows}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Card size:</span>
                      <span className="font-medium">90×50mm</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Card spacing:</span>
                      <span className="font-medium">1mm between cards</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Sheet margins:</span>
                      <span className="font-medium">
                        {layout.margin?.horizontal?.toFixed(1)}mm × {layout.margin?.vertical?.toFixed(1)}mm
                      </span>
                    </div>
                  </div>
                </div>

                {/* Visual Preview */}
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Sheet Preview ({sheetSize})</h4>
                  <div 
                    className="border-2 border-gray-300 mx-auto bg-white relative shadow-sm rounded"
                    style={{
                      width: sheetSize === 'A4' ? '120px' : '140px',
                      height: sheetSize === 'A4' ? '170px' : '190px',
                      aspectRatio: sheetSize === 'A4' ? '210/297' : '297/420'
                    }}
                  >
                    {/* Cards with spacing visualization */}
                    {Array.from({ length: Math.min(layout.cardsPerSheet, quantity) }).map((_, index) => {
                      const row = Math.floor(index / layout.cols);
                      const col = index % layout.cols;
                      
                      // Updated position calculation with spacing
                      const leftPercent = ((layout.startX + col * (layout.cardWidth + layout.cardSpacing)) / SHEET_SIZES[sheetSize].width) * 100;
                      const topPercent = ((layout.startY + row * (layout.cardHeight + layout.cardSpacing)) / SHEET_SIZES[sheetSize].height) * 100;
                      const widthPercent = (layout.cardWidth / SHEET_SIZES[sheetSize].width) * 100;
                      const heightPercent = (layout.cardHeight / SHEET_SIZES[sheetSize].height) * 100;
                      
                      return (
                        <div
                          key={index}
                          className="absolute bg-blue-100 border border-blue-400 rounded-sm"
                          style={{
                            left: `${leftPercent}%`,
                            top: `${topPercent}%`,
                            width: `${widthPercent}%`,
                            height: `${heightPercent}%`,
                          }}
                        />
                      );
                    })}
                  </div>
                  <p className="text-xs text-gray-500 text-center mt-2">
                    Blue rectangles show card positions with 1mm spacing
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Generate Button */}
          <div className="border-t border-gray-200 pt-6">
            <button
              onClick={handleGeneratePDF}
              disabled={!canGenerate || isGenerating}
              className={`w-full px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
                canGenerate && !isGenerating
                  ? "bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-lg hover:shadow-xl"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
            >
              {isGenerating ? (
                <div className="flex items-center justify-center">
                  <FiLoader className="animate-spin -ml-1 mr-3 h-5 w-5" />
                  Generating PDF...
                </div>
              ) : (
                <div className="flex items-center justify-center">
                  <span>Generate Print-Ready PDF</span>
                  <span className="ml-2 text-sm opacity-75">(300dpi, CMYK)</span>
                </div>
              )}
            </button>
            
            {!canGenerate && (
              <p className="mt-2 text-sm text-gray-500 text-center">
                {frontFiles.length === 0 && "Please upload at least one front image to continue"}
                {frontFiles.length > 0 && doubleSided && backFiles.length === 0 && "Please upload back images or disable double-sided printing"}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Tips Section */}
      <div className="mt-8 bg-gray-50 rounded-lg p-4">
        <h3 className="font-medium text-gray-900 mb-2">💡 Tips for Best Results</h3>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>• Use high-resolution images (300dpi minimum) for sharp print quality</li>
          <li>• Business cards are 90×50mm with 1mm spacing between cards for easy cutting</li>
          <li>• For double-sided printing, back images are automatically mirrored for proper alignment</li>
          <li>• A4 sheets fit 10 cards, A3 sheets fit 24 cards optimally</li>
        </ul>
      </div>
    </div>
  );
}
