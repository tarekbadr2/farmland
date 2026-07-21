"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";

import { Logo } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";
import { getFirebase } from "@/infrastructure/firebase/client";

/**
 * Desktop sign-in bridge.
 *
 * The installed desktop app can't do Google sign-in in its own window — Google
 * refuses OAuth from embedded app contexts. So the desktop app opens THIS page
 * in the user's real browser, the user signs in, and we hand the Google
 * credential back over the private localhost port the app passed in `?port=`.
 *
 * The popup MUST be started by a real click (browsers block programmatic popups),
 * so this waits for the button. On success or failure we redirect to the app's
 * loopback — reporting the error too, so the app window never hangs waiting.
 */
function DesktopSignInInner() {
  const port = useSearchParams().get("port");
  const [working, setWorking] = React.useState(false);
  const [error, setError] = React.useState<string | null>(
    null,
  );

  const run = React.useCallback(async () => {
    if (!port) {
      setError("Missing return port. Launch this from the desktop app.");
      return;
    }
    setWorking(true);
    setError(null);
    try {
      const { auth } = getFirebase();
      const result = await signInWithPopup(auth, new GoogleAuthProvider());
      const idToken = GoogleAuthProvider.credentialFromResult(result)?.idToken;
      if (!idToken) throw new Error("No Google credential returned.");
      // Don't leave a stray session in the browser — the app is the client.
      await signOut(auth).catch(() => undefined);
      window.location.href = `http://localhost:${port}/?idToken=${encodeURIComponent(idToken)}`;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sign-in failed.";
      // Report the failure to the app so its window stops waiting; the app
      // surfaces the error and the user can retry from there.
      window.location.href = `http://localhost:${port}/?error=${encodeURIComponent(msg)}`;
    }
  }, [port]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <Logo className="size-12" />
      <h1 className="text-xl font-semibold">Herd OS — Sign in</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Continue with Google to sign in to the Herd OS desktop app.
      </p>
      {error && <p className="max-w-sm text-sm text-destructive">{error}</p>}
      <Button onClick={run} disabled={working || !port}>
        {working ? "Opening Google…" : "Continue with Google"}
      </Button>
    </div>
  );
}

export default function DesktopSignInPage() {
  return (
    <React.Suspense fallback={null}>
      <DesktopSignInInner />
    </React.Suspense>
  );
}
