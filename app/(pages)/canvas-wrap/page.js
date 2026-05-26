import PageClient from "../page/PageClient";

export const metadata = {
  title: "Canvas Wrap",
  description:
    "Gallery-wrap layout with frame-depth bleed. Export print-ready PDFs locally in your browser.",
};

export default function CanvasWrapPage() {
  return <PageClient initialViewMode="canvas-wrap" />;
}
