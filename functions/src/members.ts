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
    claimed.push({ farmId: farmRef.id, role });
  }

  if (claimed.length) {
    logger.info("membership claimed", { uid, email, farms: claimed.map((c) => c.farmId) });
  }
  return { claimed };
});
