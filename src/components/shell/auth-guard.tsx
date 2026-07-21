"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth/provider";

/**
 * Client-side gate for the app shell.
 *
 * This is convenience, not security. The Firestore rules are what actually stop
 * an unauthenticated read — a guard in React only decides what to paint.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, bypassed } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (!bypassed && !loading && !user) router.replace("/");
  }, [bypassed, loading, user, router]);

  if (!bypassed && loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!bypassed && !user) return null;

  return <>{children}</>;
}
