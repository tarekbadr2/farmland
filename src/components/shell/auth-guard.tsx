"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth/provider";
import { Onboarding } from "@/components/shell/onboarding";

/**
 * Client-side gate for the app shell.
 *
 * This is convenience, not security. The Firestore rules are what actually stop
 * an unauthenticated read — a guard in React only decides what to paint.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, bypassed, needsOnboarding } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    // Bounce to login only when truly signed out. A signed-in user with no farm
    // gets the create-farm flow below, not the login screen.
    if (!bypassed && !loading && !user && !needsOnboarding) router.replace("/");
  }, [bypassed, loading, user, needsOnboarding, router]);

  if (!bypassed && loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!bypassed && needsOnboarding) return <Onboarding />;
  if (!bypassed && !user) return null;

  return <>{children}</>;
}
