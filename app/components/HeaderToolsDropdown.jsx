"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FiChevronDown } from "react-icons/fi";

/**
 * Tools dropdown with outside-click and Escape to close (native <details> cannot do this).
 */
export default function HeaderToolsDropdown({
  links,
  triggerLabel,
  panelHeading,
  summaryClassName,
  panelClassName,
  linkClassName,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className={summaryClassName}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls="header-tools-menu"
        id="header-tools-trigger"
        onClick={() => setOpen((v) => !v)}
      >
        {triggerLabel}
        <FiChevronDown
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open ? (
        <div
          id="header-tools-menu"
          role="menu"
          aria-labelledby="header-tools-trigger"
          className={panelClassName}
        >
          {panelHeading ? (
            <div className="mb-1 px-4 py-2 text-[10px] font-bold uppercase text-zinc-500">{panelHeading}</div>
          ) : null}
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              role="menuitem"
              className={linkClassName}
              onClick={() => setOpen(false)}
            >
              {label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
