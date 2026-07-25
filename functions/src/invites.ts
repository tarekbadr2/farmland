import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";

import { REGION, db } from "./shared";
import { sendEmail, inviteEmail } from "./email";
import { permissionsForRole, isKnownRole } from "./roles";

// Where the invite link points. Set APP_BASE_URL in the functions env to your
// deployed web origin; falls back to the known Vercel deployment.
const APP_BASE_URL =
  process.env.APP_BASE_URL || "https://farmland-tarekbadr2s-projects.vercel.app";

const EXPIRY_PRESETS: Record<string, number> = {
  "24h": 86_400_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
};

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

/** The caller's org + whether they may manage members in it. */
async function callerOrgAccess(uid: string): Promise<{ orgId: string; canInvite: boolean }> {
  const userSnap = await db.doc(`users/${uid}`).get();
  const u = userSnap.data() ?? {};
  const orgId: string = u.orgId ?? "";
  if (!orgId) return { orgId, canInvite: false };

  const orgSnap = await db.doc(`orgs/${orgId}`).get();
  if (orgSnap.data()?.ownerId === uid) return { orgId, canInvite: true };

  // Otherwise: hold org.members (or *) on any of their farms.
  const farmIds: string[] = Array.isArray(u.farmIds) ? u.farmIds : u.farmId ? [u.farmId] : [];
  for (const farmId of farmIds) {
    const m = await db.doc(`farms/${farmId}/members/${uid}`).get();
    const perms: string[] = m.data()?.permissions ?? [];
    if (perms.includes("*") || perms.includes("org.members")) return { orgId, canInvite: true };
  }
  return { orgId, canInvite: false };
}

/**
 * Create an invitation: a secure token parked at orgs/{orgId}/invites/{token},
 * plus an email with the accept link. The invitee isn't a member yet — the token
 * is the capability; acceptInvite turns it into real memberships on sign-in.
 */
export const createInvite = onCall({ region: REGION }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");

  const { orgId, canInvite } = await callerOrgAccess(uid);
  if (!orgId) throw new HttpsError("failed-precondition", "No organization for this account.");
  if (!canInvite) throw new HttpsError("permission-denied", "You can't invite members.");

  const email = String(req.data?.email ?? "").trim().toLowerCase();
  const role = String(req.data?.role ?? "");
  const farmIds: string[] = Array.isArray(req.data?.farmIds) ? req.data.farmIds : [];
  const expiry = String(req.data?.expiry ?? "7d");
  const welcomeMessage = String(req.data?.welcomeMessage ?? "").slice(0, 1000);

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new HttpsError("invalid-argument", "A valid email is required.");
  }
  if (!isKnownRole(role)) throw new HttpsError("invalid-argument", "Unknown role.");
  if (farmIds.length === 0) throw new HttpsError("invalid-argument", "Assign at least one farm.");

  // Only farms in the caller's org may be assigned.
  const orgFarms = await db.collection("farms").where("orgId", "==", orgId).get();
  const orgFarmIds = new Set(orgFarms.docs.map((d) => d.id));
  const assigned = farmIds.filter((f) => orgFarmIds.has(f));
  if (assigned.length === 0) throw new HttpsError("invalid-argument", "No valid farms.");

  const token = newToken();
  const now = Date.now();
  const ttl = EXPIRY_PRESETS[expiry] ?? EXPIRY_PRESETS["7d"];
  const invite = {
    token,
    email,
    orgId,
    role,
    farmIds: assigned,
    welcomeMessage: welcomeMessage || null,
    invitedBy: uid,
    invitedByName: req.auth?.token?.name ?? req.auth?.token?.email ?? null,
    invitedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttl).toISOString(),
    status: "pending",
  };
  await db.doc(`orgs/${orgId}/invites/${token}`).set(invite);

  const orgName = orgFarms.docs[0]?.data()?.name ?? (await db.doc(`orgs/${orgId}`).get()).data()?.name ?? "the farm";
  try {
    const { subject, html } = inviteEmail(
      orgName,
      role.replace(/_/g, " "),
      `${APP_BASE_URL}/invite/${token}`,
      welcomeMessage,
    );
    await sendEmail(email, subject, html);
  } catch (err) {
    logger.warn("invite email failed", err);
  }

  logger.info("invite created", { orgId, email, role, farms: assigned.length });
  return { token };
});

