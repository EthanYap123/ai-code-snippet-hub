import { Plus, SquareCode } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { NavLinks, NewSnippetButton } from "./nav-links";
import { ThemeToggle } from "./theme-toggle";

const newButtonClass =
  "inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg transition hover:opacity-90";

function NewButtonFallback() {
  return (
    <Link href="/new" className={newButtonClass}>
      <Plus className="size-4" aria-hidden />
      <span>
        New<span className="hidden sm:inline"> snippet</span>
      </span>
    </Link>
  );
}

export function Header() {
  // The active-link state needs the URL, so only those bits stream in behind
  // Suspense; the rest of the header is part of the prerendered shell.
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight" aria-label="Snippet Hub home">
          <span className="inline-flex size-7 items-center justify-center rounded-md bg-accent text-accent-fg">
            <SquareCode className="size-4" aria-hidden />
          </span>
          <span className="hidden sm:inline">Snippet Hub</span>
        </Link>
        <Suspense fallback={<NavLinks />}>
          <NavLinks active />
        </Suspense>
        <div className="ml-auto flex items-center gap-2">
          <Suspense fallback={<NewButtonFallback />}>
            <NewSnippetButton className={newButtonClass} />
          </Suspense>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
