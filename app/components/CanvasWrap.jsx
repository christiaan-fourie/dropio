'use client'

import { useState } from "react";
import { FiImage, FiUpload, FiCheck, FiX, FiSettings, FiRotateCw } from "react-icons/fi";
import jsPDF from 'jspdf';

const CANVAS_PRESETS = [
  { key: "A4", label: "A4 Canvas (300×200mm)", width: 300, height: 200, printOn: "A3" },
  { key: "A3", label: "A3 Canvas (400×300mm)", width: 400, height: 300, printOn: "A2" },
  { key: "A2", label: "A2 Canvas (600×400mm)", width: 600, height: 400, printOn: "A1" },
  { key: "A1", label: "A1 Canvas (800×600mm)", width: 800, height: 600, printOn: "A0" },
  { key: "A0", label: "A0 Canvas (1200×800mm)", width: 1200, height: 800, printOn: "Custom/Larger" },
  { key: "SQUARE", label: "Square Canvas (300×300mm)", width: 300, height: 300, printOn: "A3" },
];

export default function CanvasWrap() {
  const [files, setFiles] = useState([]);
  const [fileOrientations, setFileOrientations] = useState([]); // Track orientations
  const [wrapSize, setWrapSize] = useState("A3");
  const [width, setWidth] = useState(400); // mm, default A3 width
  const [height, setHeight] = useState(300); // mm, default A3 height
  const [thickness, setThickness] = useState(35); // mm, default 3.5cm
  const [extra, setExtra] = useState(5); // mm, default 5mm for each 90° turn
  const [autoRotate, setAutoRotate] = useState(true); // Auto-rotate toggle
  const [isGenerating, setIsGenerating] = useState(false);

  // Detect image orientation and auto-adjust canvas dimensions
  function detectImageOrientation(file) {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      
      img.onload = () => {
        const isLandscape = img.width > img.height;
        const aspectRatio = img.width / img.height;
        
        // Clean up the object URL
        URL.revokeObjectURL(url);
        
        resolve({
          isLandscape,
          aspectRatio,
          originalWidth: img.width,
          originalHeight: img.height,
          needsRotation: false // Will be calculated based on canvas vs image orientation
        });
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({
          isLandscape: true,
          aspectRatio: 1,
          originalWidth: 1000,
          originalHeight: 1000,
          needsRotation: false
        });
      };
      
      img.src = url;
    });
  }

  // Auto-adjust canvas dimensions based on image orientation
  function autoAdjustCanvasDimensions(imageOrientation) {
    const currentCanvasIsLandscape = width > height;
    const imageIsLandscape = imageOrientation.isLandscape;
    
    // If orientations don't match and auto-rotate is enabled
    if (autoRotate && currentCanvasIsLandscape !== imageIsLandscape) {
      // Swap canvas dimensions
      const newWidth = height;
      const newHeight = width;
      setWidth(newWidth);
      setHeight(newHeight);
      
      return {
        rotated: true,
        newWidth,
        newHeight,
        reason: imageIsLandscape ? 'Rotated to landscape for landscape image' : 'Rotated to portrait for portrait image'
      };
    }
    
    return {
      rotated: false,
      reason: 'Canvas orientation matches image'
    };
  }

  async function handleFileChange(e) {
    const newFiles = Array.from(e.target.files);
    
    // Process each file to detect orientation
    const orientations = await Promise.all(
      newFiles.map(file => detectImageOrientation(file))
    );
    
    // If auto-rotate is enabled and we have files, adjust canvas for the first image
    if (autoRotate && orientations.length > 0) {
      const adjustment = autoAdjustCanvasDimensions(orientations[0]);
      
      if (adjustment.rotated && newFiles.length === 1) {
        // Show a brief notification
        console.log(`Canvas auto-rotated: ${adjustment.reason}`);
      }
    }
    
    setFiles([...files, ...newFiles]);
    setFileOrientations([...fileOrientations, ...orientations]);
  }

  function removeFile(idx) {
    setFiles(files.filter((_, i) => i !== idx));
    setFileOrientations(fileOrientations.filter((_, i) => i !== idx));
  }

  function handlePresetChange(e) {
    const preset = CANVAS_PRESETS.find(p => p.key === e.target.value);
    setWrapSize(preset.key);
    setWidth(preset.width);
    setHeight(preset.height);
  }

  // Manual rotation function
  function rotateCanvas() {
    const newWidth = height;
    const newHeight = width;
    setWidth(newWidth);
    setHeight(newHeight);
  }

  // Calculate print dimensions including bleed
  function calculatePrintDimensions() {
    const totalBleed = thickness + extra;
    const printWidth = width + (totalBleed * 2);
    const printHeight = height + (totalBleed * 2);
    
    return { printWidth, printHeight, totalBleed };
  }

  // Convert image file to base64
  function processImageForPDF(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.readAsDataURL(file);
    });
  }

  // Get optimal sheet dimensions based on print size
  function getOptimalSheetSize(printWidth, printHeight) {
    // A-series dimensions in mm
    const sheets = [
      { name: 'A4', width: 210, height: 297 },
      { name: 'A3', width: 297, height: 420 },
      { name: 'A2', width: 420, height: 594 },
      { name: 'A1', width: 594, height: 841 },
      { name: 'A0', width: 841, height: 1189 }
    ];

    // Find the smallest sheet that can fit the print dimensions
    for (const sheet of sheets) {
      if ((printWidth <= sheet.width && printHeight <= sheet.height) ||
          (printWidth <= sheet.height && printHeight <= sheet.width)) {
        return sheet;
      }
    }

    // If nothing fits, use A0
    return sheets[sheets.length - 1];
  }

  async function generateCanvasPDF() {
    if (files.length === 0) return;
    
    setIsGenerating(true);
    
    try {
      const { printWidth, printHeight, totalBleed } = calculatePrintDimensions();
      const optimalSheet = getOptimalSheetSize(printWidth, printHeight);
      
      // Determine orientation based on print dimensions vs sheet dimensions
      const needsLandscape = printWidth > printHeight;
      const sheetWidth = needsLandscape ? Math.max(optimalSheet.width, optimalSheet.height) : Math.min(optimalSheet.width, optimalSheet.height);
      const sheetHeight = needsLandscape ? Math.min(optimalSheet.width, optimalSheet.height) : Math.max(optimalSheet.width, optimalSheet.height);

      // Create PDF with optimal orientation
      const pdf = new jsPDF({
        orientation: needsLandscape ? 'landscape' : 'portrait',
        unit: 'mm',
        format: [sheetWidth, sheetHeight]
      });

      for (let i = 0; i < files.length; i++) {
        if (i > 0) pdf.addPage();
        
        const imageData = await processImageForPDF(files[i]);
        
        // Calculate positioning to center on sheet
        const xOffset = (sheetWidth - printWidth) / 2;
        const yOffset = (sheetHeight - printHeight) / 2;
        
        // Add image with bleed (centered) - artwork only, no text or lines
        pdf.addImage(
          imageData,
          'JPEG',
          xOffset,
          yOffset,
          printWidth,
          printHeight,
          undefined,
          'FAST'
        );
      }
      
      // Download PDF
      const filename = `canvas-wrap-${width}x${height}mm-${files.length}pcs.pdf`;
      pdf.save(filename);
      
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  }

  const selectedPreset = CANVAS_PRESETS.find(p => p.key === wrapSize);
  const currentCanvasIsLandscape = width > height;

  return (
    <div className="p-8">
      <div className="text-left mb-8">
        <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mb-4">
          <FiImage className="w-7 h-7 text-amber-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Canvas Wrap Tool</h2>
        <p className="text-gray-600">
          Create canvas wrap layouts with proper bleed for gallery wraps and stretched canvases.
        </p>
      </div>

      <div className="bg-white/80 backdrop-blur-sm border border-amber-200 rounded-2xl shadow-lg p-6 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
          {/* Settings */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <FiSettings className="text-amber-500" />
              <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">Canvas Options</span>
            </div>
            
            {/* Auto-rotate toggle */}
            <div className="mb-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
              <label className="flex items-center space-x-3 cursor-pointer">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={autoRotate}
                    onChange={(e) => setAutoRotate(e.target.checked)}
                    className="sr-only"
                  />
                  <div className={`w-11 h-6 rounded-full transition-all duration-200 ${
                    autoRotate ? 'bg-gradient-to-r from-amber-500 to-orange-500' : 'bg-gray-300'
                  }`}>
                    <div className={`w-5 h-5 bg-white rounded-full shadow-lg transform transition-transform duration-200 ${
                      autoRotate ? 'translate-x-5' : 'translate-x-0.5'
                    } translate-y-0.5`}></div>
                  </div>
                </div>
                <div>
                  <span className="text-sm font-medium text-amber-800">Auto-rotate canvas</span>
                  <p className="text-xs text-amber-600">Automatically adjusts canvas orientation to match uploaded images</p>
                </div>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-amber-700 mb-1">Width (mm)</label>
                <input
                  type="number"
                  min={100}
                  max={2000}
                  value={width}
                  onChange={e => setWidth(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border-2 border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-amber-700 mb-1">Height (mm)</label>
                <input
                  type="number"
                  min={100}
                  max={2000}
                  value={height}
                  onChange={e => setHeight(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border-2 border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-amber-700 mb-1">Thickness (mm)</label>
                <input
                  type="number"
                  min={10}
                  max={100}
                  value={thickness}
                  onChange={e => setThickness(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border-2 border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                  placeholder="35 (3.5cm)"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-amber-700 mb-1">
                  Extra (mm for 90° fold)
                </label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={extra}
                  onChange={e => setExtra(Number(e.target.value))}
                  placeholder="5"
                  className="w-full px-3 py-2 text-sm border-2 border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <div className="text-[11px] text-amber-500 mt-1">
                  Adds extra space for each 90° canvas turn (default 5mm)
                </div>
              </div>
            </div>

            {/* Manual rotation button */}
            <div className="mt-3 flex items-center space-x-2">
              <button
                onClick={rotateCanvas}
                className="flex items-center space-x-2 px-3 py-2 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-lg transition-colors duration-200 text-sm font-medium"
              >
                <FiRotateCw className="w-4 h-4" />
                <span>Rotate Canvas</span>
              </button>
              <div className="text-xs text-amber-600">
                Current: {currentCanvasIsLandscape ? 'Landscape' : 'Portrait'} ({width}×{height}mm)
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-bold text-amber-700 mb-2 uppercase tracking-wide">
                Canvas Size Preset
              </label>
              <select
                value={wrapSize}
                onChange={handlePresetChange}
                className="w-full px-4 py-3 text-sm font-medium bg-white border-2 border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 transition-all duration-200"
              >
                {CANVAS_PRESETS.map(preset => (
                  <option key={preset.key} value={preset.key}>{preset.label}</option>
                ))}
              </select>
              <div className="text-xs text-amber-700 mt-2">
                All sizes are rounded for optimal canvas stretching and framing.
              </div>
              <div className="text-xs text-amber-500 mt-1">
                Auto-selects optimal sheet size and orientation. Artwork centered on sheet.
              </div>
              <div className="text-xs text-amber-600 mt-1">
                {selectedPreset && selectedPreset.printOn
                  ? `Typically printed on ${selectedPreset.printOn} sheet for adequate wrapping area.`
                  : ""}
              </div>
            </div>
          </div>
          {/* Upload */}
          <div>
            <label className="block text-xs font-bold text-amber-700 mb-2 uppercase tracking-wide">
              Upload Image
            </label>
            <div className="relative border-2 border-dashed border-amber-300 rounded-xl p-4 bg-amber-50 flex flex-col items-center">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileChange}
                className="absolute inset-0 opacity-0 cursor-pointer"
                style={{ zIndex: 2 }}
              />
              {files.length === 0 ? (
                <>
                  <FiUpload className="w-8 h-8 text-amber-400 mb-2" />
                  <p className="text-sm text-amber-700">Drop images or click to upload</p>
                  {autoRotate && (
                    <p className="text-xs text-amber-600 mt-1">Canvas will auto-rotate to match image orientation</p>
                  )}
                </>
              ) : (
                <>
                  <FiCheck className="w-8 h-8 text-emerald-500 mb-2" />
                  <p className="text-sm text-emerald-700">{files.length} file{files.length > 1 ? "s" : ""} ready</p>
                </>
              )}
            </div>
            {files.length > 0 && (
              <div className="mt-3 space-y-2 max-h-32 overflow-y-auto">
                {files.map((file, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-amber-100 shadow-sm">
                    <div className="flex items-center min-w-0 flex-1">
                      <FiImage className="w-4 h-4 text-amber-500 mr-2" />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium text-gray-700 truncate block">{file.name}</span>
                        {fileOrientations[idx] && (
                          <span className="text-xs text-amber-600">
                            {fileOrientations[idx].isLandscape ? 'Landscape' : 'Portrait'} 
                            ({fileOrientations[idx].originalWidth}×{fileOrientations[idx].originalHeight})
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => removeFile(idx)}
                      className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-600 transition-colors duration-200 ml-2 flex-shrink-0"
                    >
                      <FiX className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {/* Generate Button */}
        <div className="mt-8 flex justify-center">
          <button
            disabled={files.length === 0 || isGenerating}
            onClick={generateCanvasPDF}
            className={`px-6 py-3 rounded-full text-white font-bold text-lg transition-all duration-300 transform hover:scale-105 shadow-lg focus:outline-none focus:ring-2 focus:ring-amber-400
              ${files.length > 0 ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600' : 'bg-gray-300 cursor-not-allowed'}
              ${isGenerating ? 'opacity-75 cursor-wait' : ''}`}
          >
            {isGenerating ? "Generating PDF..." : "Generate Canvas PDF"}
          </button>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
        <h3 className="font-medium text-amber-900 mb-2">💡 Canvas Wrap Tips</h3>
        <ul className="text-sm text-amber-700 space-y-1">
          <li>• <strong>Auto-rotation:</strong> Canvas dimensions automatically match your image orientation</li>
          <li>• <strong>High-res images:</strong> Use 300dpi for best print quality</li>
          <li>• <strong>Smart sizing:</strong> Auto-selects optimal sheet size and orientation</li>
          <li>• <strong>Perfect centering:</strong> Artwork automatically centered with proper bleed</li>
          <li>• <strong>Clean export:</strong> Professional print-ready layout with artwork only</li>
        </ul>
      </div>
    </div>
  );
}