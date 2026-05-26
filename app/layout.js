import "./globals.css";
import { ThemeProvider, themeInitScript } from "./components/ThemeProvider";

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "Dropio — Print-ready PDF layouts in your browser",
    template: "%s | Dropio",
  },
  description:
    "Local-first print layout editor with business-card automation, gallery canvas wraps, and PDF/PNG export—all in your browser.",
  applicationName: "Dropio",
  robots: { index: true, follow: true },
};



export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="neu-bg min-h-screen antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
