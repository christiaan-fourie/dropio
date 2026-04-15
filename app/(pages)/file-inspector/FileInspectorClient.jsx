"use client";

import { useCallback, useState } from "react";
import { FiSearch, FiUpload, FiX } from "react-icons/fi";
import Heading from "@/app/components/Heading";
import { inspectFile } from "@/app/lib/file/inspectFile";

export default function FileInspectorClient() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const runInspect = useCallback(async (file) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await inspectFile(file);
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong reading this file.");
    } finally {
      setBusy(false);
    }
  }, []);

  const onInput = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    runInspect(f);
  };

  return (
    <div className="p-6 text-zinc-100">
      <Heading
        icon={FiSearch}
        title="File inspector"
        description="Drop a file to see what it really is—PDF, JPEG, PNG, WebP, and more. Magic-byte detection, image dimensions, and basic PDF stats run entirely in your browser."
      />

      <div className="mx-auto max-w-2xl">
        <label
          className={`relative flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 transition-colors ${
            dragOver
              ? "border-amber-400 bg-amber-950/50"
              : "border-amber-500/40 bg-amber-950/20 hover:border-amber-400/70 hover:bg-amber-950/35"
          }`}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            runInspect(f);
          }}
        >
          <input type="file" className="sr-only" onChange={onInput} disabled={busy} />
          <FiUpload className="mb-3 h-10 w-10 text-amber-400" aria-hidden />
          <span className="text-center font-medium text-amber-100">
            {busy ? "Analysing…" : "Click or drop a file here"}
          </span>
          <span className="mt-1 text-center text-xs text-amber-200/70">
            PDF, PNG, JPEG, GIF, WebP, SVG, BMP, TIFF — nothing is uploaded.
          </span>
        </label>

        {error ? (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            <FiX className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>{error}</p>
          </div>
        ) : null}

        {result ? (
          <div className="mt-8 space-y-6">
            <div className="rounded-2xl border border-amber-500/25 bg-zinc-900 p-6 shadow-sm shadow-black/20">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-300/90">Detected type</p>
              <p className="mt-1 text-xl font-semibold text-zinc-100">{result.label}</p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{result.detectionNote}</p>
            </div>

            <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-sm shadow-black/20">
              <p className="mb-4 text-xs font-bold uppercase tracking-wide text-zinc-500">Properties</p>
              <dl className="grid gap-3 sm:grid-cols-[minmax(8rem,35%)_1fr] sm:gap-x-4 sm:gap-y-2">
                {Object.entries(result.details).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-sm text-zinc-500">{k}</dt>
                    <dd className="text-sm font-medium text-zinc-100 sm:border-b sm:border-zinc-800 sm:pb-2">
                      {typeof v === "boolean" ? (v ? "Yes" : "No") : String(v)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
