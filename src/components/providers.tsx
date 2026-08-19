"use client";

import * as React from "react";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { ThemeProvider } from "next-themes";
import { Toaster, toast } from "sonner";
import { I18nProvider } from "@/lib/i18n/provider";
import { AuthProvider } from "@/lib/auth/provider";
import { TooltipProvider } from "@/components/ui/primitives";
import { initConnectivityWatch } from "@/lib/sync/offline-store";
import { captureError } from "@/lib/monitoring";

export function Providers({ children }: { children: React.ReactNode }) {
  // One place wires browser connectivity into the sync store for the whole app.
  React.useEffect(() => initConnectivityWatch(), []);

  const [client] = React.useState(
    () =>
      new QueryClient({
        // A failed read must never masquerade as empty/zero data — that reads as
        // catastrophic data loss on a system of record. Surface every query
        // failure loudly (one coalesced toast, not N), so a Firestore/network
        // hiccup is never mistaken for "0 animals, EGP 0".
        queryCache: new QueryCache({
          onError: (error, query) => {
            // Handled read failures only ever toasted — they never reached
            // telemetry, so a farm silently failing to load data left no signal.
            // Sentry's default integrations catch only *uncaught* errors; a
            // caught query rejection has to be reported explicitly.
            captureError(error, { source: "query", key: query.queryHash });
            const ar =
              typeof document !== "undefined" && document.documentElement.lang === "ar";
            toast.error(
              ar
                ? "تعذّر تحميل أحدث البيانات — تحقّق من الاتصال وحاول مجددًا."
                : "Couldn't load the latest data — check your connection and retry.",
              { id: "query-load-error" },
            );
          },
        }),
        // Mutation failures (a save that didn't stick) are the failures a user
        // most needs the team to see. Dialogs surface them with their own toast;
        // this routes the same error to telemetry centrally, without changing
        // any dialog's own error handling.
        mutationCache: new MutationCache({
          onError: (error, _vars, _ctx, mutation) => {
            captureError(error, {
              source: "mutation",
              key: mutation.options.mutationKey?.join("/"),
            });
          },
        }),
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
              {/* Respect the OS "reduce motion" setting across every framer-motion
                  animation — page/card transitions become instant for users who
                  ask for less motion (vestibular accessibility). */}
              <MotionConfig reducedMotion="user">{children}</MotionConfig>
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
