import "./globals.css";

export const metadata = {
  title: "Printing Store Web Tool",
  description: "Internal printing layout tool for business cards and canvas wraps",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
