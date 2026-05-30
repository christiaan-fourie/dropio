import PageClient from "./PageClient";

export const metadata = {
  title: "Page",
  description:
    "Define a custom page size, drop images onto it, and arrange them with freeform move and resize. A lightweight layout canvas that runs locally in your browser.",
};

export default function PageToolPage() {
  return <PageClient />;
}
