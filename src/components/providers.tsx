"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { I18nProvider } from "@/lib/i18n/provider";
import { AuthProvider } from "@/lib/auth/provider";
import { TooltipProvider } from "@/components/ui/primitives";
import { initConnectivityWatch } from "@/lib/sync/offline-store";

export function Providers({ children }: { children: React.ReactNode }) {
  // One place wires browser connectivity into the sync store for the whole app.
  React.useEffect(() => initConnectivityWatch(), []);

  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // The herd doesn't change every second; keep the parlor snappy and
            // let real-time listeners push updates when Firebase is wired up.
            staleTime: 60_000,
            gcTime: 15 * 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <I18nProvider>
          <AuthProvider>
            <TooltipProvider delayDuration={200}>
              {children}
              <Toaster
                position="top-center"
                toastOptions={{
                  className:
                    "!bg-card !text-card-foreground !border !border-border !shadow-lg !rounded-xl",
                }}
              />
            </TooltipProvider>
          </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
