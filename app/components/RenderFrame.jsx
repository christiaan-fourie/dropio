"use client";

import { useId } from "react";
import { getCanvasWrapLayoutMm } from "@/app/lib/pdf/canvasSheetLayout";

/**
 * Live preview of canvas-wrap sheet layout (mm-accurate proportions).
 * Matches PDF placement: image fills print block (face + bleed), centered on sheet.
 */
export default function RenderFrame({
  width,
  height,
  thickness,
  extra,
  previewUrl,
  className = "",
}) {
  const clipId = `rf-${useId().replace(/:/g, "")}`;
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  const t = Number(thickness) || 0;
  const e = Number(extra) || 0;

  if (w < 1 || h < 1) {
    return (
      <div
        className={`flex min-h-[200px] items-center justify-center rounded-xl border border-dashed border-amber-200 bg-amber-50/40 text-sm text-amber-800/70 ${className}`}
      >
        Set valid canvas dimensions to see the layout.
      </div>
    );
  }

  const L = getCanvasWrapLayoutMm({ width: w, height: h, thickness: t, extra: e });
  const vb = `0 0 ${L.sheetWidth} ${L.sheetHeight}`;

  return (
    <div className={`rounded-xl border border-amber-200 bg-gradient-to-b from-slate-50 to-slate-100/80 p-4 shadow-inner ${className}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-amber-900">Live layout</span>
        <span className="text-xs text-amber-800/80">
          {L.sheetName} sheet · {L.sheetWidth}×{L.sheetHeight} mm
        </span>
      </div>

      <div
        className="mx-auto w-full max-w-md overflow-hidden rounded-lg bg-white ring-1 ring-slate-200/80"
        style={{ aspectRatio: `${L.sheetWidth} / ${L.sheetHeight}` }}
      >
        <svg viewBox={vb} className="h-full w-full" preserveAspectRatio="xMidYMid meet" aria-label="Sheet layout preview">
          <rect width={L.sheetWidth} height={L.sheetHeight} fill="#f1f5f9" stroke="#cbd5e1" strokeWidth={0.4} />

          <defs>
            <clipPath id={clipId}>
              <rect x={L.printOffsetX} y={L.printOffsetY} width={L.printWidth} height={L.printHeight} />
            </clipPath>
          </defs>

          <g clipPath={`url(#${clipId})`}>
            {previewUrl ? (
              <image
                href={previewUrl}
                x={L.printOffsetX}
                y={L.printOffsetY}
                width={L.printWidth}
                height={L.printHeight}
                preserveAspectRatio="xMidYMid slice"
              />
            ) : (
              <rect
                x={L.printOffsetX}
                y={L.printOffsetY}
                width={L.printWidth}
                height={L.printHeight}
                fill="#fde68a"
                fillOpacity={0.45}
              />
            )}
          </g>

          <rect
            x={L.printOffsetX}
            y={L.printOffsetY}
            width={L.printWidth}
            height={L.printHeight}
            fill="none"
            stroke="#d97706"
            strokeWidth={0.35}
            strokeOpacity={0.9}
          />

          <rect
            x={L.faceOffsetX}
            y={L.faceOffsetY}
            width={L.faceWidth}
            height={L.faceHeight}
            fill="none"
            stroke="#0f172a"
            strokeWidth={0.45}
            strokeDasharray="2 1.5"
            strokeOpacity={0.65}
          />
        </svg>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-amber-100/80 pt-3 text-[11px] text-amber-950">
        <dt className="text-amber-700/85">Visible face</dt>
        <dd className="font-medium tabular-nums">
          {w}×{h} mm
        </dd>
        <dt className="text-amber-700/85">Print block (face + wrap)</dt>
        <dd className="font-medium tabular-nums">
          {L.printWidth.toFixed(0)}×{L.printHeight.toFixed(0)} mm
        </dd>
        <dt className="text-amber-700/85">Wrap margin (per side)</dt>
        <dd className="font-medium tabular-nums">{L.bleedMm.toFixed(0)} mm</dd>
      </dl>
    </div>
  );
}
