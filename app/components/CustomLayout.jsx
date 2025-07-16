'use client'

import { useState, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { FiUpload, FiImage, FiX, FiCheck, FiLoader, FiSettings, FiEye, FiGrid, FiTool } from "react-icons/fi";

const SHEET_SIZES = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
  A2: { width: 420, height: 594 },
  A1: { width: 594, height: 841 },
  A0: { width: 841, height: 1189 }
};

function calculateOptimalLayout(itemWidth, itemHeight, sheetSize, quantity) {
  const sheet = SHEET_SIZES[sheetSize];
  const itemSpacing = 1; // 1mm space between items
  
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
    return null; // Items too large for this sheet
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
    const layout = calculateOptimalLayout(itemWidth, itemHeight, sheetSize, quantity);
    if (layout) {
      // Calculate efficiency
      const efficiency = (layout.itemsPerSheet * layout.itemWidth * layout.itemHeight) / 
                        (SHEET_SIZES[sheetSize].width * SHEET_SIZES[sheetSize].height);
      
      // If efficiency is reasonable (>15%) or it's the largest sheet, use this
      if (efficiency > 0.15 || sheetSize === 'A0') {
        return { layout, sheetSize, efficiency };
      }
    }
  }
  
  return null; // Items too large for any sheet
}

