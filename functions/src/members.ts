import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { REGION, db } from "./shared";

/**
 * Turns a pending invite into a real membership on first sign-in.
 *
 * Firebase issues a uid only once someone signs in, so an owner can't create a
 * member document ahead of time — they invite by email instead. The first time
 * that email signs in, the client calls this, and it moves every matching
 * invite (across all farms, for the SaaS case) into a real `members/{uid}`
 * document, then clears the invite.
 *
 * Runs with admin privileges precisely so the invitee — who is not yet a member
 * and whom the security rules therefore grant nothing — can still be let in.
 * The gate is the invite: no invite, no membership, no exceptions.
 */
export const claimMembership = onCall({ region: REGION }, async (req) => {
  const uid = req.auth?.uid;
  const email = (req.auth?.token?.email ?? "").toLowerCase();
  if (!uid || !email) throw new HttpsError("unauthenticated", "Sign in first.");

  const invites = await db
    .collectionGroup("pendingMembers")
    .where("email", "==", email)
    .get();

  const claimed: { farmId: string; role: string }[] = [];

  for (const invite of invites.docs) {
    const farmRef = invite.ref.parent.parent; // farms/{farmId}
    if (!farmRef) continue;

    const role = invite.data().role as string;
    await farmRef.collection("members").doc(uid).set({
      email,
      role,
      name: req.auth?.token?.name ?? email.split("@")[0],
      permissions: role === "owner" ? ["*"] : [],
      grantedAt: new Date().toISOString(),
    });
    await invite.ref.delete();
    // Map the user to this farm so login resolves it (one farm per user in the
    // MVP; the last claimed wins if there were several).
    await db.doc(`users/${uid}`).set({ farmId: farmRef.id, role }, { merge: true });
    claimed.push({ farmId: farmRef.id, role });
  }

  if (claimed.length) {
    logger.info("membership claimed", { uid, email, farms: claimed.map((c) => c.farmId) });
  }
  return { claimed };
});

/**
 * Self-serve farm creation.
 *
 * The rules forbid clients from creating a `farms/{id}` document (a farm is a
 * tenant boundary, provisioned here). A signed-in user with no farm calls this
 * to create theirs: it writes the farm, makes them the owner, maps them in
 * `users/{uid}`, and seeds a few default pens so the map and animal placement
 * work out of the box. One farm per user — if they already have one, it's a
 * no-op that returns the existing id.
 */
export const createFarm = onCall({ region: REGION }, async (req) => {
  const uid = req.auth?.uid;
  const email = (req.auth?.token?.email ?? "").toLowerCase();
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");

  const existing = await db.doc(`users/${uid}`).get();
  if (existing.exists) {
    return { farmId: existing.data()!.farmId as string, existed: true };
  }

  const name = String(req.data?.name ?? "").trim().slice(0, 120);
  if (!name) throw new HttpsError("invalid-argument", "Farm name is required.");
  const nameAr = String(req.data?.nameAr ?? "").trim().slice(0, 120) || name;

  const farmId = `farm_${uid.slice(0, 10).toLowerCase()}`;
  const now = new Date().toISOString();

  const batch = db.batch();
  batch.set(db.doc(`farms/${farmId}`), {
    name,
    nameAr,
    country: "Egypt",
    city: "",
    timezone: "Africa/Cairo",
    currency: "EGP",
    plan: "starter",
    animalLimit: 1000,
    createdAt: now,
    ownerId: uid,
    coordinates: { lat: 30.04, lng: 31.24 },
    counts: { total: 0, lactating: 0, dry: 0, calves: 0, pregnant: 0, bulls: 0, healthy: 0, sick: 0 },
  });
  batch.set(db.doc(`farms/${farmId}/members/${uid}`), {
    email,
    role: "owner",
    name: req.auth?.token?.name ?? email.split("@")[0] ?? "Owner",
    permissions: ["*"],
    grantedAt: now,
  });
  batch.set(db.doc(`users/${uid}`), { farmId, role: "owner" });

  const pens = [
    { id: "pen_a1", name: "Pen A1", nameAr: "حظيرة أ1", kind: "pen", x: 8, y: 10, w: 26, h: 30 },
    { id: "pen_a2", name: "Pen A2", nameAr: "حظيرة أ2", kind: "pen", x: 40, y: 10, w: 26, h: 30 },
    { id: "calf_barn", name: "Calf Barn", nameAr: "حظيرة العجول", kind: "barn", x: 8, y: 46, w: 26, h: 26 },
    { id: "parlor", name: "Milking Parlor", nameAr: "صالة الحلابة", kind: "milking_parlor", x: 40, y: 46, w: 26, h: 26 },
    { id: "quarantine", name: "Quarantine", nameAr: "الحجر الصحي", kind: "quarantine", x: 72, y: 46, w: 20, h: 26 },
  ];
  for (const p of pens) {
    batch.set(db.doc(`farms/${farmId}/zones/${p.id}`), {
      farmId,
      ...p,
      capacity: 80,
      shadeCoverPct: 60,
      hasFans: true,
    });
  }

  await batch.commit();
  logger.info("farm created", { farmId, uid });
  return { farmId, existed: false };
});
