'use client'

import { useState, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { FiUpload, FiImage, FiX, FiCheck, FiLoader, FiEye, FiCreditCard } from "react-icons/fi";
import { FaToggleOn } from "react-icons/fa6";
import Heading from "@/app/components/Heading";
import { generateBusinessCardsPDF, downloadPdfBytes } from "@/app/lib/pdf";
import { normalizeUploadsToImages } from "@/app/lib/file/pdfToImage";

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

export default function BusinessCardsPage() {
  const [frontFiles, setFrontFiles] = useState([]);
  const [backFiles, setBackFiles] = useState([]);
  const [sheetSize, setSheetSize] = useState("A4");
  const [sheets, setSheets] = useState(1);
  const [doubleSided, setDoubleSided] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isProcessingFront, setIsProcessingFront] = useState(false);
  const [isProcessingBack, setIsProcessingBack] = useState(false);

  const layout = calculateLayout(sheetSize, sheets * calculateLayout(sheetSize, 1).cardsPerSheet);

  // Auto-adjust sheets to fit all uploaded images
  useEffect(() => {
    if (frontFiles.length > 0 && frontFiles.length <= 500) {
      const neededSheets = Math.ceil(frontFiles.length / layout.cardsPerSheet);
      if (sheets < neededSheets) setSheets(neededSheets);
    }
  }, [frontFiles.length, layout.cardsPerSheet]);

  const onDropFront = async (acceptedFiles) => {
    setIsProcessingFront(true);
    try {
      const normalized = await normalizeUploadsToImages(acceptedFiles);
      setFrontFiles(prev => [...prev, ...normalized]);
    } catch (err) {
      console.error("Failed to process uploads:", err);
      alert(`Failed to process upload: ${err.message}`);
    } finally {
      setIsProcessingFront(false);
    }
  };

  const onDropBack = async (acceptedFiles) => {
    setIsProcessingBack(true);
    try {
      const normalized = await normalizeUploadsToImages(acceptedFiles);
      setBackFiles(prev => [...prev, ...normalized]);
    } catch (err) {
      console.error("Failed to process uploads:", err);
      alert(`Failed to process upload: ${err.message}`);
    } finally {
      setIsProcessingBack(false);
    }
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
      const { pdfBytes, filename } = await generateBusinessCardsPDF({
        frontFiles,
        backFiles,
        sheetSize,
        sheets,
        doubleSided,
      });

      downloadPdfBytes(pdfBytes, filename);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert(`Failed to generate PDF: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const canGenerate =
    frontFiles.length > 0 &&
    (!doubleSided || backFiles.length > 0) &&
    !isProcessingFront &&
    !isProcessingBack;

  return (
    <div className="p-6 text-zinc-100">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <Heading
          icon={FiCreditCard}
          title="Business Cards"
          description="Configure sheet size, duplex mode, and upload front and back images."
        />
        <div className="flex shrink-0 items-center gap-2 sm:pb-1">
          <div className={`h-3 w-3 rounded-full ${frontFiles.length > 0 ? "bg-emerald-500" : "bg-zinc-600"} animate-pulse`} />
          <span className="text-xs font-medium text-zinc-400">
            {frontFiles.length > 0 ? "Ready" : "Waiting for files"}
          </span>
        </div>
      </div>

      {/* INSANE Streamlined Settings & Upload Row */}
      <div className="relative mb-6 rounded-2xl border border-zinc-700 bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 p-6 shadow-xl shadow-black/30">
        {/* Animated Background Elements */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-500/10 to-indigo-500/10" />
        <div className="absolute right-4 top-4 h-32 w-32 rounded-full bg-gradient-to-br from-blue-600/20 to-indigo-600/20 blur-3xl" />
        <div className="absolute bottom-4 left-4 h-24 w-24 rounded-full bg-gradient-to-br from-emerald-600/15 to-cyan-600/15 blur-2xl" />
        
        <div className="relative z-10">
          {/* Main Configuration Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-end">
            
            {/* Settings Panel - 4 columns */}
            <div className="lg:col-span-4 space-y-4">
              <div className="rounded-xl border border-zinc-700/80 bg-zinc-950/80 p-4 shadow-lg shadow-black/20 backdrop-blur-sm">
                <div className="grid grid-cols-1 gap-4">
                  
                  {/* Sheet Size */}
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-zinc-300">
                      Sheet Size
                    </label>
                    <div className="relative">
                      <select
                        value={sheetSize}
                        onChange={(e) => setSheetSize(e.target.value)}
                        className="w-full rounded-lg border-2 border-zinc-600 bg-zinc-950 px-4 py-3 text-sm font-medium text-zinc-100 shadow-sm transition-all duration-200 hover:border-blue-500/50 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="A4">A4 (10 cards)</option>
                        <option value="A3">A3 (24 cards)</option>
                      </select>
                    </div>
                  </div>

                  

                  {/* Double-sided Toggle */}
                  <div>
                    <label className="mb-2 block text-xs font-extrabold uppercase tracking-widest text-zinc-200 drop-shadow-sm">
                      Print Mode
                    </label>
                    <div className="relative flex items-center">
                      <button
                        onClick={() => setDoubleSided(!doubleSided)}
                        className={`w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-extrabold text-base transition-all duration-300 transform hover:scale-105 shadow-xl border-2 focus:outline-none focus:ring-2 focus:ring-amber-400
                          ${doubleSided
                            ? 'bg-gradient-to-r from-amber-400 via-orange-400 to-orange-600 text-white border-amber-400 shadow-amber-400/30'
                            : 'border-zinc-600 bg-gradient-to-r from-zinc-800 via-zinc-800 to-zinc-900 text-zinc-200 hover:from-zinc-700 hover:to-zinc-800'}
                        `}
                        aria-pressed={doubleSided}
                        tabIndex={0}
                      >
                        <span className={`transition-colors duration-200 ${doubleSided ? "text-white" : "text-zinc-200"}`}>
                          {doubleSided ? 'Double-Sided' : 'Single-Sided'}
                        </span>
                        <FaToggleOn
                          className={`ml-2 text-xl transition-transform duration-300 ${
                            doubleSided
                              ? 'rotate-0 text-white drop-shadow-[0_2px_8px_rgba(255,183,77,0.5)]'
                              : "-rotate-90 text-zinc-500"
                          }`}
                        />
                      </button>
                      <span
                        className={`absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-zinc-950 shadow ${
                          doubleSided ? "animate-pulse bg-amber-400" : "bg-zinc-600"
                        }`}
                        aria-hidden="true"
                      ></span>
                    </div>
                    <div className="mt-2 text-xs text-zinc-500">
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
                  <label className="block text-xs font-bold text-zinc-300 mb-3 uppercase tracking-wide">
                    Front Images
                    {frontFiles.length > 0 && (
                      <span className="ml-2 px-2 py-1 bg-blue-500 text-white text-xs rounded-full font-bold">
                        {frontFiles.length}
                      </span>
                    )}
                  </label>
                  
                  <div
                    {...getFrontRootProps()}
                    className={`relative transform cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed transition-all duration-300 hover:scale-[1.02] ${
                      frontDragActive
                        ? "scale-[1.02] border-blue-400 bg-gradient-to-br from-blue-950/80 to-indigo-950/80 shadow-2xl"
                        : frontFiles.length > 0
                          ? "border-emerald-500/60 bg-gradient-to-br from-emerald-950/50 to-green-950/50 shadow-xl hover:shadow-2xl"
                          : "border-zinc-600 bg-gradient-to-br from-zinc-900 to-zinc-950 shadow-lg hover:border-blue-500/50 hover:shadow-xl"
                    }`}
                  >
                    <input {...getFrontInputProps()} />
                    
                    {/* Upload Area Content */}
                    <div className="p-6 text-center min-h-[120px] flex flex-col justify-center">
                      {isProcessingFront ? (
                        <>
                          <div className="w-16 h-16 mx-auto mb-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
                            <FiLoader className="w-8 h-8 text-white animate-spin" />
                          </div>
                          <p className="text-sm font-bold text-zinc-300 mb-1">Processing files…</p>
                          <p className="text-xs text-zinc-500">Rasterizing PDFs to images</p>
                        </>
                      ) : frontFiles.length === 0 ? (
                        <>
                          <div className="w-16 h-16 mx-auto mb-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform duration-300">
                            <FiUpload className="w-8 h-8 text-white" />
                          </div>
                          <p className="text-sm font-bold text-zinc-300 mb-1">Drop your front images or PDFs here</p>
                          <p className="text-xs text-zinc-500">or click to browse files</p>
                        </>
                      ) : (
                        <>
                          <div className="w-16 h-16 mx-auto mb-3 bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl flex items-center justify-center shadow-lg">
                            <FiCheck className="w-8 h-8 text-white" />
                          </div>
                          <p className="text-sm font-bold text-emerald-300">
                            {frontFiles.length} file{frontFiles.length !== 1 ? "s" : ""} ready to print
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
                        <div key={index} className="flex items-center justify-between rounded-lg border border-zinc-700 bg-zinc-900/90 px-3 py-2 shadow-sm backdrop-blur-sm">
                          <div className="flex items-center min-w-0 flex-1">
                            <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-md flex items-center justify-center mr-2">
                              <FiImage className="w-3 h-3 text-white" />
                            </div>
                            <span className="text-xs font-medium text-zinc-300 truncate">{file.name}</span>
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
                        <div className="text-xs text-zinc-500 text-center py-1">
                          +{frontFiles.length - 3} more files
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Back Images Upload (if double-sided) */}
                {doubleSided && (
                  <div className="relative group">
                    <label className="block text-xs font-bold text-zinc-300 mb-3 uppercase tracking-wide">
                      Back Images
                      {backFiles.length > 0 && (
                        <span className="ml-2 px-2 py-1 bg-amber-500 text-white text-xs rounded-full font-bold">
                          {backFiles.length}
                        </span>
                      )}
                    </label>
                    
                    <div
                      {...getBackRootProps()}
                      className={`relative transform cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed transition-all duration-300 hover:scale-[1.02] ${
                        backDragActive
                          ? "scale-[1.02] border-amber-400 bg-gradient-to-br from-amber-950/70 to-orange-950/70 shadow-2xl"
                          : backFiles.length > 0
                            ? "border-emerald-500/60 bg-gradient-to-br from-emerald-950/50 to-green-950/50 shadow-xl hover:shadow-2xl"
                            : "border-zinc-600 bg-gradient-to-br from-zinc-900 to-zinc-950 shadow-lg hover:border-amber-500/50 hover:shadow-xl"
                      }`}
                    >
                      <input {...getBackInputProps()} />
                      
                      <div className="p-6 text-center min-h-[120px] flex flex-col justify-center">
                        {isProcessingBack ? (
                          <>
                            <div className="w-16 h-16 mx-auto mb-3 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl flex items-center justify-center shadow-lg">
                              <FiLoader className="w-8 h-8 text-white animate-spin" />
                            </div>
                            <p className="text-sm font-bold text-zinc-300 mb-1">Processing files…</p>
                            <p className="text-xs text-zinc-500">Rasterizing PDFs to images</p>
                          </>
                        ) : backFiles.length === 0 ? (
                          <>
                            <div className="w-16 h-16 mx-auto mb-3 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform duration-300">
                              <FiUpload className="w-8 h-8 text-white" />
                            </div>
                            <p className="text-sm font-bold text-zinc-300 mb-1">Drop your back images or PDFs here</p>
                            <p className="text-xs text-zinc-500">for double-sided printing</p>
                          </>
                        ) : (
                          <>
                            <div className="w-16 h-16 mx-auto mb-3 bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl flex items-center justify-center shadow-lg">
                              <FiCheck className="w-8 h-8 text-white" />
                            </div>
                            <p className="text-sm font-bold text-emerald-300">
                              {backFiles.length} back file{backFiles.length !== 1 ? "s" : ""} ready
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
                          <div key={index} className="flex items-center justify-between rounded-lg border border-zinc-700 bg-zinc-900/90 px-3 py-2 shadow-sm backdrop-blur-sm">
                            <div className="flex items-center min-w-0 flex-1">
                              <div className="w-6 h-6 bg-gradient-to-br from-amber-500 to-orange-600 rounded-md flex items-center justify-center mr-2">
                                <FiImage className="w-3 h-3 text-white" />
                              </div>
                              <span className="text-xs font-medium text-zinc-300 truncate">{file.name}</span>
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
                          <div className="text-xs text-zinc-500 text-center py-1">
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
              ${canGenerate ? "bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-500" : "cursor-not-allowed bg-zinc-700 text-zinc-400"}
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
                Generate PDF: 300dpi & CMYK
              </div>
            )}
          </button>
        </div>
      </div>

      
      
    </div>
  );
}
