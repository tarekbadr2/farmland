"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { Building2, Check, Loader2, Lock, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/primitives";
import { Logo } from "@/components/shell/logo";
import { useAuth } from "@/lib/auth/provider";
import { useI18n } from "@/lib/i18n/provider";
import { isFirebaseBackend } from "@/core/repositories";
import { getInvite, acceptInvite, type InviteView } from "@/infrastructure/firebase/client";
import {
  ROLE_META,
  PERMISSION_LABELS,
  expandPermissions,
  permissionsForRole,
  type PermissionKey,
  type RoleKey,
} from "@/core/auth/permissions";
import { cn } from "@/lib/utils";

// Permissions we explicitly call out as withheld, when a role doesn't grant them.
const NOTABLE_DENIED: PermissionKey[] = [
  "payroll.read",
  "accounting.write",
  "employees.manage",
  "org.settings",
  "animals.delete",
];

// Shown in the demo build (no backend) so the page is viewable end-to-end.
const DEMO_INVITE: InviteView = {
  email: "vet@example.com",
  orgName: "Green Valley Farms",
  orgNameAr: "مزارع الوادي الأخضر",
  role: "veterinarian",
  permissions: [...permissionsForRole("veterinarian")],
  farms: [
    { id: "f1", name: "Main Farm", nameAr: "المزرعة الرئيسية" },
    { id: "f2", name: "Dairy Farm", nameAr: "مزرعة الألبان" },
  ],
  welcomeMessage: "Welcome aboard — glad to have you on the team!",
  invitedByName: "Farm Owner",
  expiresAt: null,
};

