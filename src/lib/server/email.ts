import "server-only";

/**
 * Transactional email for the Next API routes (mirrors functions/src/email.ts).
 * Resend over plain fetch — no SDK. Config-gated on RESEND_API_KEY + EMAIL_FROM;
 * a no-op (logged) when unset, so routes work before email is wired.
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM;

export function emailConfigured(): boolean {
  return Boolean(RESEND_API_KEY && EMAIL_FROM);
}

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!emailConfigured()) {
    console.info("[email] skipped (RESEND_API_KEY/EMAIL_FROM not set):", subject);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({ from: EMAIL_FROM, to, subject, html }),
    });
    if (!res.ok) {
      console.error("[email] send failed", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] send error", err);
    return false;
  }
}

/** A payment receipt for a subscription charge. `amountEgp` is in whole pounds. */
export function receiptEmail(planName: string, amountEgp: number, reference: string): { subject: string; html: string } {
  const amount = amountEgp.toLocaleString("en-US");
  return {
    subject: "Herd OS — payment received · تم استلام الدفعة",
    html: `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#12332a">
  <div style="font-size:18px;font-weight:700;color:#16654a;margin-bottom:16px">Herd OS</div>
  <p style="font-size:15px">Thank you — we've received your payment.</p>
  <table style="width:100%;font-size:14px;border-collapse:collapse;margin:12px 0">
    <tr><td style="padding:6px 0;color:#6b7b74">Plan</td><td style="padding:6px 0;text-align:right;font-weight:600">${planName}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7b74">Amount</td><td style="padding:6px 0;text-align:right;font-weight:600">EGP ${amount}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7b74">Reference</td><td style="padding:6px 0;text-align:right">${reference}</td></tr>
  </table>
  <p style="font-size:15px" dir="rtl">شكرًا لك — لقد استلمنا دفعتك. تفاصيل الاشتراك أعلاه.</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" />
  <div style="font-size:12px;color:#9aa8a1">Herd OS — Buffalo Farm Management</div>
</div>`,
  };
}
