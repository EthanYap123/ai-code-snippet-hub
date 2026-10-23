import { Suspense } from "react";
import { Dashboard, DashboardSkeleton } from "./dashboard";

export default function HomePage() {
  // The dashboard reads ?q / ?tag / ?language on the client, so it streams in
  // behind a skeleton while the static shell renders immediately.
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}
