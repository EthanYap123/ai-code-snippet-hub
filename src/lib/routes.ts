/**
 * Snippet pages use a query parameter rather than a dynamic segment so the same
 * route works in the server build and in the static GitHub Pages demo.
 */
export function snippetHref(id: string): string {
  return `/snippet?id=${encodeURIComponent(id)}`;
}
