"use client";

import { useState, useEffect, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import {
  FiUpload,
  FiCheck,
  FiX,
  FiRotateCw,
  FiLayers,
  FiPackage,
  FiLoader,
  FiAlertTriangle,
} from "react-icons/fi";
import RenderFrame from "@/app/components/RenderFrame";
import { generateCanvasWrapPDF, downloadPdfBytes } from "@/app/lib/pdf";
import { normalizeUploadsToImages } from "@/app/lib/file/pdfToImage";
import { DEFAULT_CANVAS_WRAP } from "@/app/lib/page/persistState";
import { inputClass } from "@/app/lib/uiClasses";

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
        className="neu-icon-badge flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)]"
        aria-hidden
      >
        <Icon className="h-4 w-4" strokeWidth={2} />
      </span>
      <h2 id={id} className="text-xs font-bold uppercase tracking-wide neu-text-muted">
        {children}
      </h2>
    </div>
  );
}

function getSafeNum(val, fallback = 0) {
  return val === "" ? fallback : Number(val);
}

export default function CanvasWrapWorkspace({ canvasWrap, onCanvasWrapChange }) {
  const { files, wrapSize, width, height, thickness, extra } = canvasWrap;
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isProcessingUploads, setIsProcessingUploads] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const patchCanvasWrap = useCallback(
    (partial) => {
      onCanvasWrapChange((prev) => ({ ...prev, ...partial }));
    },
    [onCanvasWrapChange]
  );

  const setFiles = useCallback(
    (updater) => {
      onCanvasWrapChange((prev) => ({
        ...prev,
        files: typeof updater === "function" ? updater(prev.files) : updater,
      }));
    },
    [onCanvasWrapChange]
  );

  const handleNumberChange = (field) => (e) => {
    const val = e.target.value;
    patchCanvasWrap({ [field]: val === "" ? "" : Number(val) });
  };

  const handleBlur = (field, value, min, max) => () => {
    const num = Number(value);
    if (value === "" || Number.isNaN(num) || num < min) patchCanvasWrap({ [field]: min });
    else if (num > max) patchCanvasWrap({ [field]: max });
  };

  const hasArtwork = files.length > 0;

  const onPreviewDrop = useCallback(
    async (acceptedFiles) => {
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
    },
    [setFiles]
  );

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

  function performReset() {
    onCanvasWrapChange({ ...DEFAULT_CANVAS_WRAP, files: [] });
  }

  function confirmReset() {
    performReset();
    setShowResetConfirm(false);
  }

  const hasDirtyState =
    hasArtwork ||
    wrapSize !== DEFAULT_CANVAS_WRAP.wrapSize ||
    Number(width) !== DEFAULT_CANVAS_WRAP.width ||
    Number(height) !== DEFAULT_CANVAS_WRAP.height ||
    Number(thickness) !== DEFAULT_CANVAS_WRAP.thickness ||
    Number(extra) !== DEFAULT_CANVAS_WRAP.extra;

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
    patchCanvasWrap({
      wrapSize: preset.key,
      width: preset.width,
      height: preset.height,
    });
  }

  function rotateCanvas() {
    patchCanvasWrap({ width: height, height: width });
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

  const currentCanvasIsLandscape = getSafeNum(width, 0) > getSafeNum(height, 0);

  const uploadDropzone = (compact) => (
    <div
      className={`neu-dropzone relative flex flex-col items-center justify-center rounded-[var(--radius-lg)] px-4 py-10 text-center transition-colors ${
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
          <FiLoader className={`mb-2 animate-spin text-blue-600 ${compact ? "h-8 w-8" : "h-12 w-12"}`} />
          <p className={`text-center font-medium neu-text-strong ${compact ? "text-sm" : "text-base"}`}>
            Processing files…
          </p>
          {!compact && (
            <p className="mt-2 text-center text-sm neu-text-muted">Rasterizing PDFs to images</p>
          )}
        </>
      ) : files.length === 0 ? (
        <>
          <FiUpload className={`mb-2 text-blue-600 ${compact ? "h-8 w-8" : "h-12 w-12"}`} />
          <p className={`text-center font-medium neu-text-strong ${compact ? "text-sm" : "text-base"}`}>
            Drop images or PDFs here or click to browse
          </p>
          {!compact && (
            <p className="mt-2 text-center text-sm neu-text-muted">Multiple files become multiple PDF pages</p>
          )}
        </>
      ) : (
        <>
          <FiCheck className={`mb-2 text-emerald-600 ${compact ? "h-8 w-8" : "h-12 w-12"}`} />
          <p className={`font-medium text-emerald-700 ${compact ? "text-sm" : "text-base"}`}>
            {files.length} file{files.length > 1 ? "s" : ""} added
          </p>
          <p className="mt-1 text-xs text-emerald-600">Click to add more</p>
        </>
      )}
    </div>
  );

  return (
    <>
      <div className="neu-panel rounded-[var(--radius-lg)] p-4 sm:p-6">
        {!hasArtwork ? (
          <div className="mx-auto max-w-lg">
            <p className="mb-6 text-center text-sm leading-relaxed neu-text-muted">
              Start by uploading at least one image (multiple files become multiple PDF pages).
            </p>
            {uploadDropzone(false)}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="space-y-4">
              <section
                className="neu-panel rounded-[var(--radius)] p-4"
                aria-labelledby="canvas-face-heading"
              >
                <SectionTitle icon={FiLayers} id="canvas-face-heading">
                  Canvas face size
                </SectionTitle>
                <p className="mb-4 text-xs leading-relaxed neu-text-muted">
                  Choose a preset, then fine-tune width and height. Swap dimensions if orientation should match your
                  image.
                </p>

                <label className="mb-1.5 block text-xs font-semibold neu-text-muted">Preset</label>
                <select value={wrapSize} onChange={handlePresetChange} className={`${inputClass} mb-5 font-medium`}>
                  {CANVAS_PRESETS.map((preset) => (
                    <option key={preset.key} value={preset.key}>
                      {preset.label}
                    </option>
                  ))}
                </select>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold neu-text-muted">Width (mm)</label>
                    <input
                      type="number"
                      min={100}
                      max={2000}
                      value={width}
                      onChange={handleNumberChange("width")}
                      onBlur={handleBlur("width", width, 100, 2000)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold neu-text-muted">Height (mm)</label>
                    <input
                      type="number"
                      min={100}
                      max={2000}
                      value={height}
                      onChange={handleNumberChange("height")}
                      onBlur={handleBlur("height", height, 100, 2000)}
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={rotateCanvas}
                    className="neu-btn inline-flex items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium transition-colors"
                  >
                    <FiRotateCw className="h-4 w-4" />
                    Swap width / height
                  </button>
                  <span className="text-xs neu-text-muted">
                    <span className="font-medium neu-text">Now:</span>{" "}
                    {getSafeNum(width, 0) < 1 || getSafeNum(height, 0) < 1
                      ? "—"
                      : currentCanvasIsLandscape
                        ? "landscape"
                        : "portrait"}
                  </span>
                </div>
              </section>

              <section
                className="neu-panel rounded-[var(--radius)] p-4"
                aria-labelledby="wrap-depth-heading"
              >
                <SectionTitle icon={FiPackage} id="wrap-depth-heading">
                  Wrap & bleed
                </SectionTitle>
                <p className="mb-4 text-xs leading-relaxed neu-text-muted">
                  Thickness is frame depth wrapped in fabric. Extra adds a little length at each 90° corner fold.
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold neu-text-muted">Thickness (mm)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={thickness}
                      onChange={handleNumberChange("thickness")}
                      onBlur={handleBlur("thickness", thickness, 0, 100)}
                      placeholder="35"
                      className={inputClass}
                    />
                    <p className="mt-1 text-[11px] neu-text-muted">Frame / bar depth (e.g. 35 = 3.5 cm)</p>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold neu-text-muted">Extra per 90° fold (mm)</label>
                    <input
                      type="number"
                      min={0}
                      max={50}
                      value={extra}
                      onChange={handleNumberChange("extra")}
                      onBlur={handleBlur("extra", extra, 0, 50)}
                      placeholder="1"
                      className={inputClass}
                    />
                    <p className="mt-1 text-[11px] neu-text-muted">Per tight corner when wrapping (default 1 mm)</p>
                  </div>
                </div>
              </section>
            </div>

            <div className="lg:sticky lg:top-6 lg:self-start">
              <div
                {...getPreviewRootProps({
                  className: `group/preview relative rounded-[var(--radius)] outline-none transition-[box-shadow,border-color] ${
                    isPreviewDragActive ? "dropio-drag-active" : ""
                  }`,
                })}
              >
                <input {...getPreviewInputProps()} aria-label="Drop image to replace preview artwork" />
                {isPreviewDragActive && (
                  <div
                    className="neu-inset pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[var(--radius)] text-center"
                    aria-hidden
                  >
                    <p className="px-4 text-sm font-semibold neu-text-strong">Drop to replace image</p>
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
                      className="pointer-events-none absolute right-2 top-2 z-[1] flex max-w-[min(100%,14rem)] items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--panel-elevated)] px-2 py-1 text-[10px] font-medium neu-text-muted opacity-0 shadow-[var(--shadow-sm)] transition-opacity duration-150 group-hover/preview:opacity-100"
                      aria-hidden
                    >
                      <FiUpload className="h-3 w-3 shrink-0 text-blue-400" strokeWidth={2} />
                      <span>Drag a new image onto the preview to replace</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    if (hasDirtyState) {
                      setShowResetConfirm(true);
                    } else {
                      performReset();
                    }
                  }}
                  className="neu-btn w-full rounded-[var(--radius-sm)] py-2.5 text-sm font-medium neu-text-muted transition focus:outline-none"
                >
                  Reset
                </button>
                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={generateCanvasPDF}
                  className={`neu-btn-primary w-full rounded-[var(--radius-sm)] py-2.5 text-sm font-medium transition focus:outline-none ${
                    !isGenerating
                      ? ""
                      : "cursor-wait disabled"
                  }`}
                >
                  {isGenerating ? "Generating PDF…" : "Generate PDF"}
                </button>
              </div>
            </div>
          </div>
        )}
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
            className="neu-modal-backdrop absolute inset-0"
            onClick={() => setShowResetConfirm(false)}
            aria-hidden
          />
          <div className="neu-modal relative z-10 w-full max-w-md overflow-hidden rounded-[var(--radius-lg)]">
            <div className="flex items-start gap-4 p-6">
              <span
                className="neu-icon-badge flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-amber-500"
                aria-hidden
              >
                <FiAlertTriangle className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 id="reset-confirm-title" className="text-base font-semibold neu-text-strong">
                  Reset canvas layout?
                </h3>
                <p id="reset-confirm-desc" className="mt-1.5 text-sm leading-relaxed neu-text-muted">
                  This will remove your
                  {hasArtwork ? <span className="font-medium neu-text-strong"> uploaded image</span> : null}
                  {hasArtwork ? " and " : " "}
                  restore every setting (size, thickness, bleed) to its default. This can’t be undone.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                aria-label="Close"
                className="neu-icon-btn shrink-0 rounded-md p-1 h-auto w-auto transition-colors"
              >
                <FiX className="h-4 w-4" />
              </button>
            </div>
            <div className="neu-divider flex flex-col-reverse gap-2 px-6 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="neu-btn rounded-[var(--radius-sm)] px-4 py-2 text-sm font-medium transition-colors focus:outline-none"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmReset}
                autoFocus
                className="neu-btn-warning rounded-[var(--radius-sm)] px-4 py-2 text-sm font-medium transition-colors focus:outline-none"
              >
                Reset everything
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
