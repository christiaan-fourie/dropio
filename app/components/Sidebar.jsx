"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FiCreditCard, FiImage, FiGrid, FiSearch } from "react-icons/fi";

const nav = [
  { href: "/business-cards", label: "Business Cards", icon: FiCreditCard },
  { href: "/canvas-wrap", label: "Canvas Wrap", icon: FiImage },
  { href: "/custom-layout", label: "Custom Layout", icon: FiGrid },
  { href: "/file-inspector", label: "File inspector", icon: FiSearch },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 p-6">
        <p className="text-lg font-bold text-gray-900">Tools Box</p>
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
