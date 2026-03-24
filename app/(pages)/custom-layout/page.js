'use client'

import { useState, useEffect, useMemo } from "react";
import { useDropzone } from "react-dropzone";
import { FiUpload, FiImage, FiX, FiLoader, FiGrid, FiTool, FiDownload, FiChevronRight, FiChevronLeft } from "react-icons/fi";
import Heading from "@/app/components/Heading";
import { generateCustomLayoutPDF, downloadPdfBytes } from "@/app/lib/pdf";
import {
  SHEETS,
  pickBestSheetSize,
  resolveManualSheetLayout,
  solvePerSheetItemLayout,
  buildFixedLayoutFromGrid,
  estimateLayoutEfficiency,
} from "@/app/lib/pdf/customLayoutMath";

const inputClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900";

const btnPrimary =
  "flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-300";
const btnSecondary =
  "flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-800 hover:bg-gray-50";

function StepIndicator({ step }) {
  const items = [
    { n: 1, label: "Upload" },
    { n: 2, label: "Layout" },
    { n: 3, label: "PDF" },
  ];
  return (
    <nav className="mb-8 flex items-center justify-center gap-0 sm:gap-2" aria-label="Steps">
      {items.map((s, i) => (
        <div key={s.n} className="flex items-center">
          {i > 0 && <div className="mx-1 hidden h-px w-6 bg-gray-300 sm:mx-2 sm:block sm:w-10" />}
          <div className="flex flex-col items-center gap-1">
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${
                step === s.n ? "bg-gray-900 text-white" : step > s.n ? "bg-gray-200 text-gray-700" : "bg-gray-100 text-gray-400"
              }`}
            >
              {s.n}
            </span>
            <span
              className={`text-[10px] font-medium uppercase tracking-wide sm:text-xs ${step === s.n ? "text-gray-900" : "text-gray-400"}`}
            >
              {s.label}
            </span>
          </div>
        </div>
      ))}
    </nav>
  );
}

export default function CustomLayoutPage() {
  const [step, setStep] = useState(1);
  const [files, setFiles] = useState([]);
  const [itemWidth, setItemWidth] = useState(100);
  const [itemHeight, setItemHeight] = useState(70);
  const [quantity, setQuantity] = useState(50);
  const [autoSheetSize, setAutoSheetSize] = useState(true);
  const [manualSheetSize, setManualSheetSize] = useState("A4");
  const [isGenerating, setIsGenerating] = useState(false);
  /** Step 2: user sets mm themselves vs copies-per-sheet (we compute mm) */
  const [step2Mode, setStep2Mode] = useState("dimensions");
  const [packingMode, setPackingMode] = useState("auto");
  const [itemsPerPage, setItemsPerPage] = useState(6);
  const [copiesPerSheet, setCopiesPerSheet] = useState(6);
  /** width/height ratio of first raster image; 1 for PDF or if decode fails */
  const [imageAspect, setImageAspect] = useState(1);

  const imageSource = files.length <= 1 ? "single" : "cycle";

  const onDrop = (acceptedFiles) => {
    setFiles((prev) => [...prev, ...acceptedFiles]);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      "image/*": [".png", ".jpg", ".jpeg", ".tiff", ".tif"],
      "application/pdf": [".pdf"],
    },
    onDrop,
  });

  const sheetLayoutMode = packingMode === "fixed" ? "fixed" : "auto";

  const perSheetSolve = useMemo(() => {
    if (step2Mode !== "perSheet" || files.length === 0) return null;
    return solvePerSheetItemLayout({
      itemsPerPage: copiesPerSheet,
      aspectWOverH: imageAspect,
      autoSheetSize,
      manualSheetSize,
    });
  }, [step2Mode, files.length, copiesPerSheet, imageAspect, autoSheetSize, manualSheetSize]);

  const currentLayout = useMemo(() => {
    if (files.length === 0) return null;

    if (step2Mode === "perSheet") {
      if (!perSheetSolve) return null;
      const layout = buildFixedLayoutFromGrid(
        perSheetSolve.sheetSize,
        perSheetSolve.cols,
        perSheetSolve.rows,
        perSheetSolve.itemWidth,
        perSheetSolve.itemHeight,
        copiesPerSheet,
        quantity
      );
      return {
        layout,
        sheetSize: perSheetSolve.sheetSize,
        efficiency: estimateLayoutEfficiency(layout, perSheetSolve.sheetSize),
      };
    }

    const ipp = sheetLayoutMode === "fixed" ? itemsPerPage : 1;
    if (sheetLayoutMode === "fixed" && (!Number.isFinite(ipp) || ipp < 1)) {
      return null;
    }
    if (autoSheetSize) {
      return pickBestSheetSize(itemWidth, itemHeight, quantity, sheetLayoutMode, ipp);
    }
    return resolveManualSheetLayout(
      itemWidth,
      itemHeight,
      manualSheetSize,
      quantity,
      sheetLayoutMode,
      ipp
    );
  }, [
    files.length,
    step2Mode,
    perSheetSolve,
    copiesPerSheet,
    quantity,
    itemWidth,
    itemHeight,
    autoSheetSize,
    manualSheetSize,
    sheetLayoutMode,
    itemsPerPage,
  ]);

  useEffect(() => {
    let cancelled = false;
    const f = files[0];
    if (!f || !f.type.startsWith("image/")) {
      setImageAspect(1);
      return;
    }
    createImageBitmap(f)
      .then((bmp) => {
        if (!cancelled && bmp.height > 0) setImageAspect(bmp.width / bmp.height);
        bmp.close();
      })
      .catch(() => {
        if (!cancelled) setImageAspect(1);
      });
    return () => {
      cancelled = true;
    };
  }, [files]);

  useEffect(() => {
    if (step >= 2 && files.length > 0 && quantity === 50) {
      setQuantity(Math.max(files.length, 1));
    }
  }, [step, files.length]);

  useEffect(() => {
    if (files.length === 0 && step > 1) setStep(1);
  }, [files.length, step]);

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleGeneratePDF = async () => {
    if (files.length === 0 || !currentLayout?.layout) return;

    setIsGenerating(true);
    try {
      if (step2Mode === "perSheet" && perSheetSolve) {
        const { pdfBytes, filename } = await generateCustomLayoutPDF({
          frontFiles: files,
          backFiles: [],
          itemWidth: perSheetSolve.itemWidth,
          itemHeight: perSheetSolve.itemHeight,
          quantity,
          doubleSided: false,
          autoSheetSize: false,
          sheetSize: perSheetSolve.sheetSize,
          imageSource,
          sheetLayout: "fixed",
          itemsPerPage: copiesPerSheet,
          resolvedLayoutResult: {
            layout: currentLayout.layout,
            sheetSize: currentLayout.sheetSize,
            efficiency: currentLayout.efficiency,
          },
        });
        downloadPdfBytes(pdfBytes, filename);
      } else {
        const { pdfBytes, filename } = await generateCustomLayoutPDF({
          frontFiles: files,
          backFiles: [],
          itemWidth,
          itemHeight,
          quantity,
          doubleSided: false,
          autoSheetSize,
          sheetSize: manualSheetSize,
          imageSource,
          sheetLayout: sheetLayoutMode,
          itemsPerPage: sheetLayoutMode === "fixed" ? itemsPerPage : undefined,
        });
        downloadPdfBytes(pdfBytes, filename);
      }
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert(`Failed: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const canGoStep2 = files.length > 0;
  const canGoStep3 = canGoStep2 && Boolean(currentLayout?.layout);

  const dropClass =
    `cursor-pointer rounded-lg border-2 border-dashed px-4 py-10 text-center text-sm transition-colors ${
      isDragActive ? "border-gray-900 bg-gray-50" : files.length > 0 ? "border-gray-400 bg-gray-50/80" : "border-gray-300 bg-white hover:border-gray-500"
    }`;

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-xl">
        <Heading
          icon={FiGrid}
          title="Custom layout"
          description="Upload files, then either set sizes yourself or pick how many fit on each page—we’ll work out the dimensions."
        />

        <StepIndicator step={step} />

        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          {step === 1 && (
            <div className="space-y-5 p-6">
              <h2 className="text-sm font-semibold text-gray-900">Step 1 — Upload</h2>
              <p className="text-sm text-gray-600">
                One file = repeated everywhere. Several files = used in order, looping. We use the first image’s shape
                when calculating sizes from “per sheet”.
              </p>
              <div {...getRootProps()} className={dropClass}>
                <input {...getInputProps()} />
                <FiUpload className="mx-auto mb-2 h-7 w-7 text-gray-400" />
                <p className="font-medium text-gray-800">Drop images or PDFs here, or click to browse</p>
                <p className="mt-1 text-xs text-gray-500">PNG, JPG, TIFF, PDF</p>
              </div>
              {files.length > 0 && (
                <>
                  <p className="text-sm text-gray-700">
                    <span className="font-medium text-gray-900">{files.length}</span> file{files.length !== 1 ? "s" : ""}{" "}
                    — {files.length === 1 ? <span>same image every cell</span> : <span>cycle in upload order</span>}
                  </p>
                  <ul className="max-h-36 space-y-1 overflow-y-auto text-xs text-gray-600">
                    {files.map((file, index) => (
                      <li key={index} className="flex items-center justify-between gap-2 rounded-md bg-gray-50 px-2 py-1.5">
                        <span className="flex min-w-0 items-center gap-2 truncate">
                          <FiImage className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                          {file.name}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFile(index);
                          }}
                          className="shrink-0 text-gray-400 hover:text-red-600"
                          aria-label="Remove"
                        >
                          <FiX className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <button type="button" disabled={!canGoStep2} className={btnPrimary} onClick={() => setStep(2)}>
                Continue
                <FiChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5 p-6">
              <h2 className="text-sm font-semibold text-gray-900">Step 2 — How to lay out</h2>
              <p className="text-sm text-gray-600">Choose one approach, set total copies, then paper size.</p>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Total copies</label>
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className={inputClass}
                />
              </div>

              <div className="space-y-3 rounded-lg border border-gray-200 p-4">
                <label className="flex cursor-pointer items-start gap-3 text-sm">
                  <input
                    type="radio"
                    name="step2Mode"
                    checked={step2Mode === "dimensions"}
                    onChange={() => setStep2Mode("dimensions")}
                    className="mt-0.5 text-gray-900"
                  />
                  <span>
                    <span className="font-medium text-gray-900">I know width &amp; height (mm)</span>
                    <span className="mt-1 block text-xs text-gray-500">Each print is exactly this size on the page.</span>
                  </span>
                </label>

                {step2Mode === "dimensions" && (
                  <div className="ml-7 space-y-4 border-l border-gray-100 pl-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs text-gray-600">Width (mm)</label>
                        <input
                          type="number"
                          min={10}
                          max={500}
                          value={itemWidth}
                          onChange={(e) => setItemWidth(Number(e.target.value))}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-gray-600">Height (mm)</label>
                        <input
                          type="number"
                          min={10}
                          max={500}
                          value={itemHeight}
                          onChange={(e) => setItemHeight(Number(e.target.value))}
                          className={inputClass}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-gray-600">On each sheet</p>
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="packing"
                          checked={packingMode === "auto"}
                          onChange={() => setPackingMode("auto")}
                          className="text-gray-900"
                        />
                        Fit as many as fit
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="packing"
                          checked={packingMode === "fixed"}
                          onChange={() => setPackingMode("fixed")}
                          className="text-gray-900"
                        />
                        <span className="flex flex-wrap items-center gap-2">
                          Exactly
                          <input
                            type="number"
                            min={1}
                            max={500}
                            value={itemsPerPage}
                            disabled={packingMode !== "fixed"}
                            onChange={(e) => setItemsPerPage(Math.max(1, Number(e.target.value) || 1))}
                            className={`${inputClass} w-20`}
                          />
                          per page
                        </span>
                      </label>
                    </div>
                  </div>
                )}

                <label className="flex cursor-pointer items-start gap-3 text-sm">
                  <input
                    type="radio"
                    name="step2Mode"
                    checked={step2Mode === "perSheet"}
                    onChange={() => setStep2Mode("perSheet")}
                    className="mt-0.5 text-gray-900"
                  />
                  <span className="flex-1">
                    <span className="font-medium text-gray-900">I know how many per page</span>
                    <span className="mt-1 block text-xs text-gray-500">
                      We pick width × height to fit that count, keeping your first image’s aspect ratio (or square for
                      PDF).
                    </span>
                    {step2Mode === "perSheet" && (
                      <div className="mt-3">
                        <label className="mb-1 block text-xs text-gray-600">Copies per sheet</label>
                        <input
                          type="number"
                          min={1}
                          max={500}
                          value={copiesPerSheet}
                          onChange={(e) => setCopiesPerSheet(Math.max(1, Number(e.target.value) || 1))}
                          className={`${inputClass} max-w-[8rem]`}
                        />
                      </div>
                    )}
                  </span>
                </label>
              </div>

              <div className="space-y-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={autoSheetSize}
                    onChange={(e) => setAutoSheetSize(e.target.checked)}
                    className="rounded border-gray-300 text-gray-900"
                  />
                  Pick smallest paper that works (A4 → A0)
                </label>
                {!autoSheetSize && (
                  <select
                    value={manualSheetSize}
                    onChange={(e) => setManualSheetSize(e.target.value)}
                    className={inputClass}
                  >
                    <option value="A4">A4</option>
                    <option value="A3">A3</option>
                    <option value="A2">A2</option>
                    <option value="A1">A1</option>
                    <option value="A0">A0</option>
                  </select>
                )}
              </div>

              {step2Mode === "perSheet" && perSheetSolve && (
                <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
                  Computed item size:{" "}
                  <span className="font-semibold text-gray-900">
                    {perSheetSolve.itemWidth}×{perSheetSolve.itemHeight} mm
                  </span>
                  {" · "}
                  grid {perSheetSolve.cols}×{perSheetSolve.rows} on {perSheetSolve.sheetSize}
                </p>
              )}

              {!currentLayout?.layout && (
                <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                  <FiTool className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    {step2Mode === "perSheet"
                      ? `Can’t fit ${copiesPerSheet} copies on this paper choice. Try fewer per sheet, turn on auto paper, or pick a larger sheet.`
                      : packingMode === "fixed"
                        ? `Won’t fit ${itemsPerPage} at ${itemWidth}×${itemHeight} mm. Reduce per page, enlarge paper, or shrink the item.`
                        : "That size doesn’t fit on standard sheets."}
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-row-reverse">
                <button type="button" disabled={!canGoStep3} className={`${btnPrimary} sm:flex-1`} onClick={() => setStep(3)}>
                  Preview &amp; PDF
                  <FiChevronRight className="h-4 w-4" />
                </button>
                <button type="button" className={`${btnSecondary} sm:flex-1`} onClick={() => setStep(1)}>
                  <FiChevronLeft className="h-4 w-4" />
                  Back
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5 p-6">
              <h2 className="text-sm font-semibold text-gray-900">Step 3 — Preview &amp; download</h2>

              {currentLayout?.layout ? (
                <>
                  <p className="text-sm text-gray-700">
                    <span className="font-medium text-gray-900">{currentLayout.sheetSize}</span>
                    {" · "}
                    Each item{" "}
                    <span className="font-medium text-gray-900">
                      {currentLayout.layout.itemWidth}×{currentLayout.layout.itemHeight} mm
                    </span>
                    {" · "}
                    {currentLayout.layout.targetItemsPerSheet} per sheet · {currentLayout.layout.totalSheets} sheet
                    {currentLayout.layout.totalSheets !== 1 ? "s" : ""}
                    {" · "}
                    grid {currentLayout.layout.cols}×{currentLayout.layout.rows}
                    {" · "}
                    ~{Math.round(currentLayout.efficiency * 100)}% paper
                  </p>
                  {currentLayout.efficiency < 0.15 && (
                    <p className="text-xs text-amber-800">Low sheet usage — consider a smaller paper if you can.</p>
                  )}

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Sheet preview</p>
                    <div
                      className="relative mx-auto max-w-[220px] border border-gray-300 bg-white"
                      style={{
                        aspectRatio: `${SHEETS[currentLayout.sheetSize].width}/${SHEETS[currentLayout.sheetSize].height}`,
                      }}
                    >
                      {Array.from({
                        length: Math.min(currentLayout.layout.targetItemsPerSheet, quantity),
                      }).map((_, index) => {
                        const row = Math.floor(index / currentLayout.layout.cols);
                        const col = index % currentLayout.layout.cols;
                        const sw = SHEETS[currentLayout.sheetSize].width;
                        const sh = SHEETS[currentLayout.sheetSize].height;
                        const L = currentLayout.layout;
                        const leftPct = ((L.margin.horizontal + col * (L.itemWidth + L.itemSpacing)) / sw) * 100;
                        const topPct = ((L.margin.vertical + row * (L.itemHeight + L.itemSpacing)) / sh) * 100;
                        const wPct = (L.itemWidth / sw) * 100;
                        const hPct = (L.itemHeight / sh) * 100;
                        return (
                          <div
                            key={index}
                            className="absolute border border-gray-400 bg-gray-100"
                            style={{
                              left: `${leftPct}%`,
                              top: `${topPct}%`,
                              width: `${wPct}%`,
                              height: `${hPct}%`,
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-red-800">Layout is invalid. Go back and adjust step 2.</p>
              )}

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-row-reverse">
                <button
                  type="button"
                  onClick={handleGeneratePDF}
                  disabled={!currentLayout?.layout || isGenerating}
                  className={`${btnPrimary} sm:flex-1`}
                >
                  {isGenerating ? (
                    <>
                      <FiLoader className="h-4 w-4 animate-spin" />
                      Building PDF…
                    </>
                  ) : (
                    <>
                      <FiDownload className="h-4 w-4" />
                      Download PDF
                    </>
                  )}
                </button>
                <button type="button" className={`${btnSecondary} sm:flex-1`} onClick={() => setStep(2)}>
                  <FiChevronLeft className="h-4 w-4" />
                  Edit layout
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">1 mm gap between items · Single-sided · In your browser</p>
      </div>
    </div>
  );
}
