import { Suspense } from "react";
import { SnippetView, SnippetViewSkeleton } from "./view";

export default function SnippetPage() {
  // The id is read on the client (useParams) so the page shell can be prerendered
  // and the snippet streams in with live status updates.
  return (
    <Suspense fallback={<SnippetViewSkeleton />}>
      <SnippetView />
    </Suspense>
  );
}
