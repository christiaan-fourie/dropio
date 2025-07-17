'use client'

import { useState, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { FiUpload, FiImage, FiX, FiCheck, FiLoader, FiSettings, FiEye, FiGrid, FiTool, FiZap, FiRotateCw, FiLayers, FiDownload } from "react-icons/fi";

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
  const [panelExpanded, setPanelExpanded] = useState(true);

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
      <div className="max-w-7xl mx-auto">
        
        {/* Header with floating stats */}
        <div className="relative mb-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center space-x-3 mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                <FiGrid className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
                  Custom Size Layout
                </h1>
                <p className="text-gray-600 text-sm">Flexible dimensions with smart optimization</p>
              </div>
            </div>
          </div>
          
          {/* Floating Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white/80 backdrop-blur-sm border border-white/20 rounded-2xl p-4 shadow-lg hover:shadow-xl transition-all duration-300">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-500 rounded-lg flex items-center justify-center">
                  <FiGrid className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Item Size</p>
                  <p className="text-lg font-bold text-gray-900">{itemWidth}×{itemHeight}mm</p>
                </div>
              </div>
            </div>
            
            {currentLayout && currentLayout.layout && (
              <>
                <div className="bg-white/80 backdrop-blur-sm border border-white/20 rounded-2xl p-4 shadow-lg hover:shadow-xl transition-all duration-300">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-green-400 to-green-500 rounded-lg flex items-center justify-center">
                      <FiLayers className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Per Sheet</p>
                      <p className="text-lg font-bold text-gray-900">{currentLayout.layout.itemsPerSheet} items</p>
                    </div>
                  </div>
                </div>
                
                <div className="bg-white/80 backdrop-blur-sm border border-white/20 rounded-2xl p-4 shadow-lg hover:shadow-xl transition-all duration-300">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-purple-500 rounded-lg flex items-center justify-center">
                      <FiRotateCw className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Sheets</p>
                      <p className="text-lg font-bold text-gray-900">{currentLayout.layout.totalSheets} on {currentLayout.sheetSize}</p>
                    </div>
                  </div>
                </div>
                
                <div className="bg-white/80 backdrop-blur-sm border border-white/20 rounded-2xl p-4 shadow-lg hover:shadow-xl transition-all duration-300">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-amber-500 rounded-lg flex items-center justify-center">
                      <FiZap className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Efficiency</p>
                      <p className="text-lg font-bold text-gray-900">{(currentLayout.efficiency * 100).toFixed(1)}%</p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Main Panel */}
        <div className="bg-white/90 backdrop-blur-xl border border-white/20 rounded-3xl shadow-2xl overflow-hidden">
          
          {/* Panel Header */}
          <div className="bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 px-8 py-6 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => setPanelExpanded(!panelExpanded)}
                  className="w-10 h-10 bg-white/50 backdrop-blur-sm border border-white/20 rounded-xl flex items-center justify-center hover:bg-white/70 transition-all duration-200"
                >
                  <FiSettings className={`w-5 h-5 text-indigo-600 transition-transform duration-300 ${panelExpanded ? 'rotate-90' : ''}`} />
                </button>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Layout Configuration</h2>
                  <p className="text-sm text-gray-600">Configure your custom print layout</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                {doubleSided && (
                  <div className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium flex items-center space-x-1">
                    <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse"></div>
                    <span>Double-sided</span>
                  </div>
                )}
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  className={`px-4 py-2 rounded-xl font-medium transition-all duration-200 flex items-center space-x-2 ${
                    showPreview 
                      ? 'bg-indigo-100 text-indigo-700 shadow-md' 
                      : 'bg-white/50 text-gray-600 hover:bg-white/70'
                  }`}
                >
                  <FiEye className="w-4 h-4" />
                  <span>{showPreview ? 'Hide' : 'Show'} Preview</span>
                </button>
              </div>
            </div>
          </div>

          <div className="p-8">
            {/* Settings Panel */}
            <div className={`transition-all duration-500 ease-in-out ${panelExpanded ? 'opacity-100 max-h-96 mb-8' : 'opacity-0 max-h-0 overflow-hidden'}`}>
              <div className="bg-gradient-to-br from-gray-50/50 to-blue-50/30 backdrop-blur-sm rounded-2xl p-6 border border-gray-100">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  
                  {/* Item Dimensions */}
                  <div className="space-y-3">
                    <label className="block text-sm font-semibold text-gray-700">Item Dimensions</label>
                    <div className="space-y-3">
                      <div className="relative">
                        <input
                          type="number"
                          min={10}
                          max={500}
                          value={itemWidth}
                          onChange={(e) => setItemWidth(Number(e.target.value))}
                          className="w-full px-4 py-3 bg-white/70 backdrop-blur-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 text-center font-medium"
                          placeholder="Width"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-medium">mm</span>
                      </div>
                      <div className="flex items-center justify-center">
                        <div className="w-8 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent"></div>
                        <span className="mx-2 text-gray-400 text-sm">×</span>
                        <div className="w-8 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent"></div>
                      </div>
                      <div className="relative">
                        <input
                          type="number"
                          min={10}
                          max={500}
                          value={itemHeight}
                          onChange={(e) => setItemHeight(Number(e.target.value))}
                          className="w-full px-4 py-3 bg-white/70 backdrop-blur-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 text-center font-medium"
                          placeholder="Height"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-medium">mm</span>
                      </div>
                    </div>
                  </div>

                  {/* Quantity */}
                  <div className="space-y-3">
                    <label className="block text-sm font-semibold text-gray-700">Quantity</label>
                    <div className="relative">
                      <input
                        type="number"
                        min={1}
                        max={10000}
                        value={quantity}
                        onChange={(e) => setQuantity(Number(e.target.value))}
                        className="w-full px-4 py-3 bg-white/70 backdrop-blur-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 text-center font-medium"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-medium">items</span>
                    </div>
                  </div>

                  {/* Sheet Size */}
                  <div className="space-y-3">
                    <label className="block text-sm font-semibold text-gray-700">Sheet Size</label>
                    <div className="space-y-3">
                      <label className="flex items-center cursor-pointer group">
                        <div className="relative">
                          <input
                            type="checkbox"
                            checked={autoSheetSize}
                            onChange={(e) => setAutoSheetSize(e.target.checked)}
                            className="sr-only"
                          />
                          <div className={`w-11 h-6 rounded-full transition-all duration-200 ${
                            autoSheetSize ? 'bg-gradient-to-r from-indigo-500 to-purple-500' : 'bg-gray-300'
                          }`}>
                            <div className={`w-5 h-5 bg-white rounded-full shadow-lg transform transition-transform duration-200 ${
                              autoSheetSize ? 'translate-x-5' : 'translate-x-0.5'
                            } translate-y-0.5`}></div>
                          </div>
                        </div>
                        <span className="ml-3 text-sm font-medium text-gray-700 group-hover:text-indigo-600 transition-colors duration-200">Auto-optimize</span>
                      </label>
                      
                      {!autoSheetSize && (
                        <select
                          value={manualSheetSize}
                          onChange={(e) => setManualSheetSize(e.target.value)}
                          className="w-full px-4 py-3 bg-white/70 backdrop-blur-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 font-medium"
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
                  <div className="space-y-3">
                    <label className="block text-sm font-semibold text-gray-700">Print Mode</label>
                    <label className="flex items-center cursor-pointer group">
                      <div className="relative">
                        <input
                          type="checkbox"
                          checked={doubleSided}
                          onChange={(e) => setDoubleSided(e.target.checked)}
                          className="sr-only"
                        />
                        <div className={`w-11 h-6 rounded-full transition-all duration-200 ${
                          doubleSided ? 'bg-gradient-to-r from-green-500 to-emerald-500' : 'bg-gray-300'
                        }`}>
                          <div className={`w-5 h-5 bg-white rounded-full shadow-lg transform transition-transform duration-200 ${
                            doubleSided ? 'translate-x-5' : 'translate-x-0.5'
                          } translate-y-0.5`}></div>
                        </div>
                      </div>
                      <span className="ml-3 text-sm font-medium text-gray-700 group-hover:text-green-600 transition-colors duration-200">Double-sided</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Layout Status */}
            {!currentLayout || !currentLayout.layout ? (
              <div className="mb-8 p-6 bg-gradient-to-r from-red-50 to-pink-50 border border-red-200 rounded-2xl">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                    <FiTool className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-red-800">Layout Issue</h3>
                    <p className="text-sm text-red-700">
                      Items ({itemWidth}×{itemHeight}mm) are too large for available sheet sizes. Please reduce the dimensions.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              currentLayout.efficiency < 0.15 && (
                <div className="mb-8 p-6 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                      <FiZap className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-amber-800">Efficiency Notice</h3>
                      <p className="text-sm text-amber-700">
                        Layout efficiency is {(currentLayout.efficiency * 100).toFixed(1)}%. Consider adjusting dimensions for better paper utilization.
                      </p>
                    </div>
                  </div>
                </div>
              )
            )}

            {/* Upload Sections */}
            <div className={`grid ${doubleSided ? 'grid-cols-2' : 'grid-cols-1'} gap-8 mb-8`}>
              {/* Front Images */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Front Images</h3>
                  {frontFiles.length > 0 && (
                    <div className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm font-medium">
                      {frontFiles.length} file{frontFiles.length !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
                
                <div
                  {...getFrontRootProps()}
                  className={`relative border-2 border-dashed rounded-2xl p-8 cursor-pointer transition-all duration-300 ${
                    frontDragActive
                      ? "border-indigo-400 bg-indigo-50/50 scale-105"
                      : frontFiles.length > 0
                      ? "border-green-300 bg-green-50/30"
                      : "border-gray-300 bg-gray-50/30 hover:border-indigo-300 hover:bg-indigo-50/30"
                  }`}
                >
                  <input {...getFrontInputProps()} />
                  <div className="text-center">
                    {frontFiles.length === 0 ? (
                      <div className="space-y-4">
                        <div className="w-16 h-16 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-2xl flex items-center justify-center mx-auto">
                          <FiUpload className="w-8 h-8 text-indigo-600" />
                        </div>
                        <div>
                          <p className="text-lg font-medium text-gray-900">Drop files or click to upload</p>
                          <p className="text-sm text-gray-600 mt-1">PNG, JPEG, TIFF, PDF • Max 10MB each</p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="w-16 h-16 bg-gradient-to-br from-green-100 to-emerald-100 rounded-2xl flex items-center justify-center mx-auto">
                          <FiCheck className="w-8 h-8 text-green-600" />
                        </div>
                        <div>
                          <p className="text-lg font-medium text-green-800">
                            {frontFiles.length} file{frontFiles.length !== 1 ? 's' : ''} ready
                          </p>
                          <p className="text-sm text-green-600 mt-1">Click to add more files</p>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {frontDragActive && (
                    <div className="absolute inset-0 bg-indigo-100/20 backdrop-blur-sm rounded-2xl flex items-center justify-center">
                      <div className="text-center">
                        <div className="w-16 h-16 bg-indigo-200 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-bounce">
                          <FiUpload className="w-8 h-8 text-indigo-600" />
                        </div>
                        <p className="text-lg font-medium text-indigo-800">Drop files here</p>
                      </div>
                    </div>
                  )}
                </div>
                
                {frontFiles.length > 0 && (
                  <div className="space-y-2 max-h-32 overflow-y-auto custom-scrollbar">
                    {frontFiles.map((file, index) => (
                      <div key={index} className="flex items-center justify-between bg-white/80 backdrop-blur-sm px-4 py-3 rounded-xl border border-gray-200 group hover:shadow-md transition-all duration-200">
                        <div className="flex items-center space-x-3 min-w-0 flex-1">
                          <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <FiImage className="w-4 h-4 text-indigo-600" />
                          </div>
                          <span className="text-sm font-medium text-gray-900 truncate">{file.name}</span>
                          <span className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(1)}MB</span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFile(index, 'front');
                          }}
                          className="w-8 h-8 bg-red-100 hover:bg-red-200 rounded-lg flex items-center justify-center transition-colors duration-200 opacity-0 group-hover:opacity-100"
                        >
                          <FiX className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Back Images (conditional) */}
              {doubleSided && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">Back Images</h3>
                    {backFiles.length > 0 && (
                      <div className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">
                        {backFiles.length} file{backFiles.length !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                  
                  <div
                    {...getBackRootProps()}
                    className={`relative border-2 border-dashed rounded-2xl p-8 cursor-pointer transition-all duration-300 ${
                      backDragActive
                        ? "border-purple-400 bg-purple-50/50 scale-105"
                        : backFiles.length > 0
                        ? "border-green-300 bg-green-50/30"
                        : "border-gray-300 bg-gray-50/30 hover:border-purple-300 hover:bg-purple-50/30"
                    }`}
                  >
                    <input {...getBackInputProps()} />
                    <div className="text-center">
                      {backFiles.length === 0 ? (
                        <div className="space-y-4">
                          <div className="w-16 h-16 bg-gradient-to-br from-purple-100 to-pink-100 rounded-2xl flex items-center justify-center mx-auto">
                            <FiUpload className="w-8 h-8 text-purple-600" />
                          </div>
                          <div>
                            <p className="text-lg font-medium text-gray-900">Drop back images here</p>
                            <p className="text-sm text-gray-600 mt-1">Will be mirrored for duplex alignment</p>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="w-16 h-16 bg-gradient-to-br from-green-100 to-emerald-100 rounded-2xl flex items-center justify-center mx-auto">
                            <FiCheck className="w-8 h-8 text-green-600" />
                          </div>
                          <div>
                            <p className="text-lg font-medium text-green-800">
                              {backFiles.length} file{backFiles.length !== 1 ? 's' : ''} ready
                            </p>
                            <p className="text-sm text-green-600 mt-1">Click to add more files</p>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {backDragActive && (
                      <div className="absolute inset-0 bg-purple-100/20 backdrop-blur-sm rounded-2xl flex items-center justify-center">
                        <div className="text-center">
                          <div className="w-16 h-16 bg-purple-200 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-bounce">
                            <FiUpload className="w-8 h-8 text-purple-600" />
                          </div>
                          <p className="text-lg font-medium text-purple-800">Drop back images here</p>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {backFiles.length > 0 && (
                    <div className="space-y-2 max-h-32 overflow-y-auto custom-scrollbar">
                      {backFiles.map((file, index) => (
                        <div key={index} className="flex items-center justify-between bg-white/80 backdrop-blur-sm px-4 py-3 rounded-xl border border-gray-200 group hover:shadow-md transition-all duration-200">
                          <div className="flex items-center space-x-3 min-w-0 flex-1">
                            <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                              <FiImage className="w-4 h-4 text-purple-600" />
                            </div>
                            <span className="text-sm font-medium text-gray-900 truncate">{file.name}</span>
                            <span className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(1)}MB</span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFile(index, 'back');
                            }}
                            className="w-8 h-8 bg-red-100 hover:bg-red-200 rounded-lg flex items-center justify-center transition-colors duration-200 opacity-0 group-hover:opacity-100"
                          >
                            <FiX className="w-4 h-4 text-red-600" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Preview Section */}
            {showPreview && currentLayout && currentLayout.layout && (
              <div className="mb-8 p-6 bg-gradient-to-br from-blue-50/50 to-indigo-50/30 backdrop-blur-sm rounded-2xl border border-blue-100">
                <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center space-x-2">
                  <FiEye className="w-5 h-5 text-indigo-600" />
                  <span>Layout Preview</span>
                </h3>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Layout Details */}
                  <div className="space-y-4">
                    <h4 className="font-medium text-gray-900">Configuration Details</h4>
                    <div className="space-y-3">
                      {[
                        { label: 'Grid layout', value: `${currentLayout.layout.cols} × ${currentLayout.layout.rows}` },
                        { label: 'Item size', value: `${itemWidth}×${itemHeight}mm` },
                        { label: 'Item spacing', value: '1mm between items' },
                        { label: 'Sheet margins', value: `${currentLayout.layout.margin?.horizontal?.toFixed(1)}mm × ${currentLayout.layout.margin?.vertical?.toFixed(1)}mm` },
                        { label: 'Paper efficiency', value: `${(currentLayout.efficiency * 100).toFixed(1)}%` }
                      ].map((item, index) => (
                        <div key={index} className="flex justify-between items-center py-2 px-4 bg-white/50 rounded-lg">
                          <span className="text-sm text-gray-600">{item.label}:</span>
                          <span className="text-sm font-semibold text-gray-900">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Visual Preview */}
                  <div className="space-y-4">
                    <h4 className="font-medium text-gray-900">Sheet Visualization</h4>
                    <div className="flex flex-col items-center space-y-4">
                      <div 
                        className="border-2 border-gray-300 bg-white relative shadow-lg rounded-lg overflow-hidden"
                        style={{
                          width: currentLayout.sheetSize === 'A4' ? '140px' : currentLayout.sheetSize === 'A3' ? '160px' : '180px',
                          height: currentLayout.sheetSize === 'A4' ? '200px' : currentLayout.sheetSize === 'A3' ? '220px' : '240px',
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
                              className="absolute bg-gradient-to-br from-indigo-100 to-purple-100 border border-indigo-300 rounded-sm shadow-sm hover:shadow-md transition-shadow duration-200"
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
                      <div className="text-center">
                        <p className="text-sm font-medium text-gray-900">{currentLayout.sheetSize} Sheet</p>
                        <p className="text-xs text-gray-600">Items positioned with 1mm spacing</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Generate Button */}
            <div className="text-center">
              <button
                onClick={handleGeneratePDF}
                disabled={!canGenerate || isGenerating}
                className={`relative px-8 py-4 rounded-2xl font-semibold text-lg transition-all duration-300 ${
                  canGenerate && !isGenerating
                    ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 shadow-lg hover:shadow-xl transform hover:-translate-y-1"
                    : "bg-gray-300 text-gray-500 cursor-not-allowed"
                } overflow-hidden`}
              >
                {/* Animated background for generating state */}
                {isGenerating && (
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 animate-pulse"></div>
                )}
                
                <div className="relative flex items-center justify-center space-x-3">
                  {isGenerating ? (
                    <>
                      <FiLoader className="animate-spin w-6 h-6" />
                      <span>Generating PDF...</span>
                    </>
                  ) : (
                    <>
                      <FiDownload className="w-6 h-6" />
                      <span>Generate Custom Layout PDF</span>
                      <span className="text-sm opacity-75">(300dpi, CMYK)</span>
                    </>
                  )}
                </div>
              </button>
              
              {!canGenerate && !isGenerating && (
                <div className="mt-4 p-4 bg-amber-50 rounded-xl">
                  <p className="text-sm text-amber-800 font-medium">
                    {frontFiles.length === 0 && "Please upload at least one front image to continue"}
                    {frontFiles.length > 0 && doubleSided && backFiles.length === 0 && "Please upload back images or disable double-sided printing"}
                    {(!currentLayout || !currentLayout.layout) && "Please adjust item dimensions to fit available sheet sizes"}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tips Section */}
        <div className="mt-8 bg-white/70 backdrop-blur-sm rounded-2xl p-6 border border-gray-200">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-xl flex items-center justify-center">
              <span className="text-white text-lg">💡</span>
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Pro Tips for Custom Layouts</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
            <div className="space-y-2">
              <p>• <strong>High-resolution images:</strong> Use 300dpi minimum for sharp print quality</p>
              <p>• <strong>Smart spacing:</strong> 1mm spacing between items ensures easy cutting</p>
              <p>• <strong>Auto optimization:</strong> Finds the most efficient layout across A4-A0 sheets</p>
            </div>
            <div className="space-y-2">
              <p>• <strong>Double-sided printing:</strong> Back images are automatically mirrored for proper alignment</p>
              <p>• <strong>Smart orientation:</strong> Portrait images rotate automatically to best fit your dimensions</p>
              <p>• <strong>Professional output:</strong> 300dpi CMYK PDFs ready for commercial printing</p>
            </div>
          </div>
        </div>
      </div>

      {/* Custom Scrollbar Styles */}
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(156, 163, 175, 0.5);
          border-radius: 2px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(156, 163, 175, 0.8);
        }
      `}</style>
    </div>
  );
}