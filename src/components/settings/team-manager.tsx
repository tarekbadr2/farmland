"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Clock, Loader2, Mail, Shield, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, Label } from "@/components/ui/primitives";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/menu";
import { useI18n } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth/provider";
import Link from "next/link";
import { useMembers, usePendingInvites, useFarm, qk } from "@/hooks/use-farm-data";
import { useBilling } from "@/hooks/use-billing";
import { getRepository, isFirebaseBackend } from "@/core/repositories";
import { createInvite } from "@/infrastructure/firebase/client";
import { formatDate } from "@/lib/date";
import type { Member, Role } from "@/core/domain/types";
import { ASSIGNABLE_ROLES, ROLE_META } from "@/core/auth/permissions";
import { cn } from "@/lib/utils";

// Roles offered in the pickers come from the RBAC catalog (owner + the 12
// predefined roles); legacy roles are excluded but still render if a member
// already holds one.
const ROLES = ASSIGNABLE_ROLES;

const inviteSchema = z.object({
  email: z.string().email("Enter a valid email"),
  role: z.string().min(1),
});
type InviteForm = z.infer<typeof inviteSchema>;

/**
 * Team management.
 *
 * The owner invites people by email and sets their role; everyone else sees a
 * read-only roster. Two invariants are enforced in the UI as a courtesy and in
 * the rules for real: only an owner can change the team, and the farm can never
 * lose its last owner — the control that would do either is disabled with a
 * reason rather than silently failing on save.
 */
