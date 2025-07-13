import { FiImage } from "react-icons/fi";

export default function CanvasWrap() {
  return (
    <div className="max-w-3xl mx-auto p-8">
      <div className="text-center mb-8">
        <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <FiImage className="w-7 h-7 text-amber-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Canvas Wrap Tool</h2>
        <p className="text-gray-600">
          Create canvas wrap layouts with proper bleed for gallery wraps and stretched canvases.
        </p>
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center">
        <p className="text-sm text-amber-800 mb-2">
          <strong>Coming Soon:</strong> This tool is currently in development.
        </p>
        <p className="text-sm text-amber-700">
          It will support A3 canvas with 3.5cm bleed per side, printed on A2 sheets.
        </p>
      </div>
    </div>
  );
}