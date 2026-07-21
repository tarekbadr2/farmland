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
 * in the user's real browser (where Google is happy), the user signs in, and we
 * hand the Google credential back to the app over the private localhost port it
 * passed in `?port=`. The app then signs in with that credential. The token only
 * ever travels to 127.0.0.1 on the same machine.
 */
function DesktopSignInInner() {
  const params = useSearchParams();
  const port = params.get("port");
  const [status, setStatus] = React.useState<"idle" | "working" | "done" | "error">("idle");
  const [message, setMessage] = React.useState("");

  const run = React.useCallback(async () => {
    if (!port) {
      setStatus("error");
      setMessage("Missing return port. Launch this from the desktop app.");
      return;
    }
    setStatus("working");
    try {
      const { auth } = getFirebase();
      const result = await signInWithPopup(auth, new GoogleAuthProvider());
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const idToken = credential?.idToken;
      if (!idToken) throw new Error("No Google credential returned.");
      // Don't leave a stray session in the browser — the app is the client.
      await signOut(auth).catch(() => undefined);
      // Hand the credential back to the desktop app's loopback listener.
      window.location.href = `http://localhost:${port}/?idToken=${encodeURIComponent(idToken)}`;
      setStatus("done");
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Sign-in failed.");
    }
  }, [port]);

  // Auto-start; the popup is a direct result of the desktop app's user action.
  React.useEffect(() => {
    run();
  }, [run]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <Logo className="size-12" />
      <h1 className="text-xl font-semibold">Herd OS — Sign in</h1>
      {status === "working" && (
        <p className="text-sm text-muted-foreground">Opening Google sign-in…</p>
      )}
      {status === "done" && (
        <p className="max-w-sm text-sm text-muted-foreground">
          Signed in. You can close this tab and return to the Herd OS app.
        </p>
      )}
      {status === "error" && (
        <>
          <p className="max-w-sm text-sm text-destructive">{message}</p>
          <Button onClick={run}>Try again</Button>
        </>
      )}
      {status === "idle" && <Button onClick={run}>Continue with Google</Button>}
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
