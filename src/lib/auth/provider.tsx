"use client";

import * as React from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { claimMembership, getFirebase } from "@/infrastructure/firebase/client";
import { paths } from "@/infrastructure/firebase/paths";
import { setActiveFarm } from "@/infrastructure/firebase/tenant";
import { isFirebaseBackend } from "@/core/repositories";
import type { Role } from "@/core/domain/types";

export interface SessionUser {
  uid: string;
  name: string;
  email: string;
  photoURL?: string;
  role: Role;
  permissions: string[];
}

interface AuthValue {
  user: SessionUser | null;
  loading: boolean;
  /** True when auth is switched off — the demo build runs wide open. */
  bypassed: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  can: (permission: string) => boolean;
}

const DEMO_USER: SessionUser = {
  uid: "demo",
  name: "Tarek Badr",
  email: "owner@niledelta.farm",
  role: "owner",
  permissions: ["*"],
};

const AuthContext = React.createContext<AuthValue | null>(null);

/**
 * Membership lookup.
 *
 * Role lives in Firestore rather than a custom claim so the owner can change it
 * from the Settings screen without a token refresh or an admin SDK round trip.
 * The rules read the same document, so the UI and the database agree by
 * construction — the UI is never the thing enforcing access.
 */
async function loadMembership(user: User): Promise<SessionUser | null> {
  const { db } = getFirebase();
  // A signed-in non-member has no member document. Reading it must resolve to
  // "no access" (null), never crash the sign-in: if the rules deny the read
  // outright, treat that the same as an absent document. The two failure modes
  // — missing doc and denied read — both mean "not a member here".
  let snap;
  try {
    snap = await getDoc(doc(db, paths.members(), user.uid));
  } catch {
    return null;
  }
  if (!snap.exists()) return null;

  const data = snap.data()!;
  return {
    uid: user.uid,
    name: data.name ?? user.displayName ?? user.email?.split("@")[0] ?? "User",
    email: user.email ?? "",
    photoURL: user.photoURL ?? undefined,
    role: (data.role as Role) ?? "worker",
    permissions: (data.permissions as string[]) ?? [],
  };
}

/**
 * Which farm this user belongs to. A top-level `users/{uid}` → { farmId } mapping
 * is written when they join a farm (createFarm / invite claim). Absent for a
 * brand-new user — the caller then treats them as a member of no farm (→ later,
 * onboarding). Returns null on absence or a denied read; the tenant layer then
 * falls back to the default farm, so existing single-farm users keep working.
 */
async function resolveUserFarm(uid: string): Promise<string | null> {
  const { db } = getFirebase();
  try {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? ((snap.data().farmId as string) ?? null) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Resolved once: it depends only on build-time env, never on render state.
  const [enabled] = React.useState(isFirebaseBackend);
  const [user, setUser] = React.useState<SessionUser | null>(enabled ? null : DEMO_USER);
  const [loading, setLoading] = React.useState(enabled);

  React.useEffect(() => {
    if (!enabled) return;
    const { auth } = getFirebase();
    return onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setActiveFarm(null);
        setUser(null);
        setLoading(false);
        return;
      }
      // Resolve which farm this user belongs to before reading membership, so
      // every path below is scoped to their farm. null → tenant layer falls back
      // to the default farm (transition-safe for existing single-farm users).
      setActiveFarm(await resolveUserFarm(fbUser.uid));
      let member = await loadMembership(fbUser);
      // Not a member yet? First sign-in after an invite lands here — ask the
      // function to promote any pending invite, then look again.
      if (!member) {
        try {
          if ((await claimMembership()) > 0) member = await loadMembership(fbUser);
        } catch {
          /* function unavailable, or nothing to claim — treat as no access */
        }
      }
      setUser(member);
      setLoading(false);
    });
  }, [enabled]);

  const value = React.useMemo<AuthValue>(
    () => ({
      user,
      loading,
      bypassed: !enabled,
      signInWithEmail: async (email, password) => {
        const { auth } = getFirebase();
        await signInWithEmailAndPassword(auth, email, password);
      },
      signInWithGoogle: async () => {
        const { auth } = getFirebase();
        // In the desktop app, Google sign-in runs in the user's real browser
        // (Google blocks OAuth in embedded app windows). The preload bridge
        // returns a Google id token, which we exchange for a Firebase session.
        const desktop = (window as unknown as { desktopAuth?: { signInWithGoogle: () => Promise<string> } }).desktopAuth;
        if (desktop?.signInWithGoogle) {
          const idToken = await desktop.signInWithGoogle();
          await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
          return;
        }
        await signInWithPopup(auth, new GoogleAuthProvider());
      },
      signOut: async () => {
        if (!enabled) return;
        await fbSignOut(getFirebase().auth);
      },
      can: (permission) =>
        !enabled ||
        user?.permissions.includes("*") ||
        user?.permissions.includes(permission) ||
        user?.role === "owner",
    }),
    [user, loading, enabled],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
