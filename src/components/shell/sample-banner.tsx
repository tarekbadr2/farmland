"use client";

/**
 * Sample-data banner.
 *
 * While a farm still holds tutorial data (`farm.isSample`) this strip sits under
 * the topbar: it replays the tour and, when the owner is ready, wipes the sample
 * herd so they can start entering their own. It also auto-starts the tour once
 * per farm (first entry after onboarding).
 */

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useFarm } from "@/hooks/use-farm-data";
import { useI18n } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth/provider";
import { useTour } from "@/components/shell/tour";
import { clearFarmData } from "@/core/data/sample";

export function SampleFarmBanner() {
  const { data: farm } = useFarm();
  const { locale } = useI18n();
  const { bypassed } = useAuth();
  const { start, active } = useTour();
  const queryClient = useQueryClient();
  const ar = locale === "ar";

  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [clearing, setClearing] = React.useState(false);
  const startedRef = React.useRef(false);

  const isSample = !bypassed && !!farm?.isSample;
  const farmId = farm?.id;

  // Auto-run the tour once per farm, the first time the owner lands on a fresh
  // sample farm. `startedRef` guards against re-firing within the session.
  React.useEffect(() => {
    if (!isSample || !farmId || startedRef.current) return;
    const key = `herdos.tour.${farmId}`;
    if (window.localStorage.getItem(key)) return;
    startedRef.current = true;
    window.localStorage.setItem(key, "1");
    const id = window.setTimeout(() => start(), 600); // let the shell settle first
    return () => window.clearTimeout(id);
  }, [isSample, farmId, start]);

  if (!isSample || !farmId) return null;

  const clear = async () => {
    setClearing(true);
    try {
      await clearFarmData(farmId);
      await queryClient.invalidateQueries();
      setConfirmOpen(false);
      toast.success(ar ? "تم مسح البيانات التجريبية. مزرعتك جاهزة الآن." : "Sample data cleared. Your farm is ready.");
    } catch {
      toast.error(ar ? "تعذّر مسح البيانات. حاول مرة أخرى." : "Couldn't clear the data. Try again.");
    } finally {
      setClearing(false);
    }
  };

  return (
    <div
      data-tour="sample-banner"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-primary/20 bg-primary/[0.06] px-4 py-2.5 sm:px-6"
      dir={ar ? "rtl" : "ltr"}
    >
      <Sparkles className="size-4 shrink-0 text-primary" />
      <p className="text-[13px] font-medium">
        {ar ? "أنت تستكشف بيانات تجريبية" : "You're exploring sample data"}
        <span className="ms-2 font-normal text-muted-foreground">
          {ar
            ? "— جرّب النظام بحرية، ثم امسحها وأضف قطيعك الحقيقي."
            : "— explore freely, then clear it and add your real herd."}
        </span>
      </p>

      <div className="ms-auto flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={start} disabled={active}>
          <Wand2 className="size-3.5" />
          {ar ? "خذ الجولة" : "Take the tour"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setConfirmOpen(true)}>
          <Trash2 className="size-3.5" />
          {ar ? "امسح وأضف قطيعي" : "Clear & add my herd"}
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={(o) => !clearing && setConfirmOpen(o)}>
        <DialogContent showClose={!clearing}>
          <DialogHeader>
            <DialogTitle>{ar ? "مسح البيانات التجريبية؟" : "Clear sample data?"}</DialogTitle>
            <DialogDescription>
              {ar
                ? "سيؤدي هذا إلى حذف جميع الحيوانات والسجلات التجريبية نهائيًا وإعادة المزرعة إلى حالة فارغة بحظائر افتراضية. لا يمكن التراجع."
                : "This permanently deletes all sample animals and records and resets the farm to empty with default pens. This can't be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={clearing}>
              {ar ? "إلغاء" : "Cancel"}
            </Button>
            <Button variant="destructive" onClick={clear} disabled={clearing}>
              {clearing ? <Loader2 className="animate-spin" /> : <Trash2 className="size-4" />}
              {ar ? "امسح البيانات" : "Clear data"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