export function TeamManager() {
  const { t, locale, formatNumber } = useI18n();
  const { user, bypassed } = useAuth();
  const queryClient = useQueryClient();
  const roleName = (role: Role) =>
    ROLE_META[role] ? (locale === "ar" ? ROLE_META[role].ar : ROLE_META[role].en) : role;

  const { data: members = [] } = useMembers();
  const { data: invites = [] } = usePendingInvites();

  // Seats: how many people the plan allows. Pending invites hold a seat too, so
  // a farm can't over-commit past its plan while invites are outstanding.
  const { entitlement } = useBilling();
  const seats = entitlement.plan.seats;
  const seatsUsed = members.length + invites.length;
  const seatsFull = seatsUsed >= seats;

  // In the demo there's no signed-in identity, so treat the viewer as owner to
  // keep the screen explorable; on Firebase this is the real role.
  const isOwner = bypassed || user?.role === "owner";
  const ownerCount = members.filter((m) => m.role === "owner").length;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: qk.members });
    queryClient.invalidateQueries({ queryKey: qk.pendingInvites });
  };

  const setRole = useMutation({
    mutationFn: ({ uid, role }: { uid: string; role: Role }) =>
      getRepository().setMemberRole(uid, role),
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (uid: string) => getRepository().removeMember(uid),
    onSuccess: () => {
      refresh();
      toast.success(locale === "ar" ? "تمت الإزالة" : "Access removed");
    },
    onError: (e) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: (email: string) => getRepository().revokeInvite(email),
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });

  // Assigned farms / expiry / welcome message live outside the RHF schema.
  const { data: farm } = useFarm();
  const farmOptions = React.useMemo(
    () => (farm ? [{ id: farm.id, name: locale === "ar" ? farm.nameAr : farm.name }] : []),
    [farm, locale],
  );
  const [selectedFarms, setSelectedFarms] = React.useState<string[]>([]);
  const [expiry, setExpiry] = React.useState<"24h" | "7d" | "30d">("7d");
  const [message, setMessage] = React.useState("");
  React.useEffect(() => {
    // Default to all of the org's farms selected.
    setSelectedFarms(farmOptions.map((f) => f.id));
  }, [farmOptions]);
  const toggleFarm = (id: string) =>
    setSelectedFarms((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const invite = useMutation({
    mutationFn: async (v: InviteForm) => {
      if (seatsFull) {
        throw new Error(
          locale === "ar"
            ? `خطتك تسمح بـ ${seats} مقعدًا. رقِّ الخطة لإضافة المزيد.`
            : `Your plan allows ${seats} seats. Upgrade to add more.`,
        );
      }
      const farmIds = selectedFarms.length ? selectedFarms : farmOptions.map((f) => f.id);
      if (isFirebaseBackend()) {
        await createInvite({
          email: v.email,
          role: v.role,
          farmIds,
          expiry,
          welcomeMessage: message || undefined,
        });
      } else {
        // Demo build: no callable backend — record a pending invite so the UI
        // flow is explorable.
        await getRepository().inviteMember(v.email, v.role as Role);
      }
    },
    onSuccess: () => {
      refresh();
      toast.success(locale === "ar" ? "تم إرسال الدعوة" : "Invitation sent");
      form.reset({ email: "", role: "farm_worker" });
      setMessage("");
    },
    onError: (e) => toast.error(e.message),
  });

  const form = useForm<InviteForm>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", role: "farm_worker" },
  });

  const initials = (m: Member) =>
    (m.name ?? m.email).split(/[ .@]/).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");

  // Demoting or removing the sole owner would orphan the farm.
  const isLastOwner = (m: Member) => m.role === "owner" && ownerCount <= 1;

  return (
    <div className="space-y-3">
      <Card>
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <div>
            <CardTitle>{t("settings.team")}</CardTitle>
            <CardDescription>{t("settings.teamHint")}</CardDescription>
          </div>
          <Badge variant="outline">
            {formatNumber(members.length)}
            {invites.length > 0 && ` · ${formatNumber(invites.length)} ${locale === "ar" ? "معلّقة" : "pending"}`}
          </Badge>
        </div>

        <CardContent className="space-y-2">
          {bypassed && (
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-[11.5px] text-muted-foreground">
              {t("settings.demoTeamNote")}
            </p>
          )}

          {members.map((m) => {
            const isYou = !bypassed && m.id === user?.uid;
            const locked = !isOwner || isLastOwner(m);
            return (
              <div
                key={m.id}
                className="flex items-center gap-3 rounded-xl border border-border/70 p-2.5"
              >
                <Avatar className="size-9">
                  <AvatarFallback className="bg-primary/10 text-[12px] font-medium text-primary">
                    {initials(m)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-[13.5px] font-medium">
                    {m.name ?? m.email.split("@")[0]}
                    {isYou && (
                      <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                        {t("settings.you")}
                      </Badge>
                    )}
                  </p>
                  <p className="truncate text-[11.5px] text-muted-foreground">{m.email}</p>
                </div>

                <Select
                  value={m.role}
                  disabled={locked || setRole.isPending}
                  onValueChange={(v) => setRole.mutate({ uid: m.id, role: v as Role })}
                >
                  <SelectTrigger size="sm" className="w-[130px] capitalize">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r} className="capitalize">
                        {roleName(r)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9 shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={locked || isYou || remove.isPending}
                  title={isLastOwner(m) ? t("settings.lastOwner") : t("settings.removeMember")}
                  aria-label={t("settings.removeMember")}
                  onClick={() => {
                    if (confirm(t("settings.removeMemberConfirm"))) remove.mutate(m.id);
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            );
          })}

          {!isOwner && !bypassed && (
            <p className="flex items-center gap-1.5 pt-1 text-[11.5px] text-muted-foreground">
              <Shield className="size-3.5" /> {t("settings.ownerOnlyTeam")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Pending invites */}
      {invites.length > 0 && (
        <Card>
          <div className="px-5 pb-2 pt-4">
            <CardTitle className="text-[14px]">{t("settings.pendingInvites")}</CardTitle>
          </div>
          <CardContent className="space-y-2">
            {invites.map((inv) => (
              <div
                key={inv.token ?? inv.email}
                className="flex items-center gap-3 rounded-xl border border-dashed border-border p-2.5"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                  <Clock className="size-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{inv.email}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {t("settings.awaitingSignIn")}
                    {inv.expiresAt
                      ? ` · ${locale === "ar" ? "تنتهي" : "expires"} ${formatDate(inv.expiresAt, locale)}`
                      : inv.invitedAt
                        ? ` · ${formatDate(inv.invitedAt, locale)}`
                        : ""}
                  </p>
                </div>
                <Badge variant="outline" className="capitalize">
                  {roleName(inv.role)}
                </Badge>
                {isOwner && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate(inv.token ?? inv.email)}
                  >
                    {t("settings.revoke")}
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Invite form */}
      {isOwner && (
        <Card>
          <div className="flex items-center justify-between px-5 pb-2 pt-4">
            <CardTitle className="flex items-center gap-2 text-[14px]">
              <UserPlus className="size-4" /> {t("settings.inviteMember")}
            </CardTitle>
            <span
              className={cn(
                "tabular rounded-full px-2 py-0.5 text-[11px] font-medium",
                seatsFull ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
              )}
            >
              {locale === "ar"
                ? `${formatNumber(seatsUsed)} / ${formatNumber(seats)} مقعد`
                : `${formatNumber(seatsUsed)} / ${formatNumber(seats)} seats`}
            </span>
          </div>
          <CardContent>
            {seatsFull && (
              <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/[0.06] px-3 py-2 text-[12.5px]">
                <span>
                  {locale === "ar"
                    ? "لقد وصلت إلى حد المقاعد في خطتك."
                    : "You've reached your plan's seat limit."}
                </span>
                <Link href="/billing" className="shrink-0 font-medium text-primary hover:underline">
                  {locale === "ar" ? "ترقية" : "Upgrade"}
                </Link>
              </div>
            )}
            <form
              onSubmit={form.handleSubmit((v) => invite.mutate(v))}
              className="space-y-3"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="invite-email">{t("settings.inviteEmail")}</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="invite-email"
                      type="email"
                      dir="ltr"
                      placeholder="name@example.com"
                      className="ps-9"
                      {...form.register("email")}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="invite-role">{t("settings.inviteRole")}</Label>
                  <Select
                    value={form.watch("role")}
                    onValueChange={(v) => form.setValue("role", v as Role)}
                  >
                    <SelectTrigger id="invite-role" size="sm" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {roleName(r)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Assigned farms — the invitee only sees these. */}
              <div className="space-y-1.5">
                <Label>{locale === "ar" ? "المزارع المخصصة" : "Assigned farms"}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {farmOptions.map((f) => {
                    const on = selectedFarms.includes(f.id);
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => toggleFarm(f.id)}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[12px] font-medium transition",
                          on
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border text-muted-foreground hover:border-ring/40",
                        )}
                      >
                        {f.name}
                      </button>
                    );
                  })}
                  {farmOptions.length === 0 && (
                    <span className="text-[12px] text-muted-foreground">
                      {locale === "ar" ? "لا توجد مزارع" : "No farms yet"}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="invite-expiry">{locale === "ar" ? "انتهاء الصلاحية" : "Invitation expires"}</Label>
                  <Select value={expiry} onValueChange={(v) => setExpiry(v as typeof expiry)}>
                    <SelectTrigger id="invite-expiry" size="sm" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="24h">{locale === "ar" ? "24 ساعة" : "24 hours"}</SelectItem>
                      <SelectItem value="7d">{locale === "ar" ? "7 أيام" : "7 days"}</SelectItem>
                      <SelectItem value="30d">{locale === "ar" ? "30 يومًا" : "30 days"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="invite-message">{locale === "ar" ? "رسالة ترحيب (اختياري)" : "Welcome message (optional)"}</Label>
                <Textarea
                  id="invite-message"
                  rows={2}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={
                    locale === "ar" ? "مرحبًا بك في الفريق…" : "Welcome to the team…"
                  }
                />
              </div>

              <Button type="submit" disabled={invite.isPending || seatsFull}>
                {invite.isPending ? <Loader2 className="animate-spin" /> : <Mail />}
                {t("settings.sendInvite")}
              </Button>
            </form>
            {form.formState.errors.email && (
              <p className="mt-1.5 text-[11px] text-destructive">
                {form.formState.errors.email.message}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
