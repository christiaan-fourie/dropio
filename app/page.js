import Link from "next/link";
import { FiCreditCard, FiGrid, FiImage, FiSearch, FiShield, FiSmile, FiZap } from "react-icons/fi";
import HexagonalBackground from "@/app/components/HexagonalBackground";

function getSiteUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  const vercel = process.env.VERCEL_URL?.replace(/\/$/, "");
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

const SITE = {
  name: "Dropio",
  tagline: "Print-ready PDF layout tools in your browser.",
};

const CATEGORIES = [
  { id: "all", label: "All Tools" },
  { id: "cards", label: "Cards & Identity" },
  { id: "canvas", label: "Canvas & Wrap" },
  { id: "layouts", label: "Sheet Layouts" },
  { id: "utilities", label: "Utilities" },
];

const TOOLS = [
  {
    href: "/business-cards",
    label: "Business Cards",
    description:
      "Place standard 90×50mm cards on A4 or A3 with gutters and crop marks. Export a print-ready PDF in one click.",
    icon: FiCreditCard,
    category: "cards",
    iconClass: "bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/25",
  },
  {
    href: "/canvas-wrap",
    label: "Canvas Wrap",
    description:
      "Preview gallery-wrap bleed and face size on the correct sheet. Stretch-matched export matches what you see.",
    icon: FiImage,
    category: "canvas",
    iconClass: "bg-sky-500/15 text-sky-400 ring-1 ring-sky-500/25",
  },
  {
    href: "/custom-layout",
    label: "Custom Size Layout",
    description:
      "Define item size and quantity; we pick the smallest sheet and pack rows efficiently for production.",
    icon: FiGrid,
    category: "layouts",
    iconClass: "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/25",
  },
  {
    href: "/file-inspector",
    label: "File inspector",
    description:
      "Upload any PDF or common image to see real format, size, dimensions, and PDF page count—detected locally with magic bytes.",
    icon: FiSearch,
    category: "utilities",
    iconClass: "bg-violet-500/15 text-violet-400 ring-1 ring-violet-500/25",
  },
];

const CATEGORY_LABELS = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));

function normalizeCategory(raw) {
  if (!raw || raw === "all") return "all";
  const allowed = new Set(CATEGORIES.map((c) => c.id));
  return allowed.has(raw) ? raw : "all";
}

function categoryHref(id) {
  return id === "all" ? "/" : `/?category=${id}`;
}