export default function CustomLayout() {
  const [frontFiles, setFrontFiles] = useState([]);
  const [backFiles, setBackFiles] = useState([]);
  const [itemWidth, setItemWidth] = useState(100);
  const [itemHeight, setItemHeight] = useState(70);
  const [quantity, setQuantity] = useState(50);
  const [doubleSided, setDoubleSided] = useState(false);
  const [autoSheetSize, setAutoSheetSize] = useState(true);
  const [manualSheetSize, setManualSheetSize] = useState("A4");
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

  // Calculate current layout
  const currentLayout = autoSheetSize 
    ? findBestSheetSize(itemWidth, itemHeight, quantity)
    : { layout: calculateOptimalLayout(itemWidth, itemHeight, manualSheetSize, quantity), sheetSize: manualSheetSize };

  // Auto-adjust quantity based on uploaded images
  useEffect(() => {
    if (frontFiles.length > 0 && frontFiles.length <= 500 && quantity === 50) {
      const suggestedQty = Math.max(frontFiles.length, 10);
      setQuantity(suggestedQty);
    }
  }, [frontFiles.length]);

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

    if (!currentLayout || !currentLayout.layout) {
      alert('Current item dimensions are too large for available sheet sizes. Please reduce the dimensions.');
      return;
    }
    
    setIsGenerating(true);
    
    try {
      const formData = new FormData();
      
      frontFiles.forEach(file => formData.append('frontFiles', file));
      if (doubleSided && backFiles.length) {
        backFiles.forEach(file => formData.append('backFiles', file));
      }
      
      formData.append('itemWidth', itemWidth.toString());
      formData.append('itemHeight', itemHeight.toString());
      formData.append('quantity', quantity.toString());
      formData.append('doubleSided', doubleSided.toString());
      formData.append('autoSheetSize', autoSheetSize.toString());
      if (!autoSheetSize) {
        formData.append('sheetSize', manualSheetSize);
      }

      const response = await fetch('/api/generate-custom-layout', {
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
      a.download = `custom-layout-${itemWidth}x${itemHeight}mm-${currentLayout.sheetSize}-${currentLayout.layout.totalSheets}sheets${doubleSided ? '-doublesided' : ''}.pdf`;
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

  const canGenerate = frontFiles.length > 0 && (!doubleSided || backFiles.length > 0) && currentLayout && currentLayout.layout;

  return (
    <div className="p-6">

      {/* Main Content Card */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        
        {/* Quick Stats Bar */}
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-2">
                <FiGrid className="w-4 h-4 text-indigo-600" />
                <span className="font-medium text-gray-700">{itemWidth}×{itemHeight}mm items</span>
              </div>
              {currentLayout && currentLayout.layout && (
                <>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <span className="font-medium text-gray-700">{currentLayout.layout.itemsPerSheet} per sheet</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="font-medium text-gray-700">{currentLayout.layout.totalSheets} sheets on {currentLayout.sheetSize}</span>
                  </div>
                </>
              )}
              {doubleSided && (
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
                  <span className="font-medium text-gray-700">Double-sided</span>
                </div>
              )}
            </div>
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="flex items-center space-x-1 text-indigo-600 hover:text-indigo-700 font-medium"
            >
              <FiEye className="w-4 h-4" />
              <span>{showPreview ? 'Hide' : 'Show'} Preview</span>
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* Settings Panel */}
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-4 mb-6 border border-gray-200">
            <div className="flex items-center space-x-2 mb-4">
              <FiSettings className="w-5 h-5 text-gray-600" />
              <h3 className="font-medium text-gray-900">Custom Layout Settings</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Item Dimensions */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-600">Item Dimensions (mm)</label>
                <div className="flex space-x-2">
                  <input
                    type="number"
                    min={10}
                    max={500}
                    value={itemWidth}
                    onChange={(e) => setItemWidth(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Width"
                  />
                  <span className="self-center text-gray-400">×</span>
                  <input
                    type="number"
                    min={10}
                    max={500}
                    value={itemHeight}
                    onChange={(e) => setItemHeight(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Height"
                  />
                </div>
              </div>

              {/* Quantity */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Quantity</label>
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Sheet Size */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Sheet Size</label>
                <div className="space-y-2">
                  <div className="flex items-center">
                    <input
                      id="auto-sheet"
                      type="checkbox"
                      checked={autoSheetSize}
                      onChange={(e) => setAutoSheetSize(e.target.checked)}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    />
                    <label htmlFor="auto-sheet" className="ml-2 text-sm text-gray-700">Auto-optimize</label>
                  </div>
                  {!autoSheetSize && (
                    <select
                      value={manualSheetSize}
                      onChange={(e) => setManualSheetSize(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="A4">A4 (210×297mm)</option>
                      <option value="A3">A3 (297×420mm)</option>
                      <option value="A2">A2 (420×594mm)</option>
                      <option value="A1">A1 (594×841mm)</option>
                      <option value="A0">A0 (841×1189mm)</option>
                    </select>
                  )}
                </div>
              </div>

              {/* Double-sided Toggle */}
              <div className="flex items-end">
                <div className="flex items-center h-10">
                  <input
                    id="double-sided"
                    type="checkbox"
                    checked={doubleSided}
                    onChange={(e) => setDoubleSided(e.target.checked)}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  />
                  <label htmlFor="double-sided" className="ml-2 text-sm text-gray-700">
                    Double-sided
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Layout Validation */}
          {!currentLayout || !currentLayout.layout ? (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center space-x-2">
                <FiTool className="w-5 h-5 text-red-600" />
                <span className="font-medium text-red-800">Layout Issue</span>
              </div>
              <p className="text-sm text-red-700 mt-1">
                Items ({itemWidth}×{itemHeight}mm) are too large for available sheet sizes. Please reduce the dimensions.
              </p>
            </div>
          ) : (
            currentLayout.efficiency < 0.15 && (
              <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-center space-x-2">
                  <FiTool className="w-5 h-5 text-amber-600" />
                  <span className="font-medium text-amber-800">Layout Warning</span>
                </div>
                <p className="text-sm text-amber-700 mt-1">
                  Low efficiency layout ({(currentLayout.efficiency * 100).toFixed(1)}% sheet usage). Consider adjusting dimensions for better paper utilization.
                </p>
              </div>
            )
          )}

          {/* Upload Sections */}
          <div className={`grid ${doubleSided ? 'grid-cols-2' : 'grid-cols-1'} gap-6 mb-6`}>
            {/* Front Images */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Front Images
                {frontFiles.length > 0 && (
                  <span className="ml-2 text-indigo-600 font-normal">({frontFiles.length} files)</span>
                )}
              </label>
              <div
                {...getFrontRootProps()}
                className={`border-2 border-dashed rounded-lg p-4 cursor-pointer transition-all duration-200 ${
                  frontDragActive
                    ? "border-indigo-500 bg-indigo-50"
                    : frontFiles.length > 0
                    ? "border-green-300 bg-green-50"
                    : "border-gray-300 bg-gray-50 hover:border-indigo-400 hover:bg-indigo-50"
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
                        <FiImage className="h-3 w-3 text-indigo-500 mr-2 flex-shrink-0" />
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
                    <span className="ml-2 text-indigo-600 font-normal">({backFiles.length} files)</span>
                  )}
                </label>
                <div
                  {...getBackRootProps()}
                  className={`border-2 border-dashed rounded-lg p-4 cursor-pointer transition-all duration-200 ${
                    backDragActive
                      ? "border-indigo-500 bg-indigo-50"
                      : backFiles.length > 0
                      ? "border-green-300 bg-green-50"
                      : "border-gray-300 bg-gray-50 hover:border-indigo-400 hover:bg-indigo-50"
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
                          <FiImage className="h-3 w-3 text-indigo-500 mr-2 flex-shrink-0" />
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
          {showPreview && currentLayout && currentLayout.layout && (
            <div className="border-t border-gray-200 pt-6 mb-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Layout Details */}
                <div className="space-y-4">
                  <h4 className="font-medium text-gray-900">Layout Details</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Grid layout:</span>
                      <span className="font-medium">{currentLayout.layout.cols} × {currentLayout.layout.rows}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Item size:</span>
                      <span className="font-medium">{itemWidth}×{itemHeight}mm</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Item spacing:</span>
                      <span className="font-medium">1mm between items</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Sheet margins:</span>
                      <span className="font-medium">
                        {currentLayout.layout.margin?.horizontal?.toFixed(1)}mm × {currentLayout.layout.margin?.vertical?.toFixed(1)}mm
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Efficiency:</span>
                      <span className="font-medium">{(currentLayout.efficiency * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                </div>

                {/* Visual Preview */}
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Sheet Preview ({currentLayout.sheetSize})</h4>
                  <div 
                    className="border-2 border-gray-300 mx-auto bg-white relative shadow-sm rounded"
                    style={{
                      width: currentLayout.sheetSize === 'A4' ? '120px' : currentLayout.sheetSize === 'A3' ? '140px' : '160px',
                      height: currentLayout.sheetSize === 'A4' ? '170px' : currentLayout.sheetSize === 'A3' ? '190px' : '220px',
                      aspectRatio: `${SHEET_SIZES[currentLayout.sheetSize].width}/${SHEET_SIZES[currentLayout.sheetSize].height}`
                    }}
                  >
                    {/* Items with spacing visualization */}
                    {Array.from({ length: Math.min(currentLayout.layout.itemsPerSheet, quantity) }).map((_, index) => {
                      const row = Math.floor(index / currentLayout.layout.cols);
                      const col = index % currentLayout.layout.cols;
                      
                      const leftPercent = ((currentLayout.layout.margin.horizontal + col * (currentLayout.layout.itemWidth + currentLayout.layout.itemSpacing)) / SHEET_SIZES[currentLayout.sheetSize].width) * 100;
                      const topPercent = ((currentLayout.layout.margin.vertical + row * (currentLayout.layout.itemHeight + currentLayout.layout.itemSpacing)) / SHEET_SIZES[currentLayout.sheetSize].height) * 100;
                      const widthPercent = (currentLayout.layout.itemWidth / SHEET_SIZES[currentLayout.sheetSize].width) * 100;
                      const heightPercent = (currentLayout.layout.itemHeight / SHEET_SIZES[currentLayout.sheetSize].height) * 100;
                      
                      return (
                        <div
                          key={index}
                          className="absolute bg-indigo-100 border border-indigo-400 rounded-sm"
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
                    Purple rectangles show item positions with 1mm spacing
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
                  ? "bg-indigo-600 text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 shadow-lg hover:shadow-xl"
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
                  <span>Generate Custom Layout PDF</span>
                  <span className="ml-2 text-sm opacity-75">(300dpi, CMYK)</span>
                </div>
              )}
            </button>
            
            {!canGenerate && (
              <p className="mt-2 text-sm text-gray-500 text-center">
                {frontFiles.length === 0 && "Please upload at least one front image to continue"}
                {frontFiles.length > 0 && doubleSided && backFiles.length === 0 && "Please upload back images or disable double-sided printing"}
                {(!currentLayout || !currentLayout.layout) && "Please adjust item dimensions to fit available sheet sizes"}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Tips Section */}
      <div className="mt-8 bg-gray-50 rounded-lg p-4">
        <h3 className="font-medium text-gray-900 mb-2">💡 Tips for Custom Layouts</h3>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>• Use high-resolution images (300dpi minimum) for sharp print quality</li>
          <li>• Items are arranged with 1mm spacing between each for easy cutting</li>
          <li>• Auto sheet size finds the most efficient layout across A4-A0 sheets</li>
          <li>• For double-sided printing, back images are automatically mirrored for proper alignment</li>
          <li>• Portrait images are automatically rotated to best fit your item dimensions</li>
        </ul>
      </div>
    </div>
  );
}