import FileInspectorClient from "./FileInspectorClient";

export const metadata = {
  title: "File inspector",
  description:
    "Analyse PDF and image files in the browser: format detection, dimensions, PDF page count, and file metadata. Files stay on your device.",
};

export default function FileInspectorPage() {
  return <FileInspectorClient />;
}
