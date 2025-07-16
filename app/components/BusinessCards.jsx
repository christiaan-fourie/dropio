'use client'

import { useState, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { FiUpload, FiImage, FiX, FiCheck, FiLoader, FiSettings, FiEye } from "react-icons/fi";
import { FaToggleOn, FaAddressCard  } from "react-icons/fa6";

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
  const [sheets, setSheets] = useState(10); // Now represents sheets, not cards
  const [doubleSided, setDoubleSided] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const layout = calculateLayout(sheetSize, sheets * calculateLayout(sheetSize, 1).cardsPerSheet);
  const totalCards = sheets * layout.cardsPerSheet;

  // Auto-adjust sheets to fit all uploaded images
  useEffect(() => {
    if (frontFiles.length > 0 && frontFiles.length <= 500) {
      const neededSheets = Math.ceil(frontFiles.length / layout.cardsPerSheet);
      if (sheets < neededSheets) setSheets(neededSheets);
    }
  }, [frontFiles.length, layout.cardsPerSheet]);

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
      formData.append('sheets', sheets.toString());
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
      a.download = `business-cards-${sheetSize}-${sheets}sheets${doubleSided ? '-doublesided' : ''}.pdf`;
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
      {/* INSANE Streamlined Settings & Upload Row */}
      <div className="relative mb-6 p-6 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 rounded-2xl border border-slate-200 shadow-xl">
        {/* Animated Background Elements */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-indigo-500/5 rounded-2xl"></div>
        <div className="absolute top-4 right-4 w-32 h-32 bg-gradient-to-br from-blue-200/30 to-indigo-300/30 rounded-full blur-3xl"></div>
        <div className="absolute bottom-4 left-4 w-24 h-24 bg-gradient-to-br from-emerald-200/30 to-cyan-300/30 rounded-full blur-2xl"></div>
        
        <div className="relative z-10">
          {/* Header with Icon */}
          <div className="flex items-center mb-6">
            <div className="flex items-center justify-center w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg mr-4">
              <FaAddressCard className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Business Cards</h3>
              <p className="text-sm text-gray-600"> Configure your business card printing options</p>
            </div>
            {/* Status Indicator */}
            <div className="ml-auto flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${frontFiles.length > 0 ? 'bg-emerald-500' : 'bg-gray-300'} animate-pulse`}></div>
              <span className="text-xs font-medium text-gray-600">
                {frontFiles.length > 0 ? 'Ready' : 'Waiting for files'}
              </span>
            </div>
          </div>

          {/* Main Configuration Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-end">
            
            {/* Settings Panel - 4 columns */}
            <div className="lg:col-span-4 space-y-4">
              <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-white/50 shadow-lg">
                <div className="grid grid-cols-1 gap-4">
                  
                  {/* Sheet Size */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">
                      Sheet Size
                    </label>
                    <div className="relative">
                      <select
                        value={sheetSize}
                        onChange={(e) => setSheetSize(e.target.value)}
                        className="w-full px-4 py-3 text-sm font-medium bg-white border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 hover:border-blue-300 shadow-sm"
                      >
                        <option value="A4">A4 (10 cards)</option>
                        <option value="A3">A3 (24 cards)</option>
                      </select>
                    </div>
                  </div>

                  {/* Sheets Quantity */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">
                      Sheets
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min={1}
                        max={1000}
                        value={sheets}
                        onChange={(e) => setSheets(Number(e.target.value))}
                        className="w-full px-4 py-3 text-sm font-bold bg-white border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200 hover:border-emerald-300 shadow-sm text-center"
                      />
                      <div className="absolute -bottom-6 left-0 right-0 text-center">
                        <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                          {totalCards} cards total
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Double-sided Toggle */}
                  <div>
                    <label className="block text-xs font-extrabold text-gray-800 mb-2 uppercase tracking-widest drop-shadow-sm">
                      Print Mode
                    </label>
                    <div className="relative flex items-center">
                      <button
                        onClick={() => setDoubleSided(!doubleSided)}
                        className={`w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-extrabold text-base transition-all duration-300 transform hover:scale-105 shadow-xl border-2 focus:outline-none focus:ring-2 focus:ring-amber-400
                          ${doubleSided
                            ? 'bg-gradient-to-r from-amber-400 via-orange-400 to-orange-600 text-white border-amber-400 shadow-amber-400/30'
                            : 'bg-gradient-to-r from-gray-100 via-gray-200 to-gray-300 text-gray-700 border-gray-200 hover:from-gray-200 hover:to-gray-400'}
                        `}
                        aria-pressed={doubleSided}
                        tabIndex={0}
                      >
                        <span className={`transition-colors duration-200 ${doubleSided ? 'text-white' : 'text-gray-700'}`}>
                          {doubleSided ? 'Double-Sided' : 'Single-Sided'}
                        </span>
                        <FaToggleOn
                          className={`ml-2 text-xl transition-transform duration-300 ${
                            doubleSided
                              ? 'rotate-0 text-white drop-shadow-[0_2px_8px_rgba(255,183,77,0.5)]'
                              : '-rotate-90 text-gray-400'
                          }`}
                        />
                      </button>
                      <span
                        className={`absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white shadow ${
                          doubleSided ? 'bg-amber-400 animate-pulse' : 'bg-gray-300'
                        }`}
                        aria-hidden="true"
                      ></span>
                    </div>
                    <div className="text-xs text-gray-500 mt-2">
                      {doubleSided
                        ? 'Back images will be mirrored for perfect duplex alignment.'
                        : 'Single-sided: only front images will be printed.'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Upload Areas - 8 columns */}
            <div className="lg:col-span-8">
              <div className={`grid ${doubleSided ? 'grid-cols-2' : 'grid-cols-1'} gap-6`}>
                
                {/* Front Images Upload */}
                <div className="relative group">
                  <label className="block text-xs font-bold text-gray-700 mb-3 uppercase tracking-wide">
                    Front Images
                    {frontFiles.length > 0 && (
                      <span className="ml-2 px-2 py-1 bg-blue-500 text-white text-xs rounded-full font-bold">
                        {frontFiles.length}
                      </span>
                    )}
                  </label>
                  
                  <div
                    {...getFrontRootProps()}
                    className={`relative overflow-hidden border-3 border-dashed rounded-2xl cursor-pointer transition-all duration-300 transform hover:scale-[1.02] ${
                      frontDragActive
                        ? "border-blue-500 bg-gradient-to-br from-blue-50 to-indigo-100 shadow-2xl scale-[1.02]"
                        : frontFiles.length > 0
                        ? "border-emerald-400 bg-gradient-to-br from-emerald-50 to-green-100 shadow-xl hover:shadow-2xl"
                        : "border-gray-300 bg-gradient-to-br from-gray-50 to-slate-100 hover:border-blue-400 hover:bg-gradient-to-br hover:from-blue-50 hover:to-indigo-50 shadow-lg hover:shadow-xl"
                    }`}
                  >
                    <input {...getFrontInputProps()} />
                    
                    {/* Upload Area Content */}
                    <div className="p-6 text-center min-h-[120px] flex flex-col justify-center">
                      {frontFiles.length === 0 ? (
                        <>
                          <div className="w-16 h-16 mx-auto mb-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform duration-300">
                            <FiUpload className="w-8 h-8 text-white" />
                          </div>
                          <p className="text-sm font-bold text-gray-700 mb-1">Drop your front images here</p>
                          <p className="text-xs text-gray-500">or click to browse files</p>
                        </>
                      ) : (
                        <>
                          <div className="w-16 h-16 mx-auto mb-3 bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl flex items-center justify-center shadow-lg">
                            <FiCheck className="w-8 h-8 text-white" />
                          </div>
                          <p className="text-sm font-bold text-emerald-700">
                            {frontFiles.length} file{frontFiles.length !== 1 ? 's' : ''} ready to print
                          </p>
                        </>
                      )}
                    </div>

                    {/* Animated Border Effect */}
                    <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-pink-500/20 animate-pulse"></div>
                    </div>
                  </div>

                  {/* File List */}
                  {frontFiles.length > 0 && (
                    <div className="mt-3 space-y-2 max-h-24 overflow-y-auto">
                      {frontFiles.slice(0, 3).map((file, index) => (
                        <div key={index} className="flex items-center justify-between bg-white/90 backdrop-blur-sm px-3 py-2 rounded-lg border border-white/50 shadow-sm">
                          <div className="flex items-center min-w-0 flex-1">
                            <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-md flex items-center justify-center mr-2">
                              <FiImage className="w-3 h-3 text-white" />
                            </div>
                            <span className="text-xs font-medium text-gray-700 truncate">{file.name}</span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFile(index, 'front');
                            }}
                            className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-600 transition-colors duration-200"
                          >
                            <FiX className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      {frontFiles.length > 3 && (
                        <div className="text-xs text-gray-500 text-center py-1">
                          +{frontFiles.length - 3} more files
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Back Images Upload (if double-sided) */}
                {doubleSided && (
                  <div className="relative group">
                    <label className="block text-xs font-bold text-gray-700 mb-3 uppercase tracking-wide">
                      Back Images
                      {backFiles.length > 0 && (
                        <span className="ml-2 px-2 py-1 bg-amber-500 text-white text-xs rounded-full font-bold">
                          {backFiles.length}
                        </span>
                      )}
                    </label>
                    
                    <div
                      {...getBackRootProps()}
                      className={`relative overflow-hidden border-3 border-dashed rounded-2xl cursor-pointer transition-all duration-300 transform hover:scale-[1.02] ${
                        backDragActive
                          ? "border-amber-500 bg-gradient-to-br from-amber-50 to-orange-100 shadow-2xl scale-[1.02]"
                          : backFiles.length > 0
                          ? "border-emerald-400 bg-gradient-to-br from-emerald-50 to-green-100 shadow-xl hover:shadow-2xl"
                          : "border-gray-300 bg-gradient-to-br from-gray-50 to-slate-100 hover:border-amber-400 hover:bg-gradient-to-br hover:from-amber-50 hover:to-orange-50 shadow-lg hover:shadow-xl"
                      }`}
                    >
                      <input {...getBackInputProps()} />
                      
                      <div className="p-6 text-center min-h-[120px] flex flex-col justify-center">
                        {backFiles.length === 0 ? (
                          <>
                            <div className="w-16 h-16 mx-auto mb-3 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform duration-300">
                              <FiUpload className="w-8 h-8 text-white" />
                            </div>
                            <p className="text-sm font-bold text-gray-700 mb-1">Drop your back images here</p>
                            <p className="text-xs text-gray-500">for double-sided printing</p>
                          </>
                        ) : (
                          <>
                            <div className="w-16 h-16 mx-auto mb-3 bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl flex items-center justify-center shadow-lg">
                              <FiCheck className="w-8 h-8 text-white" />
                            </div>
                            <p className="text-sm font-bold text-emerald-700">
                              {backFiles.length} back file{backFiles.length !== 1 ? 's' : ''} ready
                            </p>
                          </>
                        )}
                      </div>

                      {/* Animated Border Effect */}
                      <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-red-500/20 animate-pulse"></div>
                      </div>
                    </div>

                    {/* File List */}
                    {backFiles.length > 0 && (
                      <div className="mt-3 space-y-2 max-h-24 overflow-y-auto">
                        {backFiles.slice(0, 3).map((file, index) => (
                          <div key={index} className="flex items-center justify-between bg-white/90 backdrop-blur-sm px-3 py-2 rounded-lg border border-white/50 shadow-sm">
                            <div className="flex items-center min-w-0 flex-1">
                              <div className="w-6 h-6 bg-gradient-to-br from-amber-500 to-orange-600 rounded-md flex items-center justify-center mr-2">
                                <FiImage className="w-3 h-3 text-white" />
                              </div>
                              <span className="text-xs font-medium text-gray-700 truncate">{file.name}</span>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeFile(index, 'back');
                              }}
                              className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-600 transition-colors duration-200"
                            >
                              <FiX className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                        {backFiles.length > 3 && (
                          <div className="text-xs text-gray-500 text-center py-1">
                            +{backFiles.length - 3} more files
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Generate Button */}
        <div className="mt-6 flex justify-center">
          <button
            onClick={handleGeneratePDF}
            disabled={!canGenerate || isGenerating}
            className={`z-50 px-6 py-3 rounded-full text-white font-bold text-lg transition-all duration-300 transform hover:scale-105 shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500
              ${canGenerate ? 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600' : 'bg-gray-300 cursor-not-allowed'}
              ${isGenerating ? 'opacity-75 cursor-wait' : ''}`}
          >
            {isGenerating ? (
              <div className="flex items-center justify-center">
                <FiLoader className="animate-spin mr-2" />
                Generating PDF...
              </div>        
            ) : (
              <div className="flex items-center justify-center">
                <FiEye className="mr-2" />
                Generate PDF
              </div>
            )}
          </button>
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
