import { logger } from "firebase-functions";

/**
 * Transactional email via Resend's HTTP API (no SDK — a single fetch).
 *
 * Config-gated: set RESEND_API_KEY and EMAIL_FROM (e.g. "Herd OS
 * <noreply@your-domain>") as function env vars/secrets. Without them, sends are
 * skipped (logged), so the functions deploy and run fine before email is wired.
 * Get a key at resend.com and verify your sending domain.
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM;

export function emailConfigured(): boolean {
  return Boolean(RESEND_API_KEY && EMAIL_FROM);
}

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!emailConfigured()) {
    logger.info("Email skipped (RESEND_API_KEY/EMAIL_FROM not set)", { to, subject });
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({ from: EMAIL_FROM, to, subject, html }),
    });
    if (!res.ok) {
      logger.error("Email send failed", { status: res.status, body: await res.text() });
      return false;
    }
    return true;
  } catch (err) {
    logger.error("Email send error", err);
    return false;
  }
}

/** Escape user-supplied text before it goes into email HTML. */
function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

/** Minimal branded wrapper — bilingual (EN + AR), inline-styled for email clients. */
function layout(bodyHtml: string): string {
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#12332a">
  <div style="font-size:18px;font-weight:700;color:#16654a;margin-bottom:16px">Herd OS</div>
  ${bodyHtml}
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" />
  <div style="font-size:12px;color:#9aa8a1">Herd OS — Buffalo Farm Management</div>
</div>`;
}

export function welcomeEmail(farmName: string): { subject: string; html: string } {
  const name = esc(farmName);
  return {
    subject: "Welcome to Herd OS · مرحبًا بك في Herd OS",
    html: layout(
      `<p style="font-size:15px">Your farm <b>${name}</b> is ready. Your 7-day free trial has started — download the desktop app to manage your herd, milk, health and finances.</p>
       <p style="font-size:15px" dir="rtl">مزرعتك <b>${name}</b> جاهزة. بدأت فترتك التجريبية المجانية لمدة 7 أيام — حمّل تطبيق سطح المكتب لإدارة قطيعك والحليب والصحة والحسابات.</p>`,
    ),
  };
}

export function inviteEmail(
  orgName: string,
  roleLabel: string,
  url: string,
  message?: string,
): { subject: string; html: string } {
  const org = esc(orgName);
  const role = esc(roleLabel);
  const note = message
    ? `<p style="font-size:14px;color:#4b5563;border-inline-start:3px solid #16654a;padding-inline-start:12px;margin:16px 0">${esc(message)}</p>`
    : "";
  const button = `<a href="${esc(url)}" style="display:inline-block;background:#16654a;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:600;font-size:14px">Accept invitation · قبول الدعوة</a>`;
  return {
    subject: `You've been invited to join ${orgName} on Herd OS`,
    html: layout(
      `<p style="font-size:15px"><b>${org}</b> has invited you to join their farm on Herd OS as <b>${role}</b>.</p>
       ${note}
       <p style="margin:20px 0">${button}</p>
       <p style="font-size:13px;color:#6b7280">Or paste this link into your browser:<br><span style="word-break:break-all">${esc(url)}</span></p>
       <p style="font-size:15px" dir="rtl"><b>${org}</b> دعتك للانضمام إلى مزرعتها على Herd OS بصفة <b>${role}</b>. اضغط الزر أعلاه لقبول الدعوة وإنشاء حسابك أو تسجيل الدخول.</p>`,
    ),
  };
}

export function trialEndingEmail(farmName: string, daysLeft: number): { subject: string; html: string } {
  const name = esc(farmName);
  return {
    subject: `Your Herd OS trial ends in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}`,
    html: layout(
      `<p style="font-size:15px">Your free trial for <b>${name}</b> ends in <b>${daysLeft} ${daysLeft === 1 ? "day" : "days"}</b>. Choose a plan to keep managing your farm without interruption — your data stays exactly as it is.</p>
       <p style="font-size:15px" dir="rtl">تنتهي فترتك التجريبية المجانية لمزرعة <b>${name}</b> خلال <b>${daysLeft} ${daysLeft === 1 ? "يوم" : "أيام"}</b>. اختر خطة لمواصلة إدارة مزرعتك دون انقطاع — بياناتك تبقى كما هي.</p>`,
    ),
  };
}
