"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, ScanLine, SearchX } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAnimals } from "@/hooks/use-farm-data";
import { useI18n } from "@/lib/i18n/provider";
import type { Animal } from "@/core/domain/types";

/** Minimal shape of the native BarcodeDetector (not in TS lib DOM yet). */
type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
};
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/**
 * Scan an ear tag or RFID and jump to the animal.
 *
 * Two ways in, because farms use both: the camera (QR / barcode on the tag, via
 * the native BarcodeDetector where available) and a focused text box that also
 * captures keyboard-wedge RFID/barcode handhelds — and plain typing. A scanned
 * code is matched against the herd by tag or RFID and opens that animal's
 * profile.
 */
export function ScanTagDialog({ trigger }: { trigger: React.ReactNode }) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const ar = locale === "ar";

  const [open, setOpen] = React.useState(false);
  const [manual, setManual] = React.useState("");
  const [notFound, setNotFound] = React.useState<string | null>(null);
  const [cameraOn, setCameraOn] = React.useState(false);
  const [cameraError, setCameraError] = React.useState(false);

  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const { data: page } = useAnimals({ pageSize: 100000 });
  const animals = React.useMemo(() => page?.items ?? [], [page]);

  const lookup = React.useCallback(
    (raw: string): Animal | undefined => {
      const code = norm(raw);
      if (!code) return undefined;
      return animals.find((a) => norm(a.tag) === code || norm(a.rfid) === code);
    },
    [animals],
  );

  const resolve = React.useCallback(
    (raw: string) => {
      const hit = lookup(raw);
      if (hit) {
        setOpen(false);
        router.push(`/animal?id=${hit.id}`);
      } else {
        setNotFound(raw.trim());
      }
    },
    [lookup, router],
  );

  // Camera + BarcodeDetector loop. Runs only while the dialog is open and the
  // API is available; degrades silently to the text box otherwise.
  React.useEffect(() => {
    if (!open) return;
    const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    if (!Ctor || !navigator.mediaDevices?.getUserMedia) return;

    let cancelled = false;
    let timer: number | undefined;
    const detector = new Ctor({ formats: ["qr_code", "code_128", "code_39", "ean_13", "data_matrix"] });

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        streamRef.current = stream;
        setCameraOn(true);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes[0]?.rawValue) {
              resolve(codes[0].rawValue);
              return; // stop on first hit
            }
          } catch {
            /* transient decode error — keep polling */
          }
          timer = window.setTimeout(tick, 350);
        };
        timer = window.setTimeout(tick, 500);
      })
      .catch(() => setCameraError(true));

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
      setCameraOn(false);
    };
  }, [open, resolve]);

  // Reset transient state each time it opens; focus the input for wedge scanners.
  React.useEffect(() => {
    if (open) {
      setManual("");
      setNotFound(null);
      setCameraError(false);
      const id = window.setTimeout(() => inputRef.current?.focus(), 120);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="size-4 text-primary" />
            {t("animals.scanTag")}
          </DialogTitle>
          <DialogDescription>
            {ar
              ? "وجّه الكاميرا نحو الرمز، أو استخدم قارئ RFID، أو اكتب الرقم يدويًا."
              : "Point the camera at the tag's code, use an RFID reader, or type the tag."}
          </DialogDescription>
        </DialogHeader>

        {/* Camera viewport (only if supported + permitted) */}
        <div className="relative overflow-hidden rounded-xl border border-border bg-muted/40 aspect-video">
          <video ref={videoRef} muted playsInline className="size-full object-cover" />
          {!cameraOn && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-muted-foreground">
              {cameraError ? (
                <>
                  <Camera className="size-6 opacity-60" />
                  <p className="px-6 text-[12px]">
                    {ar
                      ? "الكاميرا غير متاحة — استخدم القارئ أو اكتب الرقم أدناه."
                      : "Camera unavailable — use a reader or type the tag below."}
                  </p>
                </>
              ) : (
                <>
                  <Loader2 className="size-5 animate-spin" />
                  <p className="text-[12px]">{ar ? "جارٍ فتح الكاميرا…" : "Starting camera…"}</p>
                </>
              )}
            </div>
          )}
          {cameraOn && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-24 w-2/3 rounded-lg border-2 border-primary/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />
            </div>
          )}
        </div>

        {/* Manual / wedge-scanner entry */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (manual.trim()) resolve(manual);
          }}
          className="flex gap-2"
        >
          <Input
            ref={inputRef}
            value={manual}
            onChange={(e) => {
              setManual(e.target.value);
              setNotFound(null);
            }}
            placeholder={ar ? "الرقم أو RFID" : "Tag or RFID"}
            className="tabular"
          />
          <Button type="submit" disabled={!manual.trim()}>
            {ar ? "بحث" : "Find"}
          </Button>
        </form>

        {notFound && (
          <p className="flex items-center gap-1.5 text-[12.5px] text-destructive">
            <SearchX className="size-4 shrink-0" />
            {ar ? `لا يوجد حيوان بالرقم "${notFound}"` : `No animal with tag “${notFound}”`}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
