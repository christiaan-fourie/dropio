import PageClient from "./(pages)/page/PageClient";

export const metadata = {
  title: "Dropio — Simple print layout editor",
  description:
    "A local-first browser layout editor for print sheets, business cards, grid automation, transparent PNG export, and PDF output.",
};

export default function HomePage() {
  return <PageClient />;
}
