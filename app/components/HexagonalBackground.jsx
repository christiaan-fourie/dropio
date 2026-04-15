"use client";

import { useEffect, useRef } from "react";

const HEX_RADIUS = 25;
const GAP = 0.5;
const ROW_SPACING = HEX_RADIUS * 1.5;
const COL_SPACING = HEX_RADIUS * Math.sqrt(3);
const LIGHT_RADIUS = 150;

const pseudoRandom = (x, y) => {
  const seed = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return seed - Math.floor(seed);
};

export default function HexagonalBackground() {
  const canvasRef = useRef(null);
  const viewportRef = useRef({ width: 0, height: 0, dpr: 1 });
  const pointerRef = useRef({ x: -9999, y: -9999, active: false });
  const rafRef = useRef(null);
  const visibilityRef = useRef(true);
  const reduceMotionRef = useRef(false);
  const hexagonsRef = useRef([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: false });

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduceMotionRef.current = mediaQuery.matches;

    const handleMotionChange = (event) => {
      reduceMotionRef.current = event.matches;
      if (event.matches) {
        pointerRef.current = { x: -9999, y: -9999, active: false };
      }
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleMotionChange);
    } else if (mediaQuery.addListener) {
      mediaQuery.addListener(handleMotionChange);
    }

    const resizeObserver = new ResizeObserver(() => setup());
    resizeObserver.observe(canvas.parentElement ?? canvas);

    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        visibilityRef.current = entry?.isIntersecting ?? true;
        if (visibilityRef.current) {
          startLoop();
        } else if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
      },
      { threshold: 0.1 }
    );
    intersectionObserver.observe(canvas);

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerleave", handlePointerLeave, { passive: true });

    const smoothPointer = { x: -9999, y: -9999 };

    setup();

    return () => {
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerleave", handlePointerLeave);
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener("change", handleMotionChange);
      } else if (mediaQuery.removeListener) {
        mediaQuery.removeListener(handleMotionChange);
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };

    function setup() {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      viewportRef.current = { width: rect.width, height: rect.height, dpr };

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      buildHexagonList();
      startLoop();
    }

    function handlePointerMove(event) {
      if (reduceMotionRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
      pointerRef.current = inside ? { x, y, active: true } : { x: -9999, y: -9999, active: false };
    }

    function handlePointerLeave() {
      pointerRef.current = { x: -9999, y: -9999, active: false };
    }

    function startLoop() {
      if (!visibilityRef.current) return;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);

      const loop = () => {
        render(ctx);
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();
    }

    function buildHexagonList() {
      const { width, height } = viewportRef.current;
      if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
        hexagonsRef.current = [];
        return;
      }

      const effectiveRadius = HEX_RADIUS - GAP;
      const cols = Math.ceil(width / COL_SPACING) + 4;
      const rows = Math.ceil(height / ROW_SPACING) + 4;

      hexagonsRef.current = [];

      for (let row = -2; row < rows; row++) {
        for (let col = -2; col < cols; col++) {
          const offset = row % 2 === 0 ? 0 : COL_SPACING / 2;
          const cx = col * COL_SPACING + offset;
          const cy = row * ROW_SPACING;

          if (cx < -HEX_RADIUS || cy < -HEX_RADIUS || cx > width + HEX_RADIUS || cy > height + HEX_RADIUS) {
            continue;
          }

          const variance = pseudoRandom(row, col);

          hexagonsRef.current.push({
            cx,
            cy,
            effectiveRadius,
            variance,
          });
        }
      }
    }

    function render(context) {
      const { width, height, dpr } = viewportRef.current;
      if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
        return;
      }
      if (!hexagonsRef.current || hexagonsRef.current.length === 0) return;
      const safeDpr = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;

      if (pointerRef.current.active) {
        const dx = pointerRef.current.x - smoothPointer.x;
        const dy = pointerRef.current.y - smoothPointer.y;

        if (Math.abs(dx) > 500 || Math.abs(dy) > 500) {
          smoothPointer.x = pointerRef.current.x;
          smoothPointer.y = pointerRef.current.y;
        } else {
          smoothPointer.x += dx * 0.15;
          smoothPointer.y += dy * 0.15;
        }
      }

      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, width * safeDpr, height * safeDpr);
      context.scale(safeDpr, safeDpr);

      context.fillStyle = "#0a0a0a";
      context.fillRect(0, 0, width, height);

      const radial1 = context.createRadialGradient(width * 0.2, height * 0.5, 0, width * 0.2, height * 0.5, width * 0.5);
      radial1.addColorStop(0, "rgba(255, 255, 255, 0.02)");
      radial1.addColorStop(1, "transparent");
      context.fillStyle = radial1;
      context.fillRect(0, 0, width, height);

      const radial2 = context.createRadialGradient(width * 0.8, height * 0.8, 0, width * 0.8, height * 0.8, width * 0.5);
      radial2.addColorStop(0, "rgba(255, 255, 255, 0.02)");
      radial2.addColorStop(1, "transparent");
      context.fillStyle = radial2;
      context.fillRect(0, 0, width, height);

      const radial3 = context.createRadialGradient(width * 0.4, height * 0.2, 0, width * 0.4, height * 0.2, width * 0.3);
      radial3.addColorStop(0, "rgba(255, 255, 255, 0.01)");
      radial3.addColorStop(1, "transparent");
      context.fillStyle = radial3;
      context.fillRect(0, 0, width, height);

      context.globalAlpha = 0.3;
      context.strokeStyle = "rgba(255, 255, 255, 0.01)";
      context.lineWidth = 1;
      for (let x = 0; x < width; x += 2) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, height);
        context.stroke();
      }
      for (let y = 0; y < height; y += 2) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
      }
      context.globalAlpha = 1.0;

      const { active: pointerActive } = pointerRef.current;
      const smoothX = smoothPointer.x;
      const smoothY = smoothPointer.y;

      hexagonsRef.current.forEach((hex) => {
        const { cx, cy, effectiveRadius, variance } = hex;

        const path = new Path2D();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i + Math.PI / 6;
          const vx = cx + effectiveRadius * Math.cos(angle);
          const vy = cy + effectiveRadius * Math.sin(angle);
          if (i === 0) path.moveTo(vx, vy);
          else path.lineTo(vx, vy);
        }
        path.closePath();

        let edgeOpacity = 0.1;
        let edgeColor = { r: 255, g: 255, b: 255 };

        if (pointerActive) {
          const dx = smoothX - cx;
          const dy = smoothY - cy;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const maxDistance = LIGHT_RADIUS * 1.5;

          if (distance < maxDistance) {
            const intensity = 1 - distance / maxDistance;
            const glowIntensity = intensity ** 1.5;

            edgeOpacity = 0.1 + glowIntensity * 0.5;
            edgeColor = {
              r: Math.floor(255 - glowIntensity * 50),
              g: Math.floor(255 + glowIntensity * 10),
              b: Math.floor(255 + glowIntensity * 20),
            };
          }
        }

        context.lineWidth = 1;
        context.strokeStyle = `rgba(${edgeColor.r}, ${edgeColor.g}, ${edgeColor.b}, ${edgeOpacity + variance * 0.02})`;
        context.stroke(path);
      });

      const fadeRatio = 0.25;
      const maskGradient = context.createLinearGradient(0, 0, 0, height);
      maskGradient.addColorStop(0, "rgba(0, 0, 0, 0)");
      maskGradient.addColorStop(fadeRatio * 0.5, "rgba(0, 0, 0, 0.3)");
      maskGradient.addColorStop(fadeRatio, "rgba(0, 0, 0, 1)");
      maskGradient.addColorStop(1 - fadeRatio, "rgba(0, 0, 0, 1)");
      maskGradient.addColorStop(1 - fadeRatio * 0.5, "rgba(0, 0, 0, 0.3)");
      maskGradient.addColorStop(1, "rgba(0, 0, 0, 0)");

      context.globalCompositeOperation = "destination-in";
      context.fillStyle = maskGradient;
      context.fillRect(0, 0, width, height);
      context.globalCompositeOperation = "source-over";

      context.restore();
    }
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 z-0 h-full w-full" aria-hidden>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div
        className="pointer-events-none absolute left-0 right-0 top-0"
        style={{
          height: "25%",
          background:
            "linear-gradient(to bottom, #0a0a0a 0%, rgba(10, 10, 10, 0.9) 30%, rgba(10, 10, 10, 0.6) 60%, rgba(10, 10, 10, 0) 100%)",
          zIndex: 1,
        }}
      />
      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0"
        style={{
          height: "25%",
          background:
            "linear-gradient(to top, #0a0a0a 0%, rgba(10, 10, 10, 0.9) 30%, rgba(10, 10, 10, 0.6) 60%, rgba(10, 10, 10, 0) 100%)",
          zIndex: 1,
        }}
      />
    </div>
  );
}
