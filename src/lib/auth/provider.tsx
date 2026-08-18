"use client";

import * as React from "react";
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  setPersistence,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { claimMembership, getFirebase, clearLocalData } from "@/infrastructure/firebase/client";
import { paths } from "@/infrastructure/firebase/paths";
import {
  getActiveFarm,
  pickActiveFarm,
  rememberPreferredFarm,
  setActiveFarm,
} from "@/infrastructure/firebase/tenant";
import { isFirebaseBackend } from "@/core/repositories";
import type { Role } from "@/core/domain/types";
import {
  effectivePermissions,
  hasPermission,
  type PermissionKey,
} from "@/core/auth/permissions";
import { setAuditActor } from "@/lib/audit-actor";

export interface SessionUser {
  uid: string;
  name: string;
  email: string;
  photoURL?: string;
  role: Role;
  /** Effective permission keys for the ACTIVE farm (authoritative — derived from
   *  the role when a member doc has none). */
  permissions: string[];
  /** Organization the user belongs to (once orgs are provisioned). */
  orgId?: string;
  /** Every farm the user can access. Drives the farm switcher. */
  farmIds: string[];
  /** The farm currently in context (one of farmIds). */
  activeFarmId?: string;
}

interface AuthValue {
  user: SessionUser | null;
  loading: boolean;
  /** Signed in, but not a member of any farm yet → show the create-farm flow. */
  needsOnboarding: boolean;
  /** Re-resolve the session (call after creating/joining a farm). */
  refreshSession: () => Promise<void>;
  /** Switch which farm is in context (multi-farm members). Re-resolves the
   *  member's role/permissions for the new farm. Callers should invalidate any
   *  farm-scoped query cache afterwards. */
  switchFarm: (farmId: string) => Promise<void>;
  /** True when auth is switched off — the demo build runs wide open. */
  bypassed: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  /** Create a new email/password account (invite accept flow). */
  signUpWithEmail: (email: string, password: string) => Promise<void>;
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
  farmIds: [],
};

const AuthContext = React.createContext<AuthValue | null>(null);

/** localStorage key for the "remember me" preference. Default is to remember. */
export const REMEMBER_KEY = "herdos.remember";

/**
 * Apply the "remember me" choice before signing in.
 *
 * Local persistence keeps the session across app restarts (the default so users
 * aren't asked to sign in every launch); session persistence clears it when the
 * app/tab closes — for a shared machine. Must be set before the sign-in call.
 */
async function applyRememberPersistence() {
  const { auth } = getFirebase();
  const remember =
    typeof window === "undefined" || window.localStorage.getItem(REMEMBER_KEY) !== "0";
  try {
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
  } catch {
    /* non-fatal — fall back to the SDK default (local) */
  }
}

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
  const role = (data.role as Role) ?? "farm_worker";
  return {
    uid: user.uid,
    name: data.name ?? user.displayName ?? user.email?.split("@")[0] ?? "User",
    email: user.email ?? "",
    photoURL: user.photoURL ?? undefined,
    role,
    // Authoritative: the explicit set if the doc has one, else derived from the
    // role so legacy member docs (role set, permissions empty) keep working.
    permissions: [...effectivePermissions(role, data.permissions as string[] | undefined)],
    orgId: (data.orgId as string) ?? undefined,
    farmIds: [],
  };
}

/**
 * Which farm this user belongs to. A top-level `users/{uid}` → { farmId } mapping
 * is written when they join a farm (createFarm / invite claim). Absent for a
 * brand-new user — the caller then treats them as a member of no farm (→ later,
 * onboarding). Returns null on absence or a denied read; the tenant layer then
 * falls back to the default farm, so existing single-farm users keep working.
 */
interface UserFarms {
  orgId?: string;
  farmIds: string[];
  defaultFarmId: string | null;
}

