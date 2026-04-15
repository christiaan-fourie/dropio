'use client'

import { useState, useEffect, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { FiImage, FiUpload, FiCheck, FiX, FiRotateCw, FiLayers, FiPackage, FiInfo } from "react-icons/fi";
import Heading from "@/app/components/Heading";
import RenderFrame from "@/app/components/RenderFrame";
import { generateCanvasWrapPDF, downloadPdfBytes } from "@/app/lib/pdf";

const CANVAS_PRESETS = [
  { key: "A4", label: "A4 Canvas (300×200mm)", width: 300, height: 200, printOn: "A3" },
  { key: "A3", label: "A3 Canvas (400×300mm)", width: 400, height: 300, printOn: "A2" },
  { key: "A2", label: "A2 Canvas (600×400mm)", width: 600, height: 400, printOn: "A1" },
  { key: "A1", label: "A1 Canvas (800×600mm)", width: 800, height: 600, printOn: "A0" },
  { key: "A0", label: "A0 Canvas (1200×800mm)", width: 1200, height: 800, printOn: "Custom/Larger" },
  { key: "SQUARE", label: "Square Canvas (300×300mm)", width: 300, height: 300, printOn: "A3" },
];

function SectionTitle({ icon: Icon, id, children }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700" aria-hidden>
        <Icon className="h-4 w-4" strokeWidth={2} />
      </span>
      <h2 id={id} className="text-sm font-bold uppercase tracking-wide text-amber-900">
        {children}
      </h2>
    </div>
  );
}



function getSafeNum(val, fallback = 0) {
  return val === "" ? fallback : Number(val);
}