export default function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { locale } = useI18n();
  const ar = locale === "ar";
  const { user, bypassed, signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();

  const [invite, setInvite] = React.useState<InviteView | null>(null);
  const [loadErr, setLoadErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [joining, setJoining] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      if (!isFirebaseBackend()) {
        // Demo build: no callable backend — render a representative invite.
        if (alive) {
          setInvite(DEMO_INVITE);
          setLoading(false);
        }
        return;
      }
      try {
        const data = await getInvite(token);
        if (alive) setInvite(data);
      } catch (e) {
        if (alive) setLoadErr((e as Error).message || "Invitation not found or expired.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  const join = React.useCallback(async () => {
    if (bypassed) {
      router.push("/dashboard");
      return;
    }
    setJoining(true);
    try {
      await acceptInvite(token);
      toast.success(ar ? "تم الانضمام بنجاح" : "You're in!");
      router.push("/dashboard");
    } catch (e) {
      toast.error((e as Error).message || (ar ? "تعذّر قبول الدعوة" : "Couldn't accept the invite"));
      setJoining(false);
    }
  }, [bypassed, token, router, ar]);

  if (loading) {
    return (
      <Centered>
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </Centered>
    );
  }

  if (loadErr || !invite) {
    return (
      <Centered>
        <div className="text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-destructive/10">
            <Lock className="size-5 text-destructive" />
          </div>
          <p className="text-[15px] font-semibold">{ar ? "دعوة غير صالحة" : "Invitation unavailable"}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {ar
              ? "انتهت صلاحية هذه الدعوة أو لم تعد موجودة. اطلب من المالك إرسال واحدة جديدة."
              : "This invitation has expired or no longer exists. Ask the owner to send a new one."}
          </p>
        </div>
      </Centered>
    );
  }

  const orgName = ar && invite.orgNameAr ? invite.orgNameAr : invite.orgName;
  const roleMeta = ROLE_META[invite.role as RoleKey];
  const roleLabel = roleMeta ? (ar ? roleMeta.ar : roleMeta.en) : invite.role;
  const granted = expandPermissions(invite.permissions);
  const grantedSet = new Set<string>(granted);
  const denied = NOTABLE_DENIED.filter((k) => !grantedSet.has(k));

  const signedInMatches =
    !!user && user.email.toLowerCase() === invite.email.toLowerCase();
  const signedInMismatch = !!user && !signedInMatches;

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/40 to-background px-4 py-10">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          {/* Header */}
          <div className="border-b border-border bg-muted/30 px-6 py-6 text-center">
            <p className="text-[13px] text-muted-foreground">
              {ar ? "لقد تمت دعوتك للانضمام إلى" : "You've been invited to join"}
            </p>
            <h1 className="mt-1 text-[22px] font-bold">{orgName}</h1>
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[13px] font-semibold text-primary">
              <ShieldCheck className="size-3.5" />
              {roleLabel}
            </div>
          </div>

          <div className="space-y-5 px-6 py-5">
            {invite.welcomeMessage && (
              <p className="rounded-lg border-s-2 border-primary bg-muted/40 px-3 py-2 text-[13px] italic text-muted-foreground">
                “{invite.welcomeMessage}”
              </p>
            )}

            {/* Farm access */}
            <Section title={ar ? "الوصول للمزارع" : "Farm access"}>
              <ul className="space-y-1.5">
                {invite.farms.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 text-[13.5px]">
                    <Building2 className="size-4 text-muted-foreground" />
                    <Check className="size-4 text-emerald-600" />
                    {ar ? f.nameAr : f.name}
                  </li>
                ))}
              </ul>
            </Section>

            {/* Permissions */}
            <Section title={ar ? "الصلاحيات" : "Permissions"}>
              <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {granted.map((k) => (
                  <li key={k} className="flex items-center gap-2 text-[13px]">
                    <Check className="size-4 shrink-0 text-emerald-600" />
                    <span>{ar ? PERMISSION_LABELS[k].ar : PERMISSION_LABELS[k].en}</span>
                  </li>
                ))}
              </ul>
              {denied.length > 0 && (
                <ul className="mt-3 grid grid-cols-1 gap-1.5 border-t border-border pt-3 sm:grid-cols-2">
                  {denied.map((k) => (
                    <li key={k} className="flex items-center gap-2 text-[13px] text-muted-foreground">
                      <X className="size-4 shrink-0 text-destructive/70" />
                      <span>{ar ? PERMISSION_LABELS[k].ar : PERMISSION_LABELS[k].en}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {/* Auth / accept */}
            <div className="border-t border-border pt-5">
              {signedInMismatch ? (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
                  {ar
                    ? `هذه الدعوة مُرسلة إلى ${invite.email}. سجّل الدخول بهذا البريد لقبولها.`
                    : `This invite was sent to ${invite.email}. Sign in with that address to accept.`}
                </p>
              ) : signedInMatches || bypassed ? (
                <Button className="w-full" onClick={join} disabled={joining}>
                  {joining ? <Loader2 className="animate-spin" /> : <Check />}
                  {ar ? "قبول الدعوة والانضمام" : "Accept & join"}
                </Button>
              ) : (
                <AuthPanel
                  email={invite.email}
                  onGoogle={async () => {
                    try {
                      await signInWithGoogle();
                      await join();
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                  onEmail={async (mode, email, password) => {
                    try {
                      if (mode === "signup") await signUpWithEmail(email, password);
                      else await signInWithEmail(email, password);
                      await join();
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                />
              )}
            </div>
          </div>
        </div>

        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          {ar ? "مدعوم بواسطة Herd OS" : "Powered by Herd OS"}
        </p>
      </div>
    </div>
  );
}

function AuthPanel({
  email,
  onGoogle,
  onEmail,
}: {
  email: string;
  onGoogle: () => void;
  onEmail: (mode: "signup" | "login", email: string, password: string) => void;
}) {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const [mode, setMode] = React.useState<"signup" | "login">("signup");
  const [pw, setPw] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await onEmail(mode, email, pw);
    setBusy(false);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/60 p-1 text-[13px] font-medium">
        {(["signup", "login"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "rounded-md py-1.5 transition",
              mode === m ? "bg-background shadow-xs" : "text-muted-foreground",
            )}
          >
            {m === "signup"
              ? ar ? "إنشاء حساب" : "Create account"
              : ar ? "تسجيل الدخول" : "Login"}
          </button>
        ))}
      </div>

      <Button type="button" variant="outline" className="w-full" onClick={onGoogle}>
        {ar ? "المتابعة عبر Google" : "Continue with Google"}
      </Button>

      <div className="relative text-center">
        <span className="relative z-10 bg-card px-2 text-[11px] text-muted-foreground">
          {ar ? "أو بالبريد الإلكتروني" : "or with email"}
        </span>
        <span className="absolute inset-x-0 top-1/2 h-px bg-border" />
      </div>

      <form onSubmit={submit} className="space-y-2.5">
        <div className="space-y-1">
          <Label className="text-[12px]">{ar ? "البريد الإلكتروني" : "Email"}</Label>
          <Input value={email} readOnly dir="ltr" className="bg-muted/40" />
        </div>
        <div className="space-y-1">
          <Label className="text-[12px]">{ar ? "كلمة المرور" : "Password"}</Label>
          <Input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            dir="ltr"
            placeholder="••••••••"
            minLength={6}
            required
          />
        </div>
        <Button type="submit" className="w-full" disabled={busy || pw.length < 6}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          {mode === "signup"
            ? ar ? "إنشاء الحساب والانضمام" : "Create account & join"
            : ar ? "تسجيل الدخول والانضمام" : "Login & join"}
        </Button>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center px-4">{children}</div>;
}
