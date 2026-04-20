import "../globals.css";

export default function Layout({ children }) {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-950">
      <main className="min-h-screen flex-1">{children}</main>
    </div>
  );
}
