"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { motion } from "framer-motion";
import {
  Bell,
  Building2,
  Check,
  CloudDownload,
  CreditCard,
  Database,
  Globe,
  Monitor,
  Moon,
  Palette,
  Plug,
  Shield,
  Sun,
  Upload,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader, gridStagger, cardIn } from "@/components/common/page-header";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label, Separator, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/primitives";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/menu";
import { useI18n } from "@/lib/i18n/provider";
import { useFarm } from "@/hooks/use-farm-data";
import { downloadJson } from "@/lib/export";
import { getDataset } from "@/core/data/seed";
import { TeamManager } from "@/components/settings/team-manager";
import { BillingSettings } from "@/components/settings/billing-settings";
import { OrganisationSettings } from "@/components/settings/organisation-settings";
import { NotificationPreferences } from "@/components/settings/notification-preferences";
import { DesktopSettings } from "@/components/settings/desktop-settings";
import { IS_DESKTOP } from "@/lib/platform";
import { cn } from "@/lib/utils";
import {
  ASSIGNABLE_ROLES,
  ROLE_META,
  ROLE_PERMISSIONS,
  PERMISSION_LABELS,
  expandPermissions,
} from "@/core/auth/permissions";

const INTEGRATIONS = [
  { name: "DeLaval milking parlor API", status: "connected", detail: "Polls tank + per-cow yield every 5 min" },
  { name: "OpenWeather", status: "connected", detail: "THI + 7-day heat-stress forecast" },
  { name: "Allflex RFID readers", status: "connected", detail: "4 handheld, 2 race antennas" },
  { name: "Tru-Test smart scale", status: "connected", detail: "Auto-writes weights to the animal record" },
  { name: "Twilio SMS", status: "pending", detail: "Critical alerts to supervisor phones" },
  { name: "CCTV (Hikvision NVR)", status: "pending", detail: "Calving pen live view" },
];

