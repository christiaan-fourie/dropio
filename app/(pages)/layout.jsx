import "../globals.css";
import Sidebar from "@/app/components/Sidebar";


export default function Layout({ children }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="min-h-screen flex-1 overflow-auto">{children}</main>
    </div>
  );
}
