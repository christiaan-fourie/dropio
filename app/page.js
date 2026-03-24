import Link from "next/link";
import { FiCreditCard, FiImage, FiGrid, FiPrinter } from "react-icons/fi";
import Heading from "@/app/components/Heading";

const tools = [
  {
    href: "/business-cards",
    label: "Business Cards",
    description: "90×50mm cards on A4/A3 sheets",
    icon: FiCreditCard,
  },
  {
    href: "/canvas-wrap",
    label: "Canvas Wrap",
    description: "Gallery wrap bleed and sheet sizing",
    icon: FiImage,
  },
  {
    href: "/custom-layout",
    label: "Custom Size Layout",
    description: "Flexible dimensions, auto sheet optimization",
    icon: FiGrid,
  },
];

export default function HomePage() {
  return (
    <div className="min-h-full bg-gray-50 p-8">
      <div className="mx-auto max-w-3xl">
        <Heading
          icon={FiPrinter}
          title="Print Tools"
          description="Choose a tool — each opens on its own page."
        />

        <ul className="grid gap-4 sm:grid-cols-1">
          {tools.map(({ href, label, description, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:shadow-md"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="font-semibold text-gray-900">{label}</span>
                  <p className="mt-1 text-sm text-gray-600">{description}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
