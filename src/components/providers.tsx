"use client";

import { SWRConfig } from "swr";
import { fetcher } from "@/lib/fetcher";
import { ToastProvider } from "./toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={{ fetcher, revalidateOnFocus: false, keepPreviousData: true, errorRetryCount: 2 }}>
      <ToastProvider>{children}</ToastProvider>
    </SWRConfig>
  );
}
