"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  Baby,
  Bell,
  BellOff,
  CheckCheck,
  Flame,
  HeartPulse,
  Mail,
  MessageSquare,
  Package,
  Smartphone,
  Wallet,
} from "lucide-react";

import { PageHeader, gridStagger, cardIn } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/primitives";
import { useI18n } from "@/lib/i18n/provider";
import { useAlerts, useMarkAlertRead } from "@/hooks/use-farm-data";
import { alertCounts } from "@/core/services/metrics";
import { cn } from "@/lib/utils";
import type { Alert, AlertChannel } from "@/core/domain/types";

const CATEGORY_ICON = {
  health: HeartPulse,
  breeding: Baby,
  milk: Bell,
  inventory: Package,
  weather: Flame,
  task: CheckCheck,
  finance: Wallet,
  system: AlertTriangle,
} as const;

const CHANNEL_ICON: Record<AlertChannel, typeof Mail> = {
  push: Smartphone,
  sms: MessageSquare,
  email: Mail,
  in_app: Bell,
};

export default function NotificationsPage() {
  const { t, locale, formatNumber } = useI18n();
  const { data: alerts = [] } = useAlerts();
  const markRead = useMarkAlertRead();
  const counts = alertCounts(alerts);

  const sorted = [...alerts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const render = (list: Alert[]) => (
    <div className="space-y-2">
      <AnimatePresence initial={false}>
        {list.map((a) => {
          const Icon = CATEGORY_ICON[a.category] ?? Bell;
          return (
            <motion.div
              key={a.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18 }}
            >
              <div
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-3.5 transition",
                  a.read ? "border-border/70 bg-card" : "border-primary/25 bg-primary/[0.04]",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                    a.severity === "critical"
                      ? "bg-destructive/12 text-destructive"
                      : a.severity === "warning"
                        ? "bg-[color-mix(in_oklab,var(--warning)_16%,transparent)] text-[var(--warning)]"
                        : "bg-[color-mix(in_oklab,var(--info)_14%,transparent)] text-[var(--info)]",
                  )}
                >
                  <Icon className="size-4" />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13.5px] font-medium">
                      {locale === "ar" ? a.titleAr : a.title}
                    </p>
                    {!a.read && <span className="size-1.5 rounded-full bg-primary" />}
                  </div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                    {locale === "ar" ? a.bodyAr : a.body}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="tabular text-[11px] text-muted-foreground">
                      {a.createdAt.slice(11, 16)} · {a.createdAt.slice(0, 10)}
                    </span>
                    {a.channels.map((c) => {
                      const CIcon = CHANNEL_ICON[c];
                      return (
                        <Badge key={c} variant="outline">
                          <CIcon />
                          {c === "in_app" ? t("nav.notifications") : t(`notifications.${c}` as never)}
                        </Badge>
                      );
                    })}
                  </div>
                </div>

                <div className="flex shrink-0 flex-col gap-1.5">
                  {a.href && (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={a.href}>{t("common.view")}</Link>
                    </Button>
                  )}
                  {!a.read && (
                    <Button variant="ghost" size="sm" onClick={() => markRead.mutate(a.id)}>
                      <CheckCheck />
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {!list.length && (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <BellOff className="size-5" />
          </span>
          <p className="text-[14px] font-medium">{t("notifications.empty")}</p>
          <p className="text-[12px] text-muted-foreground">{t("notifications.emptyHint")}</p>
        </div>
      )}
    </div>
  );

  return (
    <>
      <PageHeader
        title={t("notifications.title")}
        subtitle={t("notifications.subtitle")}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => alerts.filter((a) => !a.read).forEach((a) => markRead.mutate(a.id))}
            disabled={!counts.unread}
          >
            <CheckCheck /> {t("notifications.markAllRead")}
          </Button>
        }
      />

      <motion.div
        variants={gridStagger}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 gap-3 md:grid-cols-4"
      >
        <StatCard label={t("notifications.unread")} value={formatNumber(counts.unread)} icon={Bell} tone="info" />
        <StatCard
          label={t("status.critical")}
          value={formatNumber(counts.critical)}
          icon={AlertTriangle}
          tone={counts.critical ? "destructive" : "success"}
        />
        <StatCard label={t("status.medium")} value={formatNumber(counts.warning)} icon={Flame} tone="warning" />
        <StatCard label={t("common.total")} value={formatNumber(alerts.length)} icon={Bell} />
      </motion.div>

      <motion.div variants={cardIn} initial="hidden" animate="show" className="mt-4">
        <Card>
          <div className="px-5 pb-2 pt-4">
            <CardTitle>{t("notifications.title")}</CardTitle>
            <CardDescription>{t("notifications.channels")}</CardDescription>
          </div>
          <CardContent>
            <Tabs defaultValue="all">
              <TabsList className="mb-3">
                <TabsTrigger value="all">{t("common.all")}</TabsTrigger>
                <TabsTrigger value="unread">
                  {t("notifications.unread")}
                  {counts.unread > 0 && (
                    <Badge variant="destructive" className="ms-1">
                      {formatNumber(counts.unread)}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="critical">{t("status.critical")}</TabsTrigger>
              </TabsList>
              <TabsContent value="all">{render(sorted)}</TabsContent>
              <TabsContent value="unread">{render(sorted.filter((a) => !a.read))}</TabsContent>
              <TabsContent value="critical">
                {render(sorted.filter((a) => a.severity === "critical"))}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </motion.div>
    </>
  );
}
