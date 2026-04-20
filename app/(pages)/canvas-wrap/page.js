'use client'

import { useState, useEffect, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { FiImage, FiUpload, FiCheck, FiX, FiRotateCw, FiLayers, FiPackage, FiLoader, FiAlertTriangle } from "react-icons/fi";
import Heading from "@/app/components/Heading";
import RenderFrame from "@/app/components/RenderFrame";
import { generateCanvasWrapPDF, downloadPdfBytes } from "@/app/lib/pdf";
import { normalizeUploadsToImages } from "@/app/lib/file/pdfToImage";

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
      <span
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20"
        aria-hidden
      >
        <Icon className="h-4 w-4" strokeWidth={2} />
      </span>
      <h2 id={id} className="text-xs font-bold uppercase tracking-wide text-zinc-300">
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
  const [isProcessingUploads, setIsProcessingUploads] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

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

  const onPreviewDrop = useCallback(async (acceptedFiles) => {
    if (acceptedFiles.length === 0) return;
    setIsProcessingUploads(true);
    try {
      const normalized = await normalizeUploadsToImages([acceptedFiles[0]]);
      setFiles([normalized[0]]);
    } catch (err) {
      console.error("Failed to process upload:", err);
      alert(`Failed to process upload: ${err.message}`);
    } finally {
      setIsProcessingUploads(false);
    }
  }, []);

  const {
    getRootProps: getPreviewRootProps,
    getInputProps: getPreviewInputProps,
    isDragActive: isPreviewDragActive,
  } = useDropzone({
    accept: {
      "image/*": [".png", ".jpg", ".jpeg", ".tiff", ".tif"],
      "application/pdf": [".pdf"],
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
    e.target.value = "";
    if (newFiles.length === 0) return;
    setIsProcessingUploads(true);
    try {
      const normalized = await normalizeUploadsToImages(newFiles);
      setFiles((prev) => [...prev, ...normalized]);
    } catch (err) {
      console.error("Failed to process uploads:", err);
      alert(`Failed to process upload: ${err.message}`);
    } finally {
      setIsProcessingUploads(false);
    }
  }

  function removeFile(idx) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  function performReset() {
    setFiles([]);
    setPreviewUrl(null);
    setWrapSize("A3");
    setWidth(400);
    setHeight(300);
    setThickness(35);
    setExtra(5);
  }

  function confirmReset() {
    performReset();
    setShowResetConfirm(false);
  }

  const DEFAULTS = { wrapSize: "A3", width: 400, height: 300, thickness: 35, extra: 5 };
  const hasDirtyState =
    hasArtwork ||
    wrapSize !== DEFAULTS.wrapSize ||
    Number(width) !== DEFAULTS.width ||
    Number(height) !== DEFAULTS.height ||
    Number(thickness) !== DEFAULTS.thickness ||
    Number(extra) !== DEFAULTS.extra;

  useEffect(() => {
    if (!showResetConfirm) return;
    const onKey = (e) => {
      if (e.key === "Escape") setShowResetConfirm(false);
      if (e.key === "Enter") confirmReset();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showResetConfirm]);

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
    "w-full rounded-lg border-2 border-zinc-600 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 transition-colors hover:border-zinc-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500";

  const uploadDropzone = (compact) => (
    <div
      className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-600 bg-zinc-950/80 px-4 py-10 text-center transition-colors hover:border-zinc-500 ${
        compact ? "min-h-[120px] p-4" : "min-h-[220px] p-10"
      }`}
    >
      <input
        type="file"
        accept="image/*,application/pdf,.pdf"
        multiple
        onChange={handleFileChange}
        disabled={isProcessingUploads}
        className="absolute inset-0 z-[2] cursor-pointer opacity-0"
      />
      {isProcessingUploads ? (
        <>
          <FiLoader className={`mb-2 animate-spin text-blue-400 ${compact ? "h-8 w-8" : "h-12 w-12"}`} />
          <p className={`text-center font-medium text-zinc-200 ${compact ? "text-sm" : "text-base"}`}>
            Processing files…
          </p>
          {!compact && (
            <p className="mt-2 text-center text-sm text-zinc-500">Rasterizing PDFs to images</p>
          )}
        </>
      ) : files.length === 0 ? (
        <>
          <FiUpload className={`mb-2 text-blue-400 ${compact ? "h-8 w-8" : "h-12 w-12"}`} />
          <p className={`text-center font-medium text-zinc-200 ${compact ? "text-sm" : "text-base"}`}>
            Drop images or PDFs here or click to browse
          </p>
          {!compact && (
            <p className="mt-2 text-center text-sm text-zinc-500">Multiple files become multiple PDF pages</p>
          )}
        </>
      ) : (
        <>
          <FiCheck className={`mb-2 text-emerald-400 ${compact ? "h-8 w-8" : "h-12 w-12"}`} />
          <p className={`font-medium text-emerald-200 ${compact ? "text-sm" : "text-base"}`}>
            {files.length} file{files.length > 1 ? "s" : ""} added
          </p>
          <p className="mt-1 text-xs text-emerald-300/90">Click to add more</p>
        </>
      )}
    </div>
  );

  return (
    <div className="p-6 text-zinc-100">
      <Heading
        icon={FiImage}
        title="Canvas wrap"
        description="Upload images, set the visible face and wrap depth, then export a PDF. The live preview matches export geometry."
      />

      <div className="relative overflow-hidden rounded-2xl border border-zinc-700 bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 p-6 shadow-xl shadow-black/30 sm:p-8">
        <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-500/5 to-indigo-500/5" aria-hidden />
        <div className="relative z-10">
        {!hasArtwork ? (
          <div className="mx-auto max-w-lg">
            <p className="mb-6 text-center text-sm leading-relaxed text-zinc-400">
              Start by uploading at least one image (multiple files become multiple PDF pages).
            </p>
            {uploadDropzone(false)}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-12">
            <div className="space-y-10">
              

              <section aria-labelledby="canvas-face-heading">
                <SectionTitle icon={FiLayers} id="canvas-face-heading">
                  Canvas face size
                </SectionTitle>
                <p className="mb-4 text-xs leading-relaxed text-zinc-400">
                  Choose a preset, then fine-tune width and height. Swap dimensions if orientation should match your
                  image.
                </p>

                <label className="mb-1.5 block text-xs font-semibold text-zinc-300">Preset</label>
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
                    <label className="mb-1.5 block text-xs font-semibold text-zinc-300">Width (mm)</label>
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
                    <label className="mb-1.5 block text-xs font-semibold text-zinc-300">Height (mm)</label>
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
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-500/15 px-3 py-2 text-sm font-medium text-zinc-200 ring-1 ring-blue-500/25 transition-colors hover:bg-blue-500/25"
                  >
                    <FiRotateCw className="h-4 w-4" />
                    Swap width / height
                  </button>
                  <span className="text-xs text-zinc-500">
                    <span className="font-medium text-zinc-300">Now:</span>{" "}
                    {getSafeNum(width, 0) < 1 || getSafeNum(height, 0) < 1
                      ? "—"
                      : currentCanvasIsLandscape
                        ? "landscape"
                        : "portrait"}
                  </span>
                </div>
              </section>

              <section className="border-t border-zinc-700/80 pt-10" aria-labelledby="wrap-depth-heading">
                <SectionTitle icon={FiPackage} id="wrap-depth-heading">
                  Wrap & bleed
                </SectionTitle>
                <p className="mb-4 text-xs leading-relaxed text-zinc-400">
                  Thickness is frame depth wrapped in fabric. Extra adds a little length at each 90° corner fold.
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-zinc-300">Thickness (mm)</label>
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
                    <p className="mt-1 text-[11px] text-zinc-500">Frame / bar depth (e.g. 35 = 3.5 cm)</p>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-zinc-300">Extra per 90° fold (mm)</label>
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
                    <p className="mt-1 text-[11px] text-zinc-500">Per tight corner when wrapping (default 1 mm)</p>
                  </div>
                </div>
              </section>

              
            </div>

            <div className="lg:sticky lg:top-6 lg:self-start">
              <div
                {...getPreviewRootProps({
                  className: `group/preview relative rounded-xl outline-none transition-shadow ${
                    isPreviewDragActive
                      ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-zinc-950"
                      : "ring-0 ring-offset-0"
                  }`,
                })}
              >
                <input {...getPreviewInputProps()} aria-label="Drop image to replace preview artwork" />
                {isPreviewDragActive && (
                  <div
                    className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-zinc-950/92 text-center shadow-inner"
                    aria-hidden
                  >
                    <p className="px-4 text-sm font-semibold text-zinc-100">Drop to replace image</p>
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
                      className="pointer-events-none absolute right-2 top-2 z-[1] flex max-w-[min(100%,14rem)] items-center gap-1 rounded-md bg-zinc-900/95 px-2 py-1 text-[10px] font-medium text-zinc-300 opacity-0 shadow-sm ring-1 ring-zinc-600 transition-opacity duration-150 group-hover/preview:opacity-100"
                      aria-hidden
                    >
                      <FiUpload className="h-3 w-3 shrink-0 text-blue-400" strokeWidth={2} />
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
                    if (hasDirtyState) {
                      setShowResetConfirm(true);
                    } else {
                      performReset();
                    }
                  }}
                  className="w-full rounded-full border border-zinc-600 bg-zinc-800 py-3.5 text-base font-bold text-zinc-200 shadow-lg transition hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-zinc-950"
                >
                  Reset
                </button>
              </div>
              <div className="pt-8">
                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={generateCanvasPDF}
                  className={`w-full rounded-full py-3.5 text-base font-bold shadow-lg transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-zinc-950 ${
                    !isGenerating
                      ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-400 hover:to-pink-500"
                      : "cursor-wait bg-zinc-600 text-zinc-300 opacity-90"
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

      {showResetConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-confirm-title"
          aria-describedby="reset-confirm-desc"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"
            onClick={() => setShowResetConfirm(false)}
            aria-hidden
          />
          <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl shadow-black/50">
            <div className="flex items-start gap-4 p-6">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30"
                aria-hidden
              >
                <FiAlertTriangle className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 id="reset-confirm-title" className="text-base font-semibold text-zinc-100">
                  Reset canvas layout?
                </h3>
                <p id="reset-confirm-desc" className="mt-1.5 text-sm leading-relaxed text-zinc-400">
                  This will remove your
                  {hasArtwork ? <span className="font-medium text-zinc-200"> uploaded image</span> : null}
                  {hasArtwork ? " and " : " "}
                  restore every setting (size, thickness, bleed) to its default. This can’t be undone.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                aria-label="Close"
                className="shrink-0 rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
              >
                <FiX className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-zinc-800 bg-zinc-950/50 px-6 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-zinc-950"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmReset}
                autoFocus
                className="rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-amber-500/20 transition-colors hover:from-amber-400 hover:to-orange-500 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 focus:ring-offset-zinc-950"
              >
                Reset everything
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
