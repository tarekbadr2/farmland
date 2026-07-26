"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, Check, Clock, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n/provider";
import { useTransferRequests, useZones, qk } from "@/hooks/use-farm-data";
import { getRepository } from "@/core/repositories";
import { usePermission } from "@/lib/auth/guard";
import { formatDate } from "@/lib/date";
import type { TransferRequest } from "@/core/domain/types";
import { TransferAnimalsDialog } from "./transfer-animals-dialog";

/**
 * Review queue for pen-move requests (طلب تحويل). Any member sees the list and
 * can raise a new request; approving or rejecting is gated on animals.write
 * (approval executes the real, immutable transfer).
 */
export function TransferRequestsDialog({ trigger }: { trigger: React.ReactNode }) {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const [open, setOpen] = React.useState(false);
  const { data: requests = [] } = useTransferRequests();
  const { data: zones = [] } = useZones();
  const { has } = usePermission();
  const canDecide = has("animals.write");
  const queryClient = useQueryClient();

  const zoneName = (id: string) => {
    const z = zones.find((x) => x.id === id);
    return z ? (ar ? z.nameAr : z.name) : id;
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: qk.transferRequests });
    queryClient.invalidateQueries({ queryKey: ["animals"] });
    queryClient.invalidateQueries({ queryKey: qk.livestockTransfers });
  };

  const approve = useMutation({
    mutationFn: (id: string) => getRepository().approveTransferRequest(id),
    onSuccess: () => {
      refresh();
      toast.success(ar ? "تمت الموافقة وتنفيذ التحويل." : "Approved — transfer executed.");
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const reject = useMutation({
    mutationFn: (id: string) => getRepository().rejectTransferRequest(id),
    onSuccess: () => {
      refresh();
      toast.success(ar ? "تم رفض الطلب." : "Request rejected.");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const pending = requests.filter((r) => r.status === "pending");
  const decided = requests.filter((r) => r.status !== "pending").slice(0, 10);
  const busy = approve.isPending || reject.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <DialogTitle>{ar ? "طلبات التحويل" : "Transfer requests"}</DialogTitle>
              <DialogDescription>
                {ar
                  ? "طلبات نقل الرؤوس بين الحظائر بانتظار الموافقة."
                  : "Proposed pen moves awaiting approval."}
              </DialogDescription>
            </div>
            <TransferAnimalsDialog
              mode="request"
              trigger={
                <Button size="sm" variant="outline">
                  <Plus /> {ar ? "طلب جديد" : "New request"}
                </Button>
              }
            />
          </div>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          {pending.length === 0 && decided.length === 0 && (
            <p className="py-8 text-center text-[13px] text-muted-foreground">
              {ar ? "لا توجد طلبات." : "No requests."}
            </p>
          )}

          {pending.map((r) => (
            <Row key={r.id} req={r} ar={ar} zoneName={zoneName} locale={locale}>
              {canDecide && (
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => reject.mutate(r.id)}>
                    <X /> {ar ? "رفض" : "Reject"}
                  </Button>
                  <Button size="sm" disabled={busy} onClick={() => approve.mutate(r.id)}>
                    {busy ? <Loader2 className="animate-spin" /> : <Check />} {ar ? "موافقة" : "Approve"}
                  </Button>
                </div>
              )}
            </Row>
          ))}

          {decided.map((r) => (
            <Row key={r.id} req={r} ar={ar} zoneName={zoneName} locale={locale}>
              <Badge variant={r.status === "approved" ? "success" : "outline"}>
                {r.status === "approved"
                  ? ar ? "تمت الموافقة" : "Approved"
                  : ar ? "مرفوض" : "Rejected"}
              </Badge>
            </Row>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  req,
  ar,
  zoneName,
  locale,
  children,
}: {
  req: TransferRequest;
  ar: boolean;
  zoneName: (id: string) => string;
  locale: "en" | "ar";
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border/70 p-3">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[13.5px] font-medium">
          <ArrowRightLeft className="size-3.5 text-muted-foreground" />
          {req.animalIds.length} {ar ? "رأس →" : "head →"} {zoneName(req.toZoneId)}
        </p>
        <p className="mt-0.5 flex items-center gap-1 text-[11.5px] text-muted-foreground">
          <Clock className="size-3" />
          {req.requestedByName ?? "—"} · {formatDate(req.requestedAt.slice(0, 10), locale)}
        </p>
        {req.notes && <p className="mt-1 text-[12px] text-muted-foreground">“{req.notes}”</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
