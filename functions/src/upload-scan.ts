import { onObjectFinalized } from "firebase-functions/v2/storage";
import * as logger from "firebase-functions/logger";
import { getStorage } from "firebase-admin/storage";

import { REGION, writeAlerts } from "./shared";
import { HEAD_BYTES, isDangerous } from "./upload-scan-magic";

/**
 * Content-type is client-asserted.
 *
 * storage.rules checks the *declared* `contentType`, which the uploader controls
 * — so any payload can be sent up as `image/png`. This trigger reads the first
 * bytes of every finalized upload and, if they are the signature of an
 * executable, script, or archive masquerading as media, deletes the object and
 * raises an alert. It is a denylist of clearly-dangerous content rather than an
 * allowlist of every valid media format, so a legitimate but unusual image can
 * never be deleted by mistake — the cost of a false negative (an odd file slips
 * through) is far lower than a false positive (a real photo vanishes).
 *
 * This is defence in depth behind the permission model (only write-capable roles
 * can upload at all); it is not a full antivirus scan.
 */

export const scanUpload = onObjectFinalized(
  { region: REGION, memory: "256MiB" },
  async (event) => {
    const { bucket, name, contentType } = event.data;
    // Only police the app's own tree; ignore anything else in the bucket.
    if (!name || !name.startsWith("farms/")) return;

    const file = getStorage().bucket(bucket).file(name);

    // Read only the header — never pull a whole (possibly large) upload.
    let head: Buffer;
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of file.createReadStream({ start: 0, end: HEAD_BYTES - 1 })) {
        chunks.push(chunk as Buffer);
      }
      head = Buffer.concat(chunks);
    } catch (err) {
      // Already gone, or unreadable — nothing to police.
      logger.debug("upload-scan: could not read header", { name, err });
      return;
    }

    if (!isDangerous(head)) return;

    const hex = head.subarray(0, 8).toString("hex");
    logger.warn("Deleted a disguised non-media upload", { bucket, name, contentType, head: hex });
    await file.delete().catch((err) => logger.error("upload-scan: delete failed", { name, err }));

    // Surface it. The path is farms/{farmId}/animals/{animalId}/{file}; pull the
    // farmId so the alert lands on the right tenant.
    const farmId = name.split("/")[1];
    if (farmId) {
      await writeAlerts(farmId, [
        {
          id: `upload_rejected_${name.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 120)}`,
          kind: "upload_rejected",
          severity: "warning",
          title: "A non-media file upload was blocked",
          titleAr: "تم حظر رفع ملف غير وسائطي",
          body:
            `An upload declared as ${contentType ?? "media"} was actually a program or ` +
            `archive (signature ${hex}). It was removed automatically.`,
          bodyAr:
            `ملف مرفوع باسم ${contentType ?? "وسائط"} تبيّن أنه برنامج أو أرشيف ` +
            `(التوقيع ${hex}). تمت إزالته تلقائيًا.`,
          href: "/settings",
        },
      ]).catch(() => {});
    }
  },
);
