"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FiCreditCard, FiImage, FiGrid, FiPrinter, FiHome } from "react-icons/fi";

const nav = [
  { href: "/", label: "Home", icon: FiHome },
  { href: "/business-cards", label: "Business Cards", icon: FiCreditCard },
  { href: "/canvas-wrap", label: "Canvas Wrap", icon: FiImage },
  { href: "/custom-layout", label: "Custom Layout", icon: FiGrid },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
            <FiPrinter className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-lg font-bold text-gray-900">Print Tools</p>
            <p className="text-xs text-gray-500">Layout system</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {nav.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/"
              ? pathname === "/"
              : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                active
                  ? "border border-blue-200 bg-blue-50 text-blue-700"
                  : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <Icon className={`h-5 w-5 shrink-0 ${active ? "text-blue-600" : ""}`} />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