export default function SettingsPage() {
  const { t, locale, setLocale, formatNumber } = useI18n();
  const ar = locale === "ar";
  const { theme, setTheme } = useTheme();
  const { data: farm } = useFarm();

  const [tab, setTab] = React.useState("farm");

  // The trial banner / paywall link to /settings#billing — honour the hash.
  React.useEffect(() => {
    if (window.location.hash === "#billing") setTab("billing");
  }, []);

  return (
    <>
      <PageHeader title={t("settings.title")} subtitle={t("settings.subtitle")} />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4 flex w-full overflow-x-auto lg:w-auto">
          <TabsTrigger value="farm">
            <Building2 /> {t("settings.farm")}
          </TabsTrigger>
          <TabsTrigger value="billing">
            <CreditCard /> {ar ? "الفوترة" : "Billing"}
          </TabsTrigger>
          <TabsTrigger value="appearance">
            <Palette /> {t("settings.appearance")}
          </TabsTrigger>
          <TabsTrigger value="org">
            <Building2 className="size-3.5" /> {locale === "ar" ? "الفروع والعملات" : "Branches & currencies"}
          </TabsTrigger>
          <TabsTrigger value="team">
            <Users /> {t("settings.team")}
          </TabsTrigger>
          <TabsTrigger value="roles">
            <Shield /> {t("settings.roles")}
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell /> {t("settings.notificationPrefs")}
          </TabsTrigger>
          <TabsTrigger value="data">
            <Database /> {t("settings.data")}
          </TabsTrigger>
          <TabsTrigger value="integrations">
            <Plug /> {t("settings.integrations")}
          </TabsTrigger>
          {IS_DESKTOP && (
            <TabsTrigger value="desktop">
              <Monitor /> {ar ? "سطح المكتب" : "Desktop"}
            </TabsTrigger>
          )}
        </TabsList>

        {/* ---------------------------------- Farm -------------------------------- */}
        <TabsContent value="farm">
          <motion.div variants={gridStagger} initial="hidden" animate="show" className="grid gap-3 lg:grid-cols-2">
            <motion.div variants={cardIn}>
              <Card>
                <div className="px-5 pb-2 pt-4">
                  <CardTitle>{t("settings.farm")}</CardTitle>
                  <CardDescription>{t("settings.branding")}</CardDescription>
                </div>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>{t("settings.farmName")}</Label>
                    <Input defaultValue={locale === "ar" ? farm?.nameAr : farm?.name} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>{t("settings.country")}</Label>
                      <Input defaultValue={farm?.country} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t("settings.city")}</Label>
                      <Input defaultValue={farm?.city} />
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>{t("settings.timezone")}</Label>
                      <Input defaultValue={farm?.timezone} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t("settings.currency")}</Label>
                      <Select defaultValue={farm?.currency ?? "EGP"}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {["EGP", "SAR", "AED", "USD"].map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button onClick={() => toast.success(locale === "ar" ? "تم الحفظ" : "Saved")}>
                    {t("common.save")}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div variants={cardIn}>
              <Card>
                <div className="px-5 pb-2 pt-4">
                  <CardTitle>{t("settings.plan")}</CardTitle>
                  <CardDescription>SaaS tenancy</CardDescription>
                </div>
                <CardContent className="space-y-4">
                  <div className="rounded-xl border border-primary/25 bg-primary/[0.05] p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[15px] font-semibold capitalize">{farm?.plan}</p>
                        <p className="text-[12px] text-muted-foreground">
                          {t("settings.animalLimit")}: {formatNumber(farm?.animalLimit ?? 0)}
                        </p>
                      </div>
                      <Badge variant="default">{ar ? "نشط" : "Active"}</Badge>
                    </div>
                  </div>

                  <Button variant="outline" className="w-full" onClick={() => setTab("billing")}>
                    <CreditCard /> {ar ? "إدارة الاشتراك والفوترة" : "Manage subscription & billing"}
                  </Button>

                  <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                    {locale === "ar"
                      ? "كل البيانات معزولة على مستوى المزرعة عبر farmId في قواعد Firestore الأمنية."
                      : "All data is isolated per tenant by farmId in the Firestore security rules."}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        </TabsContent>

        {/* --------------------------------- Billing ------------------------------- */}
        <TabsContent value="billing">
          <motion.div variants={cardIn} initial="hidden" animate="show">
            <BillingSettings />
          </motion.div>
        </TabsContent>

        {/* ------------------------------- Appearance ------------------------------ */}
        <TabsContent value="appearance">
          <motion.div variants={gridStagger} initial="hidden" animate="show" className="grid gap-3 lg:grid-cols-2">
            <motion.div variants={cardIn}>
              <Card>
                <div className="px-5 pb-2 pt-4">
                  <CardTitle>{t("settings.theme")}</CardTitle>
                </div>
                <CardContent>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: "light", icon: Sun, label: t("settings.light") },
                      { key: "dark", icon: Moon, label: t("settings.dark") },
                      { key: "system", icon: Palette, label: t("settings.system") },
                    ].map((o) => (
                      <button
                        key={o.key}
                        onClick={() => setTheme(o.key)}
                        className={cn(
                          "flex flex-col items-center gap-2 rounded-xl border border-border p-4 transition hover:border-ring/40",
                          theme === o.key && "border-primary/50 bg-accent/50 ring-2 ring-primary/15",
                        )}
                      >
                        <o.icon className="size-5" />
                        <span className="text-[12px] font-medium">{o.label}</span>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div variants={cardIn}>
              <Card>
                <div className="px-5 pb-2 pt-4">
                  <CardTitle>{t("settings.language")}</CardTitle>
                  <CardDescription>RTL / LTR</CardDescription>
                </div>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { key: "en" as const, label: "English", sub: "Left to right" },
                      { key: "ar" as const, label: "العربية", sub: "من اليمين لليسار" },
                    ].map((o) => (
                      <button
                        key={o.key}
                        onClick={() => setLocale(o.key)}
                        className={cn(
                          "flex flex-col items-center gap-1 rounded-xl border border-border p-4 transition hover:border-ring/40",
                          locale === o.key && "border-primary/50 bg-accent/50 ring-2 ring-primary/15",
                        )}
                      >
                        <Globe className="size-5" />
                        <span className="text-[13px] font-medium">{o.label}</span>
                        <span className="text-[11px] text-muted-foreground">{o.sub}</span>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

          </motion.div>
        </TabsContent>

        {/* --------------------------------- Desktop ------------------------------- */}
        {IS_DESKTOP && (
          <TabsContent value="desktop">
            <DesktopSettings />
          </TabsContent>
        )}

        {/* -------------------------------- Branches ------------------------------- */}
        <TabsContent value="org">
          <OrganisationSettings />
        </TabsContent>

        <TabsContent value="team">
          <motion.div variants={cardIn} initial="hidden" animate="show">
            <TeamManager />
          </motion.div>
        </TabsContent>

        <TabsContent value="roles">
          <motion.div variants={cardIn} initial="hidden" animate="show">
            <Card>
              <div className="px-5 pb-2 pt-4">
                <CardTitle>{t("settings.roles")}</CardTitle>
                <CardDescription>
                  {locale === "ar"
                    ? "الصلاحيات تُطبَّق في قواعد Firestore وليس في الواجهة فقط."
                    : "Permissions are enforced in Firestore rules, not just in the UI."}
                </CardDescription>
              </div>
              <CardContent className="space-y-2">
                {ASSIGNABLE_ROLES.map((role) => {
                  const meta = ROLE_META[role];
                  const isOwner = role === "owner";
                  const perms = expandPermissions(ROLE_PERMISSIONS[role]);
                  return (
                    <div key={role} className="rounded-xl border border-border/70 p-3.5">
                      <div className="flex items-center gap-2">
                        <Users className="size-4 text-muted-foreground" />
                        <p className="text-[13.5px] font-medium">{locale === "ar" ? meta.ar : meta.en}</p>
                        {isOwner && (
                          <Badge variant="default">{locale === "ar" ? "صلاحية كاملة" : "full access"}</Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-[12px] text-muted-foreground">
                        {locale === "ar" ? meta.descriptionAr : meta.description}
                      </p>
                      {!isOwner && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {perms.map((p) => (
                            <span
                              key={p}
                              className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                            >
                              <Check className="size-3 text-emerald-600" />
                              {locale === "ar" ? PERMISSION_LABELS[p].ar : PERMISSION_LABELS[p].en}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* ------------------------------ Notifications ----------------------------- */}
        <TabsContent value="notifications">
          <motion.div variants={cardIn} initial="hidden" animate="show">
            <NotificationPreferences />
          </motion.div>
        </TabsContent>

        {/* ----------------------------------- Data --------------------------------- */}
        <TabsContent value="data">
          <motion.div variants={gridStagger} initial="hidden" animate="show" className="grid gap-3 lg:grid-cols-2">
            <motion.div variants={cardIn}>
              <Card>
                <div className="px-5 pb-2 pt-4">
                  <CardTitle>{t("settings.backup")}</CardTitle>
                  <CardDescription>
                    {locale === "ar" ? "نسخة كاملة بصيغة JSON" : "Full JSON snapshot"}
                  </CardDescription>
                </div>
                <CardContent className="space-y-2">
                  <Button
                    className="w-full"
                    onClick={() => {
                      downloadJson(`herd-backup-${new Date().toISOString().slice(0, 10)}.json`, getDataset());
                      toast.success(locale === "ar" ? "تم إنشاء النسخة" : "Backup created");
                    }}
                  >
                    <CloudDownload /> {t("settings.backupNow")}
                  </Button>
                  <Button variant="outline" className="w-full">
                    <Upload /> {t("settings.importData")}
                  </Button>
                  <p className="pt-1 text-[11.5px] leading-relaxed text-muted-foreground">
                    {locale === "ar"
                      ? "في الإنتاج: نسخ يومية تلقائية إلى Cloud Storage مع الاحتفاظ ٣٠ يومًا."
                      : "In production: nightly automated exports to Cloud Storage with 30-day retention."}
                  </p>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div variants={cardIn}>
              <Card className="border-destructive/30">
                <div className="px-5 pb-2 pt-4">
                  <CardTitle className="text-destructive">{t("settings.dangerZone")}</CardTitle>
                </div>
                <CardContent>
                  <p className="mb-3 text-[12.5px] leading-relaxed text-muted-foreground">
                    {locale === "ar"
                      ? "حذف بيانات المزرعة لا يمكن التراجع عنه ويتطلب تأكيدًا من المالك."
                      : "Deleting farm data is irreversible and requires owner confirmation."}
                  </p>
                  <Button variant="destructive" disabled>
                    {t("common.delete")}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        </TabsContent>

        {/* ------------------------------- Integrations ----------------------------- */}
        <TabsContent value="integrations">
          <motion.div variants={gridStagger} initial="hidden" animate="show" className="grid gap-3 sm:grid-cols-2">
            {INTEGRATIONS.map((i) => (
              <motion.div key={i.name} variants={cardIn}>
                <Card className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-medium">{i.name}</p>
                      <p className="mt-0.5 text-[11.5px] text-muted-foreground">{i.detail}</p>
                    </div>
                    <Badge variant={i.status === "connected" ? "success" : "warning"}>
                      {i.status}
                    </Badge>
                  </div>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </TabsContent>
      </Tabs>
    </>
  );
}
