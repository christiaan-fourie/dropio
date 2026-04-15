export default function Heading({ icon: Icon, title, description }) {
  return (
    <header className="relative mb-10 pb-8 after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-zinc-600 after:to-transparent">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
        <div
          className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 via-blue-600 to-indigo-700 shadow-lg shadow-blue-900/20 ring-1 ring-white/25 ring-inset sm:h-14 sm:w-14"
          aria-hidden
        >
          <span className="absolute inset-[1px] rounded-[0.875rem] bg-gradient-to-b from-white/25 to-transparent opacity-70" />
          <Icon className="relative h-6 w-6 text-white drop-shadow-sm sm:h-7 sm:w-7" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100 sm:text-[1.65rem] sm:leading-snug">
            {title}
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-zinc-400 sm:text-[0.9375rem]">
            {description}
          </p>
        </div>
      </div>
    </header>
  );
}