export default function CanvasWrapPage() {
  const [files, setFiles] = useState([]);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [wrapSize, setWrapSize] = useState("A3");
  const [width, setWidth] = useState(400);
  const [height, setHeight] = useState(300);
  const [thickness, setThickness] = useState(35);
  const [extra, setExtra] = useState(5);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleNumberChange = (setter) => (e) => {
    const val = e.target.value;
    setter(val === "" ? "" : Number(val));
  };

  const handleBlur = (value, setter, min, max) => () => {
    const num = Number(value);
    if (value === "" || Number.isNaN(num) || num < min) setter(min);
    else if (num > max) setter(max);
  };

  const hasArtwork = files.length > 0;

  const onPreviewDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles.length > 0) {
      setFiles([acceptedFiles[0]]);
    }
  }, []);

  const {
    getRootProps: getPreviewRootProps,
    getInputProps: getPreviewInputProps,
    isDragActive: isPreviewDragActive,
  } = useDropzone({
    accept: {
      "image/*": [".png", ".jpg", ".jpeg", ".tiff", ".tif"],
    },
    noClick: true,
    disabled: !hasArtwork,
    onDrop: onPreviewDrop,
  });

  useEffect(() => {
    
    const file = files[0];
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [files]);

  async function handleFileChange(e) {
    const newFiles = Array.from(e.target.files);
    setFiles((prev) => [...prev, ...newFiles]);
    e.target.value = "";
  }

  function removeFile(idx) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  function handlePresetChange(e) {
    const preset = CANVAS_PRESETS.find((p) => p.key === e.target.value);
    setWrapSize(preset.key);
    setWidth(preset.width);
    setHeight(preset.height);
  }

  function rotateCanvas() {
    setWidth(height);
    setHeight(width);
  }

  async function generateCanvasPDF() {
    if (files.length === 0 || width === "" || height === "" || thickness === "" || extra === "") {
      alert("Please ensure all dimensions are filled out before generating.");
      return;
    }

    const w = Number(width);
    const h = Number(height);
    const t = Number(thickness);
    const x = Number(extra);
    if (!Number.isFinite(w) || !Number.isFinite(h) || !Number.isFinite(t) || !Number.isFinite(x)) {
      alert("Please ensure all dimensions are filled out before generating.");
      return;
    }

    setIsGenerating(true);

    try {
      const { pdfBytes, filename } = await generateCanvasWrapPDF({
        files,
        width: w,
        height: h,
        thickness: t,
        extra: x,
      });
      downloadPdfBytes(pdfBytes, filename);
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Error generating PDF. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  }

  const selectedPreset = CANVAS_PRESETS.find((p) => p.key === wrapSize);
  const currentCanvasIsLandscape = getSafeNum(width, 0) > getSafeNum(height, 0);

  const inputClass =
    "w-full rounded-lg border-2 border-amber-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400";

  const uploadDropzone = (compact) => (
    <div
      className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/50 ${
        compact ? "min-h-[120px] p-4" : "min-h-[220px] p-10"
      }`}
    >
      <input
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileChange}
        className="absolute inset-0 z-[2] cursor-pointer opacity-0"
      />
      {files.length === 0 ? (
        <>
          <FiUpload className={`mb-2 text-amber-400 ${compact ? "h-8 w-8" : "h-12 w-12"}`} />
          <p className={`text-center font-medium text-amber-800 ${compact ? "text-sm" : "text-base"}`}>
            Drop images here or click to browse
          </p>
          {!compact && (
            <p className="mt-2 text-center text-sm text-amber-600">Multiple files become multiple PDF pages</p>
          )}
        </>
      ) : (
        <>
          <FiCheck className={`mb-2 text-emerald-500 ${compact ? "h-8 w-8" : "h-12 w-12"}`} />
          <p className={`font-medium text-emerald-800 ${compact ? "text-sm" : "text-base"}`}>
            {files.length} file{files.length > 1 ? "s" : ""} added
          </p>
          <p className="mt-1 text-xs text-emerald-700">Click to add more</p>
        </>
      )}
    </div>
  );

  return (
    <div className="p-8">
      {/* <Heading
        icon={FiImage}
        title="Canvas Wrap"
        description={
          hasArtwork
            ? "Adjust canvas size and wrap settings — the preview matches your PDF layout."
            : "Upload your artwork first. After that, you can set canvas size, wrap depth, and export."
        }
      /> */}

      <div className="rounded-2xl border border-amber-200 bg-white/80 p-6 shadow-lg backdrop-blur-sm sm:p-8">
        {!hasArtwork ? (
          <div className="mx-auto max-w-lg">
            <p className="mb-6 text-center text-sm leading-relaxed text-amber-900/85">
              Start by uploading at least one image.
            </p>
            {uploadDropzone(false)}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-12">
            <div className="space-y-10">
              

              <section className="order-amber-100" aria-labelledby="canvas-face-heading">
                <SectionTitle icon={FiLayers} id="canvas-face-heading">
                  Canvas face size
                </SectionTitle>
                <p className="mb-4 text-xs leading-relaxed text-amber-800/80">
                  Choose a preset, then fine-tune width and height. Swap dimensions if orientation should match your
                  image.
                </p>

                <label className="mb-1.5 block text-xs font-semibold text-amber-800">Preset</label>
                <select
                  value={wrapSize}
                  onChange={handlePresetChange}
                  className={`${inputClass} mb-5 font-medium`}
                >
                  {CANVAS_PRESETS.map((preset) => (
                    <option key={preset.key} value={preset.key}>
                      {preset.label}
                    </option>
                  ))}
                </select>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-amber-800">Width (mm)</label>
                    <input
                      type="number"
                      min={100}
                      max={2000}
                      value={width}
                      onChange={handleNumberChange(setWidth)}
                      onBlur={handleBlur(width, setWidth, 100, 2000)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-amber-800">Height (mm)</label>
                    <input
                      type="number"
                      min={100}
                      max={2000}
                      value={height}
                      onChange={handleNumberChange(setHeight)}
                      onBlur={handleBlur(height, setHeight, 100, 2000)}
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={rotateCanvas}
                    className="inline-flex items-center gap-2 rounded-lg bg-amber-100 px-3 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-200"
                  >
                    <FiRotateCw className="h-4 w-4" />
                    Swap width / height
                  </button>
                  <span className="text-xs text-amber-700">
                    <span className="font-medium text-amber-900">Now:</span>{" "}
                    {getSafeNum(width, 0) < 1 || getSafeNum(height, 0) < 1
                      ? "—"
                      : currentCanvasIsLandscape
                        ? "landscape"
                        : "portrait"}
                  </span>
                </div>
              </section>

              <section className="border-t border-amber-100 pt-10" aria-labelledby="wrap-depth-heading">
                <SectionTitle icon={FiPackage} id="wrap-depth-heading">
                  Wrap & bleed
                </SectionTitle>
                <p className="mb-4 text-xs leading-relaxed text-amber-800/80">
                  Thickness is frame depth wrapped in fabric. Extra adds a little length at each 90° corner fold.
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-amber-800">Thickness (mm)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={thickness}
                      onChange={handleNumberChange(setThickness)}
                      onBlur={handleBlur(thickness, setThickness, 0, 100)}
                      placeholder="35"
                      className={inputClass}
                    />
                    <p className="mt-1 text-[11px] text-amber-600">Frame / bar depth (e.g. 35 = 3.5 cm)</p>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-amber-800">Extra per 90° fold (mm)</label>
                    <input
                      type="number"
                      min={0}
                      max={50}
                      value={extra}
                      onChange={handleNumberChange(setExtra)}
                      onBlur={handleBlur(extra, setExtra, 0, 50)}
                      placeholder="1"
                      className={inputClass}
                    />
                    <p className="mt-1 text-[11px] text-amber-600">Per tight corner when wrapping (default 1 mm)</p>
                  </div>
                </div>
              </section>

              
            </div>

            <div className="lg:sticky lg:top-6 lg:self-start">
              <div
                {...getPreviewRootProps({
                  className: `group/preview relative rounded-xl outline-none transition-shadow ${
                    isPreviewDragActive
                      ? "ring-2 ring-amber-400 ring-offset-2 ring-offset-white"
                      : "ring-0 ring-offset-0"
                  }`,
                })}
              >
                <input {...getPreviewInputProps()} aria-label="Drop image to replace preview artwork" />
                {isPreviewDragActive && (
                  <div
                    className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-amber-50/95 text-center shadow-inner"
                    aria-hidden
                  >
                    <p className="px-4 text-sm font-semibold text-amber-900">Drop to replace image</p>
                  </div>
                )}
                <div className="relative">
                  <RenderFrame
                    width={width}
                    height={height}
                    thickness={thickness}
                    extra={extra}
                    previewUrl={previewUrl}
                    className={isPreviewDragActive ? "opacity-80" : ""}
                  />
                  {!isPreviewDragActive && (
                    <div
                      className="pointer-events-none absolute right-2 top-2 z-[1] flex max-w-[min(100%,14rem)] items-center gap-1 rounded-md bg-white/90 px-2 py-1 text-[10px] font-medium text-amber-900/80 opacity-0 shadow-sm ring-1 ring-amber-200/60 transition-opacity duration-150 group-hover/preview:opacity-100"
                      aria-hidden
                    >
                      <FiUpload className="h-3 w-3 shrink-0 text-amber-600" strokeWidth={2} />
                      <span>Drag a new image onto the preview to replace</span>
                    </div>
                  )}
                </div>
              </div>
              {/* Reset Button */}
              <div className="pt-8">
                <button
                  type="button"
                  onClick={() => {
                    setFiles([]);
                    setPreviewUrl(null);
                    setWrapSize("A3");
                    setWidth(400);
                    setHeight(300);
                    setThickness(35);
                    setExtra(5);
                  }}
                  className="w-full rounded-full py-3.5 text-base font-bold shadow-lg transition focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 bg-amber-100 text-amber-800 hover:bg-amber-200"
                >
                  Reset
                </button>
              </div>
              <div className="pt-8">
                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={generateCanvasPDF}
                  className={`w-full rounded-full py-3.5 text-base font-bold shadow-lg transition focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 ${
                    !isGenerating
                      ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600"
                      : "cursor-wait bg-amber-400/80 text-white opacity-90"
                  }`}
                >
                  {isGenerating ? "Generating PDF…" : "Generate PDF"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