async function resolveUserFarms(uid: string): Promise<UserFarms> {
  const { db } = getFirebase();
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return { farmIds: [], defaultFarmId: null };
    const d = snap.data();
    // New shape: { orgId, farmIds[], defaultFarmId }. Legacy: { farmId }.
    const farmIds: string[] = Array.isArray(d.farmIds)
      ? (d.farmIds as string[])
      : d.farmId
        ? [d.farmId as string]
        : [];
    const defaultFarmId =
      (d.defaultFarmId as string) ?? (d.farmId as string) ?? farmIds[0] ?? null;
    return { orgId: d.orgId as string | undefined, farmIds, defaultFarmId };
  } catch {
    return { farmIds: [], defaultFarmId: null };
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Resolved once: it depends only on build-time env, never on render state.
  const [enabled] = React.useState(isFirebaseBackend);
  const [user, setUser] = React.useState<SessionUser | null>(enabled ? null : DEMO_USER);
  const [loading, setLoading] = React.useState(enabled);
  const [needsOnboarding, setNeedsOnboarding] = React.useState(false);

  // Resolve the signed-in user's farm and membership. Reusable so it can be
  // re-run after the onboarding wizard creates a farm.
  const resolveSession = React.useCallback(async (fbUser: User) => {
    // Resolve which farms this user belongs to, pick the active one (remembered
    // choice, else default), and scope every path below to it before reading
    // membership.
    let { orgId, farmIds, defaultFarmId } = await resolveUserFarms(fbUser.uid);
    setActiveFarm(pickActiveFarm(farmIds, defaultFarmId));
    let member = await loadMembership(fbUser);
    // Not a member yet? First sign-in after an invite lands here — ask the
    // function to promote any pending invite, then look again.
    if (!member) {
      try {
        if ((await claimMembership()) > 0) {
          ({ orgId, farmIds, defaultFarmId } = await resolveUserFarms(fbUser.uid));
          setActiveFarm(pickActiveFarm(farmIds, defaultFarmId));
          member = await loadMembership(fbUser);
        }
      } catch {
        /* function unavailable, or nothing to claim */
      }
    }
    if (member) {
      member.farmIds = farmIds;
      member.activeFarmId = getActiveFarm();
      member.orgId = member.orgId ?? orgId;
    }
    setUser(member);
    // Signed in but part of no farm → onboarding (create your farm), which in a
    // self-serve product is what any new sign-up should see.
    setNeedsOnboarding(!member);
    setLoading(false);
  }, []);

  // Keep the audit actor in step with the session, so the repository stamps
  // each logged action with who did it (covers the demo user too).
  React.useEffect(() => {
    setAuditActor(user ? { uid: user.uid, name: user.name, role: user.role } : null);
  }, [user]);

  // Keep role and permissions LIVE. Membership is read once at sign-in, so a
  // demotion (or a permission being revoked) otherwise wouldn't reach an open
  // tab until a reload — leaving manager-only controls visible and clickable
  // for someone who no longer holds them. Subscribe to the active member
  // document and fold changes straight into the session; the backend already
  // re-checks on every request, but this makes the UI honest immediately, on
  // every open tab. Keyed on the stable ids so a permission change (which keeps
  // uid/activeFarmId) updates in place without tearing down the listener.
  React.useEffect(() => {
    if (!enabled) return;
    const uid = user?.uid;
    const farmId = user?.activeFarmId;
    if (!uid || !farmId) return;
    const { db } = getFirebase();
    return onSnapshot(
      doc(db, `farms/${farmId}/members/${uid}`),
      (snap) => {
        if (!snap.exists()) {
          // Removed from this farm while signed in — revoke access at once.
          setUser(null);
          setNeedsOnboarding(false);
          return;
        }
        const data = snap.data();
        const role = (data.role as Role) ?? "farm_worker";
        const permissions = [...effectivePermissions(role, data.permissions as string[] | undefined)];
        setUser((prev) => (prev ? { ...prev, role, permissions } : prev));
      },
      () => {
        /* denied / stream error — keep the last-known session rather than
           bouncing the user; the next request still enforces server-side. */
      },
    );
  }, [enabled, user?.uid, user?.activeFarmId]);

  React.useEffect(() => {
    if (!enabled) return;
    const { auth } = getFirebase();
    return onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setActiveFarm(null);
        setUser(null);
        setNeedsOnboarding(false);
        setLoading(false);
        return;
      }
      await resolveSession(fbUser);
    });
  }, [enabled, resolveSession]);

  const value = React.useMemo<AuthValue>(
    () => ({
      user,
      loading,
      needsOnboarding,
      refreshSession: async () => {
        const { auth } = getFirebase();
        if (auth.currentUser) await resolveSession(auth.currentUser);
      },
      switchFarm: async (farmId) => {
        rememberPreferredFarm(farmId);
        setActiveFarm(farmId);
        const { auth } = getFirebase();
        if (auth.currentUser) await resolveSession(auth.currentUser);
      },
      bypassed: !enabled,
      signInWithEmail: async (email, password) => {
        const { auth } = getFirebase();
        await applyRememberPersistence();
        await signInWithEmailAndPassword(auth, email, password);
      },
      signUpWithEmail: async (email, password) => {
        const { auth } = getFirebase();
        await applyRememberPersistence();
        await createUserWithEmailAndPassword(auth, email, password);
      },
      signInWithGoogle: async () => {
        const { auth } = getFirebase();
        await applyRememberPersistence();
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
        // Sign out first (the part that must succeed), then wipe sensitive farm
        // data cached on the device — important on shared desktops — and hard-
        // reload to a clean login. Clearing is best-effort and time-boxed so it
        // can never block or break the logout itself.
        await fbSignOut(getFirebase().auth);
        const goToLogin = () => {
          if (typeof window !== "undefined") window.location.assign("/login");
        };
        Promise.race([
          clearLocalData(),
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ]).finally(goToLogin);
      },
      // Permission-first: delegates to the shared catalog check (supports `*`
      // and `module.*`). Auth-off demo builds and the owner are always allowed.
      can: (permission) =>
        !enabled ||
        user?.role === "owner" ||
        hasPermission(user?.permissions, permission as PermissionKey),
    }),
    [user, loading, needsOnboarding, enabled, resolveSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
