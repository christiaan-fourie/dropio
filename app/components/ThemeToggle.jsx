"use client";

import { FiMoon, FiSun } from "react-icons/fi";
import { useTheme } from "@/app/components/ThemeProvider";
import { neuIconBtn } from "@/app/lib/uiClasses";

export default function ThemeToggle() {
  const { theme, toggleTheme, mounted } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={neuIconBtn}
    >
      {mounted && isDark ? (
        <FiSun className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <FiMoon className="h-3.5 w-3.5" aria-hidden />
      )}
    </button>
  );
}
