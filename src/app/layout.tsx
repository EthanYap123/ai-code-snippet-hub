import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DemoBanner } from "@/components/demo-banner";
import { Header } from "@/components/header";
import { Providers } from "@/components/providers";
import { themeInitScript } from "@/components/theme-toggle";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Snippet Hub · AI code snippet & documentation hub", template: "%s · Snippet Hub" },
  description:
    "Paste code in any language and get documentation, semantic tags and vector embeddings generated in the background, then find it again by describing what it does.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafbfc" },
    { media: "(prefers-color-scheme: dark)", color: "#16181d" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <Providers>
          <Header />
          <DemoBanner />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">{children}</main>
          <footer className="border-t border-border">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-muted sm:px-6">
              <span>Snippet Hub · built by Ethan Yap</span>
              <a
                href="https://github.com/EthanYap123/ai-code-snippet-hub"
                className="hover:text-fg"
                target="_blank"
                rel="noreferrer"
              >
                Source on GitHub
              </a>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
