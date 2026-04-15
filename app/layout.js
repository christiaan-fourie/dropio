import "./globals.css";

import Header from "./components/Header";

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "Dropio — Print-ready PDF layouts in your browser",
    template: "%s | Dropio",
  },
  description:
    "Free client-side tools for business card sheets, gallery canvas wraps, and custom print layouts. PDFs are generated locally—your files are not uploaded.",
  applicationName: "Dropio",
  robots: { index: true, follow: true },
};



export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        <div className="flex min-h-screen flex-col bg-zinc-950">
          <Header />
          <main className="min-h-0 flex-1 overflow-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}