/** @param {{ searchParams?: Promise<Record<string, string | string[] | undefined>> }} props */
export async function generateMetadata({ searchParams }) {
  const sp = searchParams ? await searchParams : {};
  const raw = typeof sp.category === "string" ? sp.category : Array.isArray(sp.category) ? sp.category[0] : undefined;
  const category = normalizeCategory(raw);
  const catLabel = CATEGORY_LABELS[category];

  const title =
    category === "all"
      ? `${SITE.name} — Business cards, canvas wrap & custom print layouts`
      : `${catLabel} — ${SITE.name}`;

  const description =
    category === "all"
      ? `${SITE.tagline} Generate PDFs for business cards, gallery canvas wraps, and custom sheet layouts. Processing runs locally in your browser—files are not uploaded to a server.`
      : `Browse ${SITE.name} tools for ${catLabel.toLowerCase()}. ${SITE.tagline}`;

  const canonicalPath = category === "all" ? "/" : `/?category=${category}`;
  const origin = getSiteUrl();

  return {
    title,
    description,
    alternates: {
      canonical: `${origin}${canonicalPath === "/" ? "" : canonicalPath}`,
    },
    openGraph: {
      title,
      description,
      url: `${origin}${canonicalPath === "/" ? "" : canonicalPath}`,
      siteName: SITE.name,
      locale: "en_US",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

function buildJsonLd() {
  const base = getSiteUrl();
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${SITE.name} layout tools`,
    description: SITE.tagline,
    numberOfItems: TOOLS.length,
    itemListElement: TOOLS.map((tool, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: tool.label,
      description: tool.description,
      url: `${base}${tool.href}`,
    })),
  };

  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE.name,
    description: SITE.tagline,
    url: base,
  };

  return [website, itemList];
}

/** @param {{ searchParams?: Promise<Record<string, string | string[] | undefined>> }} props */
export default async function HomePage({ searchParams }) {
  const sp = searchParams ? await searchParams : {};
  const raw = typeof sp.category === "string" ? sp.category : Array.isArray(sp.category) ? sp.category[0] : undefined;
  const activeCategory = normalizeCategory(raw);

  const visibleTools =
    activeCategory === "all" ? TOOLS : TOOLS.filter((t) => t.category === activeCategory);

  const jsonLd = buildJsonLd();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="relative min-h-screen overflow-hidden bg-zinc-950 pb-24">
        <div className="relative">
          <header className="relative mx-auto flex h-[90vh] min-h-[28rem] flex-col items-center justify-center overflow-hidden text-center">
            <HexagonalBackground />
            <div className="relative z-10 mx-auto max-w-6xl px-6 sm:px-8">
              <p className="mb-6 inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-zinc-200 ring-1 ring-inset ring-white/15">
                Free · Private · No account
              </p>
              <h1 className="text-balance text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
                Layouts. Simple, quick, and <span className="text-cyan-400">in your browser.</span>
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-zinc-400">
                Generate print-ready PDFs without software. No signup, no account, no hassle.{" "}
                <strong className="font-semibold text-zinc-200">Runs on your device</strong> — we don&apos;t want your
                artwork.
              </p>
            </div>
          </header>

          <section className="mt-24 mx-auto max-w-6xl px-6 sm:px-8" aria-labelledby="tool-directory-heading">
            <div className="flex flex-col items-center justify-between gap-4 border-b border-zinc-800 pb-8 sm:flex-row">
              <h2 id="tool-directory-heading" className="text-2xl font-bold text-zinc-100">
                Tool directory
              </h2>
              <nav className="flex flex-wrap justify-center gap-2 sm:justify-end" aria-label="Filter tools by category">
                {CATEGORIES.map(({ id, label }) => {
                  const active = activeCategory === id;
                  return (
                    <Link
                      key={id}
                      href={categoryHref(id)}
                      scroll={false}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                        active
                          ? "bg-cyan-600 text-white shadow-md shadow-cyan-900/30"
                          : "bg-zinc-800 text-zinc-300 ring-1 ring-zinc-700 hover:bg-zinc-700"
                      }`}
                    >
                      {label}
                    </Link>
                  );
                })}
              </nav>
            </div>

            <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {visibleTools.map(({ href, label, description, icon: Icon, iconClass }) => (
                <li key={href}>
                  <article>
                    <Link
                      href={href}
                      className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-zinc-700/80 bg-zinc-900/70 p-8 transition-all hover:-translate-y-1 hover:border-cyan-500/40 hover:shadow-xl hover:shadow-cyan-900/20"
                    >
                      <div
                        className={`mb-6 flex h-14 w-14 items-center justify-center rounded-2xl ${iconClass} transition-transform group-hover:scale-110`}
                      >
                        <Icon className="h-7 w-7" aria-hidden />
                      </div>
                      <h3 className="text-xl font-bold text-zinc-100">{label}</h3>
                      <p className="mt-3 flex-1 text-sm leading-relaxed text-zinc-400">{description}</p>
                      <div className="mt-6 flex items-center font-bold text-cyan-400">
                        <span>Launch tool</span>
                        <svg
                          className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          aria-hidden
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2.5}
                            d="M13 7l5 5m0 0l-5 5m5-5H6"
                          />
                        </svg>
                      </div>
                    </Link>
                  </article>
                </li>
              ))}
            </ul>

            {visibleTools.length === 0 && (
              <div className="rounded-3xl border-2 border-dashed border-zinc-700 py-20 text-center">
                <p className="text-zinc-500">More professional tools coming soon.</p>
              </div>
            )}
          </section>

          <section className="mt-16 grid gap-8 sm:grid-cols-3" aria-label="Why use Dropio">
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 rounded-full bg-zinc-800 p-3 shadow-sm ring-1 ring-zinc-700">
                <FiShield className="h-6 w-6 text-cyan-400" aria-hidden />
              </div>
              <h2 className="font-bold text-zinc-100">Privacy-first</h2>
              <p className="mt-1 text-sm text-zinc-500">Files stay on your machine while PDFs are built locally.</p>
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 rounded-full bg-zinc-800 p-3 shadow-sm ring-1 ring-zinc-700">
                <FiZap className="h-6 w-6 text-amber-400" aria-hidden />
              </div>
              <h2 className="font-bold text-zinc-100">Fast layout</h2>
              <p className="mt-1 text-sm text-zinc-500">No upload queues—tweak dimensions and export when ready.</p>
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 rounded-full bg-zinc-800 p-3 shadow-sm ring-1 ring-zinc-700">
                <FiSmile className="h-6 w-6 text-emerald-400" aria-hidden />
              </div>
              <h2 className="font-bold text-zinc-100">No signup</h2>
              <p className="mt-1 text-sm text-zinc-500">Open a tool and start—no subscription or card required.</p>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
