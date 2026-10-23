"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Library" },
  { href: "/about", label: "How it works" },
] as const;

function Links({ pathname }: { pathname: string | null }) {
  return (
    <nav className="flex items-center text-sm sm:ml-2">
      {NAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={pathname === item.href ? "page" : undefined}
          className={`whitespace-nowrap rounded-md px-2 py-1.5 transition sm:px-2.5 ${
            pathname === item.href ? "text-fg" : "text-muted hover:text-fg"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function ActiveLinks() {
  return <Links pathname={usePathname()} />;
}

/** `active` reads the current path (needs Suspense); without it, renders plain links. */
export function NavLinks({ active }: { active?: boolean }) {
  return active ? <ActiveLinks /> : <Links pathname={null} />;
}

export function NewSnippetButton({ className }: { className: string }) {
  const pathname = usePathname();
  if (pathname === "/new") return null;
  return (
    <Link href="/new" className={className}>
      <Plus className="size-4" aria-hidden />
      <span>
        New<span className="hidden sm:inline"> snippet</span>
      </span>
    </Link>
  );
}
