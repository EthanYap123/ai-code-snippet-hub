import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <p className="font-mono text-sm text-muted">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-muted">That page doesn’t exist. The snippet may have been deleted.</p>
      <Link href="/" className="mt-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90">
        Back to the library
      </Link>
    </div>
  );
}
