"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";

import { ApiError } from "@/lib/api";
import { ThemeProvider, useTheme } from "@/components/theme-provider";

/**
 * Client-side data layer.
 *
 * `@tanstack/react-query` was already a dependency but nothing used it: every
 * page hand-rolled `useEffect` + `useState` + axios. That cost more than
 * boilerplate — two pages asking for the same segment list fetched it twice,
 * nothing was cached across navigation, a failed request left the page in a
 * permanent loading state, and the only "live" behaviour in the product was one
 * hard-coded 60-second interval on the overview.
 *
 * Defaults here encode the shape of this data: aggregates over a trailing window
 * go stale in well under a minute, so a short `staleTime` with background
 * refetching keeps screens current without a spinner on every navigation.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: true,
            // A 401 has already redirected to the login page and a 404 will not
            // become a 200 on the third attempt; retrying either only delays
            // the error the user needs to see.
            retry: (failureCount, error) => {
              const status = (error as ApiError)?.status;
              if (status && status < 500) return false;
              return failureCount < 2;
            },
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
          },
          mutations: { retry: false },
        },
      })
  );

  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>
        {children}
        <ThemedToaster />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

/** Sonner paints its own surface, so it has to be told which theme is active. */
function ThemedToaster() {
  const { resolved } = useTheme();
  return (
    <Toaster
      position="bottom-right"
      theme={resolved}
      toastOptions={{
        style: {
          background: "rgb(var(--surface))",
          border: "1px solid rgb(var(--bdr))",
          color: "rgb(var(--ink))",
        },
      }}
    />
  );
}
