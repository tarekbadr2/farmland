"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/lib/auth/provider";

/**
 * Front door.
 *
 * The public web face is the marketing site (/welcome) — the product sells
 * itself there before anyone signs in. So the root routes by context:
 *   - already signed in (or onboarding) → straight into the app
 *   - the bundled desktop app → the sign-in screen (it's the installed product)
 *   - everyone else on the web → the marketing Welcome page
 */
const DESKTOP = process.env.NEXT_PUBLIC_DESKTOP === "1";

export default function RootPage() {
  const router = useRouter();
  const { user, needsOnboarding, loading, bypassed } = useAuth();

  React.useEffect(() => {
    if (!bypassed && loading) return; // wait for auth to resolve
    if (user || needsOnboarding) router.replace("/dashboard");
    else router.replace(DESKTOP ? "/login" : "/welcome");
  }, [user, needsOnboarding, loading, bypassed, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  );
}
