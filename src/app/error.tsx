"use client";

import { ErrorState } from "@/components/states";

export default function Error({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="mx-auto max-w-xl py-12">
      <ErrorState message="Something went wrong while rendering this page." onRetry={retry} />
    </div>
  );
}
