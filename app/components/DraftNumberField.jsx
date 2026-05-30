"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function formatNumber(value) {
  const num = Number(value);
  if (value == null || !Number.isFinite(num)) return "";
  return String(Math.round(num * 100) / 100);
}

function clampNumber(value, min, max) {
  let next = value;
  if (Number.isFinite(min)) next = Math.max(min, next);
  if (Number.isFinite(max)) next = Math.min(max, next);
  return next;
}

export default function DraftNumberField({
  value,
  onCommit,
  min = -Infinity,
  max = Infinity,
  placeholder = "",
  className = "",
  style,
  step,
  ...props
}) {
  const [draft, setDraft] = useState(() => formatNumber(value));
  const focusedRef = useRef(false);
  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
    if (!focusedRef.current) {
      setDraft(formatNumber(value));
    }
  }, [value]);

  const commit = useCallback(
    (raw) => {
      const text = String(raw ?? "").trim();
      const currentValue = valueRef.current;

      if (text === "") {
        const currentNum = Number(currentValue);
        if (!Number.isFinite(currentNum)) {
          setDraft(formatNumber(currentValue));
          return;
        }
        const next = clampNumber(Number.isFinite(min) ? min : currentNum, min, max);
        onCommit(next);
        setDraft(formatNumber(next));
        return;
      }

      const num = Number(text);
      if (!Number.isFinite(num)) {
        setDraft(formatNumber(currentValue));
        return;
      }

      const next = clampNumber(num, min, max);
      onCommit(next);
      setDraft(formatNumber(next));
    },
    [max, min, onCommit]
  );

  return (
    <input
      {...props}
      type="number"
      min={Number.isFinite(min) ? min : undefined}
      max={Number.isFinite(max) ? max : undefined}
      value={draft}
      placeholder={placeholder}
      className={className}
      style={style}
      onFocus={(e) => {
        focusedRef.current = true;
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        focusedRef.current = false;
        commit(e.target.value);
        props.onBlur?.(e);
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        props.onChange?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setDraft(formatNumber(valueRef.current));
          e.currentTarget.blur();
        }
        props.onKeyDown?.(e);
      }}
      step={step}
    />
  );
}
