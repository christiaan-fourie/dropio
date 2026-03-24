import "./globals.css";
import Sidebar from "./components/Sidebar";

export const metadata = {
  title: "Printing Store Web Tool",
  description: "Internal printing layout tool for business cards and canvas wraps",
};



export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="flex min-h-screen bg-gray-50">
          <Sidebar />
          <main className="min-h-screen flex-1 overflow-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}
