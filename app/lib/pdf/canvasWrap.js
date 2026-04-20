import jsPDF from "jspdf";
import { getCanvasWrapLayoutMm } from "./canvasSheetLayout";
import { processImageToDataURL } from "./workers";

export async function generateCanvasWrapPDF({ files, width, height, thickness, extra }) {
  if (!files?.length) throw new Error("No images provided");

  const layout = getCanvasWrapLayoutMm({ width, height, thickness, extra });
  const { sheetWidth, sheetHeight, printWidth, printHeight, printOffsetX, printOffsetY } = layout;
  const needsLandscape = printWidth > printHeight;

  const pdf = new jsPDF({
    orientation: needsLandscape ? "landscape" : "portrait",
    unit: "mm",
    format: [sheetWidth, sheetHeight],
  });

  for (let i = 0; i < files.length; i++) {
    if (i > 0) pdf.addPage();
    const imageData = await processImageToDataURL(files[i]);
    const format = (files[i].type === "image/png" ? "PNG" : "JPEG");
    pdf.addImage(imageData, format, printOffsetX, printOffsetY, printWidth, printHeight, undefined, "FAST");
  }

  const pdfBytes = pdf.output("arraybuffer");
  return {
    pdfBytes,
    filename: `canvas-wrap-${width}x${height}mm-${files.length}pcs.pdf`,
  };
}
