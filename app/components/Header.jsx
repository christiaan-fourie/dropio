import Link from "next/link";
import { FiCoffee, FiZap } from "react-icons/fi";
import { FaGithub } from "react-icons/fa6";
import HeaderToolsDropdown from "@/app/components/HeaderToolsDropdown";

const DEFAULT_GITHUB_REPO = "https://github.com/christiaan-fourie/dropio";

function githubRepoUrl() {
  const raw = process.env.NEXT_PUBLIC_GITHUB_REPO_URL?.trim();
  if (!raw) return DEFAULT_GITHUB_REPO;
  return raw.replace(/\/$/, "").replace(/\.git$/, "");
}

const TOOL_LINKS = [
  { href: "/business-cards", label: "Business Cards (For networking, duh)" },
  { href: "/canvas-wrap", label: "Canvas Wrap (Art attack!)" },
  { href: "/custom-layout", label: "Custom Layout (Go wild)" },
  { href: "/file-inspector", label: "File inspector (What is this thing?)" },
];

function navLinkClassName() {
  return "group rounded-full px-4 py-2 text-sm font-medium text-gray-600 transition-all hover:bg-amber-100 hover:text-amber-900 active:scale-95";
}

function dropdownPanelClassName() {
  return "absolute left-0 top-[calc(100%+0.5rem)] z-50 min-w-[15rem] overflow-hidden rounded-2xl border-2 border-amber-100 bg-white p-1.5 shadow-2xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-200";
}

function dropdownLinkClassName() {
  return "block rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-amber-50 hover:text-orange-600";
}

export default function Header() {
  const githubUrl = githubRepoUrl();

  return (
    <header className="sticky top-0 z-50 w-full border-b-2 border-dashed border-amber-200 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-4 px-4 sm:px-8">
        
        {/* The "Look at me, I'm a Brand" Section */}
        <Link
          href="/"
          className="group flex items-center gap-3 outline-none transition-transform hover:-rotate-1"
        >
          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-orange-400 to-rose-500 text-white shadow-lg shadow-orange-200 transition-all group-hover:rotate-12 group-hover:scale-110">
            <span className="text-2xl font-black italic tracking-tighter">D</span>
            <FiZap className="absolute -right-1 -top-1 h-4 w-4 text-yellow-300 drop-shadow-md" />
          </div>
          <div className="leading-tight">
            <span className="block text-xl font-black tracking-tight text-gray-900">Dropio</span>
            <span className="hidden text-[10px] font-bold uppercase tracking-[0.2em] text-orange-500 sm:block">
              Pixel Perfection, Mostly.
            </span>
          </div>
        </Link>

        {/* Desktop Nav: Where the magic happens */}
        <nav className="hidden items-center gap-2 md:flex">
          {/* <Link href="/" className={navLinkClassName()}>
            The Big Picture
          </Link> */}

          <HeaderToolsDropdown
            links={TOOL_LINKS}
            triggerLabel="Tools Box"
            panelHeading="Choose your weapon"
            summaryClassName={`${navLinkClassName()} flex items-center gap-1`}
            panelClassName={dropdownPanelClassName()}
            linkClassName={dropdownLinkClassName()}
          />
        </nav>

        <div className="flex items-center gap-2">
          <a
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-2xl border-2 border-gray-900 bg-white px-3 py-2 text-xs font-bold text-gray-900 shadow-[2px_2px_0px_0px_rgba(17,24,39,1)] transition-all hover:-translate-y-0.5 hover:bg-gray-900 hover:text-white active:translate-y-0 sm:px-4"
          >
            <FaGithub className="h-4 w-4 shrink-0" aria-hidden />
            <span>Contribute</span>
          </a>

          {/* Mobile Menu: The "I'm on my phone" Button */}
          <details className="relative md:hidden">
          <summary className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-xl bg-gray-100 text-gray-900 transition-colors hover:bg-orange-100 marker:hidden">
            <div className="space-y-1">
              <span className="block h-0.5 w-5 bg-current"></span>
              <span className="block h-0.5 w-3 bg-current"></span>
              <span className="block h-0.5 w-5 bg-current"></span>
            </div>
          </summary>
          <div className="absolute right-0 top-full mt-3 z-50 w-64 rounded-3xl border-4 border-gray-900 bg-white p-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
             <Link href="/" className="block py-3 text-lg font-bold hover:text-orange-500">Overview</Link>
             <div className="h-px bg-gray-100 my-2" />
             <p className="text-[10px] font-black uppercase text-gray-400 mb-2">The Tools</p>
             {TOOL_LINKS.map(({ href, label }) => (
                <Link key={href} href={href} className="block py-2 font-medium text-gray-600">{label}</Link>
             ))}
             <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700">
                <FiCoffee className="shrink-0" />
                <span>Your data stays here. Promise.</span>
             </div>
          </div>
        </details>
        </div>
      </div>
    </header>
  );
}