import type { NextConfig } from "next";

/**
 * `npm run build:demo` sets NEXT_PUBLIC_DEMO=1 to produce the static GitHub Pages
 * build: no server, and the API is answered in the browser (src/lib/demo).
 */
const demo = process.env.NEXT_PUBLIC_DEMO === "1";

const nextConfig: NextConfig = {
  // Static export can't do partial prerendering, so the demo build opts out.
  cacheComponents: !demo,
  partialPrefetching: !demo,
  // PGlite ships its own WASM build of Postgres; keep it out of the server bundle so
  // it can resolve its data files at runtime.
  serverExternalPackages: ["@electric-sql/pglite", "@electric-sql/pglite-pgvector"],
  ...(demo && {
    output: "export",
    basePath: process.env.DEMO_BASE_PATH ?? "/ai-code-snippet-hub",
    trailingSlash: true,
    // Route handlers are .ts files; leaving that extension out drops the API from
    // the static build, since the browser serves it instead.
    pageExtensions: ["tsx"],
  }),
  turbopack: {
    root: import.meta.dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
