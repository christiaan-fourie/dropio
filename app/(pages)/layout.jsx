import "../globals.css";

export default function Layout({ children }) {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="min-h-screen flex-1">{children}</main>
    </div>
  );
}
