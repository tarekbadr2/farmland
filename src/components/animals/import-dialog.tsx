"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Download, FileUp, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { useAnimals, useZones } from "@/hooks/use-farm-data";
import { getRepository } from "@/core/repositories";
import { TODAY } from "@/core/data/seed";
import { downloadCsv } from "@/lib/export";
import { parseSpreadsheet } from "@/lib/spreadsheet";
import {
  canonicalizeHeaders,
  draftToPatch,
  validateRow,
  TEMPLATE_HEADERS,
  TEMPLATE_SAMPLE,
  type ParsedRow,
  type PenRef,
} from "@/lib/import";

type Stage = "idle" | "preview" | "importing" | "done";

/** Run tasks with a concurrency cap so a 600-row import doesn't fire 600
 *  simultaneous writes; reports progress as each finishes. */
async function pool<T>(
  items: T[],
  worker: (t: T) => Promise<void>,
  onDone: () => void,
  concurrency = 12,
) {
  let idx = 0;
  const next = async (): Promise<void> => {
    while (idx < items.length) {
      const i = idx++;
      try {
        await worker(items[i]);
      } catch {
        /* counted by the worker */
      }
      onDone();
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, next));
}

export function ImportAnimalsDialog() {
  const { t, locale } = useI18n();
  const ar = locale === "ar";
  const queryClient = useQueryClient();
  const { data: zones = [] } = useZones();
  const { data: allAnimals } = useAnimals({ pageSize: 100000 });

  const pens: PenRef[] = React.useMemo(
    () =>
      zones
        .filter((z) => z.kind === "pen" || z.kind === "barn" || z.kind === "quarantine")
        .map((z) => ({ id: z.id, name: z.name, nameAr: z.nameAr })),
    [zones],
  );

  const [open, setOpen] = React.useState(false);
  const [stage, setStage] = React.useState<Stage>("idle");
  const [rows, setRows] = React.useState<ParsedRow[]>([]);
  const [fileName, setFileName] = React.useState("");
  const [progress, setProgress] = React.useState(0);
  const [failed, setFailed] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const fileInput = React.useRef<HTMLInputElement>(null);

  const valid = rows.filter((r) => r.draft);
  const invalid = rows.filter((r) => !r.draft);

  const reset = () => {
    setStage("idle");
    setRows([]);
    setFileName("");
    setProgress(0);
    setFailed(0);
    if (fileInput.current) fileInput.current.value = "";
  };

  const onFile = async (file: File) => {
    setFileName(file.name);
    try {
      const raw = await parseSpreadsheet(file);

      if (!raw.length) {
        toast.error(ar ? "الملف فارغ" : "That file has no rows");
        return;
      }

      const headerMap = canonicalizeHeaders(Object.keys(raw[0]));
      if (!Object.values(headerMap).includes("tag")) {
        toast.error(ar ? "لا يوجد عمود «tag». نزّل القالب أولاً." : "No 'tag' column found — download the template first.");
        return;
      }

      const parsed = raw.map((r, i) => {
        const canon: Record<string, unknown> = {};
        for (const [orig, val] of Object.entries(r)) {
          const key = headerMap[orig];
          if (key) canon[key] = val;
        }
        return validateRow(canon, i + 2, pens); // sheet row 1 is the header
      });

      // Reject tags that already exist or repeat within the file.
      const existing = new Set((allAnimals?.items ?? []).map((a) => a.tag.toLowerCase()));
      const seen = new Set<string>();
      for (const p of parsed) {
        if (!p.draft) continue;
        const tag = p.draft.tag.toLowerCase();
        if (existing.has(tag)) {
          p.errors.push(ar ? "الرقم موجود بالفعل في القطيع" : "Tag already exists in the herd");
          p.draft = undefined;
        } else if (seen.has(tag)) {
          p.errors.push(ar ? "رقم مكرر في الملف" : "Duplicate tag in this file");
          p.draft = undefined;
        } else {
          seen.add(tag);
        }
      }

      setRows(parsed);
      setStage("preview");
    } catch {
      toast.error(ar ? "تعذّرت قراءة الملف" : "Couldn't read that file");
    }
  };

  const runImport = async () => {
    setStage("importing");
    setProgress(0);
    let fail = 0;
    const repo = getRepository();
    await pool(
      valid,
      async (r) => {
        try {
          await repo.saveAnimal(draftToPatch(r.draft!, TODAY));
        } catch {
          fail++;
        }
      },
      () => setProgress((n) => n + 1),
    );
    setFailed(fail);
    queryClient.invalidateQueries();
    setStage("done");
    const ok = valid.length - fail;
    toast.success(ar ? `تم استيراد ${ok} حيوان` : `Imported ${ok} animal${ok === 1 ? "" : "s"}`);
  };

  const downloadTemplate = () =>
    downloadCsv("herd-import-template.csv", [
      TEMPLATE_SAMPLE,
      Object.fromEntries(TEMPLATE_HEADERS.map((h) => [h, ""])),
    ]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileUp /> {ar ? "استيراد" : "Import"}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{ar ? "استيراد القطيع" : "Import herd"}</DialogTitle>
          <DialogDescription>
            {ar
              ? "حمّل ملف CSV أو Excel بالحيوانات. نزّل القالب لمعرفة الأعمدة."
              : "Upload a CSV or Excel file of animals. Download the template to see the columns."}
          </DialogDescription>
        </DialogHeader>

        {/* ---- Upload ---- */}
        {(stage === "idle" || stage === "preview") && (
          <div className="space-y-3">
            {/* Drag-and-drop a spreadsheet, or pick one — both feed the same
                parser. onDragOver must preventDefault for a drop to fire. */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                if (!dragging) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) void onFile(file);
              }}
              className={cn(
                "rounded-xl border-2 border-dashed p-5 text-center transition-colors",
                dragging ? "border-primary bg-primary/5" : "border-border",
              )}
            >
              <Upload className="mx-auto mb-2 size-6 text-muted-foreground" />
              <p className="text-[13px] text-muted-foreground">
                {ar ? "اسحب ملف CSV أو Excel هنا، أو" : "Drag a CSV or Excel file here, or"}
              </p>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                <Button size="sm" onClick={() => fileInput.current?.click()}>
                  <Upload className="size-4" /> {ar ? "اختر ملفًا" : "Choose file"}
                </Button>
                <Button variant="outline" size="sm" onClick={downloadTemplate}>
                  <Download className="size-4" /> {ar ? "تنزيل القالب" : "Download template"}
                </Button>
              </div>
              {fileName && (
                <p className="mt-2 truncate text-[12.5px] text-muted-foreground">{fileName}</p>
              )}
              <input
                ref={fileInput}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
              />
            </div>

            <p className="text-[12px] text-muted-foreground">
              {ar
                ? "الأعمدة المطلوبة: tag، name، sex، breed، date_of_birth. الباقي اختياري."
                : "Required columns: tag, name, sex, breed, date_of_birth. The rest are optional."}
            </p>
          </div>
        )}

        {/* ---- Preview ---- */}
        {stage === "preview" && rows.length > 0 && (
          <div className="space-y-3">
            <div className="flex gap-3 text-[13px]">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 font-medium text-primary">
                <Check className="size-4" /> {valid.length} {ar ? "جاهز" : "ready"}
              </span>
              {invalid.length > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-destructive/10 px-3 py-1.5 font-medium text-destructive">
                  <AlertTriangle className="size-4" /> {invalid.length} {ar ? "بها مشاكل" : "with problems"}
                </span>
              )}
            </div>

            {invalid.length > 0 && (
              <div className="max-h-52 space-y-1.5 overflow-y-auto rounded-lg border border-border/70 p-2">
                {invalid.slice(0, 60).map((r) => (
                  <div key={r.row} className="text-[12px]">
                    <span className="tabular font-medium">
                      {ar ? "صف" : "Row"} {r.row} · {r.tag}
                    </span>
                    <span className="text-destructive"> — {r.errors.join("; ")}</span>
                  </div>
                ))}
              </div>
            )}

            {valid.some((r) => r.warnings.length) && (
              <p className="text-[11.5px] text-[var(--warning)]">
                {ar
                  ? "بعض الصفوف استُكملت بقيم افتراضية (مثل الحظيرة أو الوزن)."
                  : "Some rows were completed with defaults (e.g. pen or weight)."}
              </p>
            )}
          </div>
        )}

        {/* ---- Importing ---- */}
        {(stage === "importing" || stage === "done") && (
          <div className="space-y-3 py-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${valid.length ? (progress / valid.length) * 100 : 100}%` }}
              />
            </div>
            <p className="text-[13px] text-muted-foreground">
              {stage === "done"
                ? ar
                  ? `تم: ${valid.length - failed} حيوان${failed ? ` · فشل ${failed}` : ""}`
                  : `Done: ${valid.length - failed} imported${failed ? ` · ${failed} failed` : ""}`
                : ar
                  ? `جارٍ الاستيراد… ${progress}/${valid.length}`
                  : `Importing… ${progress}/${valid.length}`}
            </p>
          </div>
        )}

        <DialogFooter>
          {stage === "preview" && (
            <>
              <Button variant="outline" onClick={reset}>
                {ar ? "ملف آخر" : "Different file"}
              </Button>
              <Button onClick={runImport} disabled={valid.length === 0}>
                <Check /> {ar ? `استيراد ${valid.length}` : `Import ${valid.length}`}
              </Button>
            </>
          )}
          {stage === "importing" && (
            <Button disabled>
              <Loader2 className="animate-spin" /> {ar ? "جارٍ الاستيراد" : "Importing"}
            </Button>
          )}
          {stage === "done" && (
            <Button onClick={() => setOpen(false)}>{ar ? "تم" : "Close"}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
