import { Suspense } from "react";
import { SnippetView, SnippetViewSkeleton } from "./view";

export default function SnippetPage() {
  // The id comes from ?id= on the client, so the page shell can be prerendered
  // and the snippet streams in with live status updates.
  return (
    <Suspense fallback={<SnippetViewSkeleton />}>
      <SnippetView />
    </Suspense>
  );
}