/**
 * Public: fetch an invite's display data by token (org, role, farms,
 * permissions) so the accept page can show it before the user signs in. Never
 * exposes anything an unauthenticated caller shouldn't see beyond the invite
 * itself, which is gated by the unguessable token.
 */
export const getInvite = onCall({ region: REGION }, async (req) => {
  const token = String(req.data?.token ?? "");
  if (!token) throw new HttpsError("invalid-argument", "Missing token.");

  const found = await db.collectionGroup("invites").where("token", "==", token).limit(1).get();
  if (found.empty) throw new HttpsError("not-found", "Invitation not found.");
  const inv = found.docs[0].data();

  if (inv.status !== "pending" || (inv.expiresAt && Date.parse(inv.expiresAt) < Date.now())) {
    throw new HttpsError("failed-precondition", "This invitation has expired.");
  }

  const org = (await db.doc(`orgs/${inv.orgId}`).get()).data();
  const farmNames: { id: string; name: string; nameAr: string }[] = [];
  for (const farmId of inv.farmIds as string[]) {
    const f = (await db.doc(`farms/${farmId}`).get()).data();
    farmNames.push({ id: farmId, name: f?.name ?? farmId, nameAr: f?.nameAr ?? f?.name ?? farmId });
  }

  return {
    email: inv.email,
    orgName: org?.name ?? "the organization",
    orgNameAr: org?.nameAr ?? org?.name ?? "",
    role: inv.role,
    permissions: permissionsForRole(inv.role),
    farms: farmNames,
    welcomeMessage: inv.welcomeMessage ?? null,
    invitedByName: inv.invitedByName ?? null,
    expiresAt: inv.expiresAt ?? null,
  };
});

/**
 * Accept an invite: the authenticated user (whose email must match) is written
 * as a member of every assigned farm with the role's permissions, mapped into
 * the org, and the invite is consumed. Admin-privileged because the invitee
 * isn't a member yet.
 */
export const acceptInvite = onCall({ region: REGION }, async (req) => {
  const uid = req.auth?.uid;
  const email = (req.auth?.token?.email ?? "").toLowerCase();
  if (!uid || !email) throw new HttpsError("unauthenticated", "Sign in first.");

  const token = String(req.data?.token ?? "");
  if (!token) throw new HttpsError("invalid-argument", "Missing token.");

  const found = await db.collectionGroup("invites").where("token", "==", token).limit(1).get();
  if (found.empty) throw new HttpsError("not-found", "Invitation not found.");
  const ref = found.docs[0].ref;
  const inv = found.docs[0].data();

  if (inv.status !== "pending" || (inv.expiresAt && Date.parse(inv.expiresAt) < Date.now())) {
    throw new HttpsError("failed-precondition", "This invitation has expired.");
  }
  if (String(inv.email).toLowerCase() !== email) {
    throw new HttpsError(
      "permission-denied",
      "This invitation was sent to a different email. Sign in with that address.",
    );
  }

  const perms = permissionsForRole(inv.role);
  const nowIso = new Date().toISOString();
  const farmIds: string[] = inv.farmIds ?? [];

  const batch = db.batch();
  for (const farmId of farmIds) {
    batch.set(
      db.doc(`farms/${farmId}/members/${uid}`),
      {
        email,
        orgId: inv.orgId,
        role: inv.role,
        name: req.auth?.token?.name ?? email.split("@")[0],
        permissions: perms,
        grantedAt: nowIso,
      },
      { merge: true },
    );
  }
  // Map the user into the org and add the farms (union so a second invite adds).
  batch.set(
    db.doc(`users/${uid}`),
    {
      orgId: inv.orgId,
      farmIds: FieldValue.arrayUnion(...farmIds),
      defaultFarmId: farmIds[0],
      role: inv.role,
    },
    { merge: true },
  );
  batch.delete(ref);
  await batch.commit();

  logger.info("invite accepted", { uid, orgId: inv.orgId, farms: farmIds.length });
  return { orgId: inv.orgId, farmIds };
});
