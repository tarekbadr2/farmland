"use client";

/** Client-side exports. Real deployments swap these for a Cloud Function that
 *  renders the same data server-side and emails it on a schedule. */

// Type-only import — erased at build time, so the ExcelJS runtime is still
// loaded lazily (via dynamic import) and never touches first paint.
import type { Font, CellValue } from "exceljs";

type Row = Record<string, string | number | boolean | null | undefined>;

// Cheap Arabic detector kept local so format detection never drags in the
// shaper/bidi libraries — those load lazily, only when a PDF actually needs them.
const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const hasArabicText = (s: string) => ARABIC_RE.test(s);

function escapeCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Row[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escapeCell(r[h])).join(",")),
  ];
  // BOM so Excel opens Arabic columns without mangling them.
  return `﻿${lines.join("\n")}`;
}

export function downloadCsv(filename: string, rows: Row[]) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8;" });
  void triggerDownload(blob, filename);
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  void triggerDownload(blob, filename);
}

/** The Electron shell's native file bridge (absent on the web). */
interface DesktopFiles {
  save: (p: {
    name: string;
    base64: string;
    filters?: { name: string; extensions: string[] }[];
  }) => Promise<{ ok: boolean; path?: string; canceled?: boolean }>;
  openPath: (p: string) => Promise<{ ok: boolean }>;
}
function desktopFiles(): DesktopFiles | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { desktopFiles?: DesktopFiles }).desktopFiles ?? null;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result);
      resolve(s.slice(s.indexOf(",") + 1)); // strip the data: URL prefix
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function saveFilters(filename: string): { name: string; extensions: string[] }[] | undefined {
  const ext = filename.split(".").pop()?.toLowerCase();
  const named: Record<string, string> = { xlsx: "Excel Workbook", csv: "CSV", pdf: "PDF", json: "JSON" };
  if (!ext || !named[ext]) return undefined;
  return [
    { name: named[ext], extensions: [ext] },
    { name: "All Files", extensions: ["*"] },
  ];
}

async function triggerDownload(blob: Blob, filename: string) {
  // Desktop: pop a native Save dialog to a location the user picks, then open
  // the file. Falls back to a normal browser download on the web (or if the
  // native save is cancelled/fails).
  const files = desktopFiles();
  if (files) {
    try {
      const base64 = await blobToBase64(blob);
      const res = await files.save({ name: filename, base64, filters: saveFilters(filename) });
      if (res?.ok && res.path) {
        files.openPath(res.path).catch(() => {});
        return;
      }
      if (res?.canceled) return; // user chose not to save — don't also web-download
    } catch {
      // fall through to the browser download
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Print-to-PDF: the browser's own renderer handles pagination and RTL. */
export function printReport() {
  window.print();
}

/* ----------------------------- Formal reports ---------------------------- */

/** A tabular report ready to render to any format. */
export interface ReportDoc {
  /** Base filename without extension, e.g. "daily-production-2026-07-21". */
  filename: string;
  /** Human title printed at the top of the document. */
  title: string;
  /** Farm name / subtitle line under the title. */
  subtitle?: string;
  /** Column keys, in order. */
  columns: string[];
  /** Header labels aligned to `columns`. Defaults to the keys if omitted. */
  headers?: string[];
  rows: Row[];
  /**
   * Lay the PDF out right-to-left (Arabic locale): columns run right→left and
   * text is right-aligned. Arabic glyphs are shaped and reordered regardless of
   * this flag whenever they appear; `rtl` only controls the page geometry.
   */
  rtl?: boolean;
}

/** snake_case / camelCase key → "Title Case" header label. */
function prettifyHeader(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

// Brand palette, as Excel ARGB strings.
const XLSX_GREEN = "FF16654A"; // header fill / accents
const XLSX_GREEN_DEEP = "FF12332A"; // title text
const XLSX_BAND = "FFEFF5F2"; // striped row fill
const XLSX_RULE = "FFDCE5E0"; // hairline row borders
const XLSX_MUTED = "FF6B7B74"; // subtitle text

/**
 * A professionally styled .xlsx workbook.
 *
 * ExcelJS (unlike the SheetJS community build) can style cells, so the export
 * gets a branded letterhead block, a bold coloured header row that stays frozen
 * and filterable, zebra-striped rows, hairline rules, right-aligned numbers with
 * a totals row, and content-sized columns. Numbers stay numbers (sortable /
 * summable), Arabic survives, and RTL locales flip the sheet. Loaded on demand
 * so the library never touches first paint.
 */
export async function downloadXlsx(doc: ReportDoc) {
  const ExcelJS = await import("exceljs");
  const headers = doc.headers ?? doc.columns.map(prettifyHeader);
  const n = doc.columns.length;
  const rtl = !!doc.rtl;
  const hAlign = rtl ? "right" : "left";

  const wb = new ExcelJS.Workbook();
  wb.creator = "Herd OS";
  const ws = wb.addWorksheet(doc.title.slice(0, 31) || "Report", {
    views: [{ rightToLeft: rtl }],
  });

  const spanRow = (row: number, value: string, font: Partial<Font>, height?: number) => {
    ws.mergeCells(row, 1, row, Math.max(1, n));
    const cell = ws.getCell(row, 1);
    cell.value = value;
    cell.font = { name: "Calibri", ...font };
    cell.alignment = { vertical: "middle", horizontal: hAlign };
    if (height) ws.getRow(row).height = height;
  };

  // ---- Letterhead ----
  let r = 1;
  spanRow(r++, doc.title, { size: 16, bold: true, color: { argb: XLSX_GREEN_DEEP } }, 26);
  if (doc.subtitle) spanRow(r++, doc.subtitle, { size: 11, color: { argb: XLSX_MUTED } });
  spanRow(
    r++,
    rtl
      ? `${doc.rows.length} صف · ${new Date().toISOString().slice(0, 10)}`
      : `Generated ${new Date().toISOString().slice(0, 10)} · ${doc.rows.length} rows`,
    { size: 9, italic: true, color: { argb: "FF9AA8A1" } },
  );
  r++; // spacer

  // ---- Header row ----
  const headerRowIdx = r;
  const headerRow = ws.getRow(headerRowIdx);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XLSX_GREEN } };
    cell.alignment = { vertical: "middle", horizontal: hAlign, wrapText: false };
    cell.border = { bottom: { style: "medium", color: { argb: XLSX_GREEN_DEEP } } };
  });
  headerRow.height = 20;

  // ---- Data rows ----
  doc.rows.forEach((row, ri) => {
    const xr = ws.getRow(headerRowIdx + 1 + ri);
    doc.columns.forEach((col, ci) => {
      const v = row[col];
      const cell = xr.getCell(ci + 1);
      cell.value = (v ?? "") as CellValue;
      cell.font = { name: "Calibri", size: 10, color: { argb: "FF23302B" } };
      cell.alignment = {
        horizontal: typeof v === "number" ? "right" : hAlign,
        vertical: "middle",
      };
      cell.border = { bottom: { style: "hair", color: { argb: XLSX_RULE } } };
      if (ri % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XLSX_BAND } };
      }
    });
  });

  // ---- Totals row ----
  // Sum only genuine quantities. Rates, percentages and scores don't add up to
  // anything meaningful, so summing them would look wrong — skip those columns.
  const rateLike = /pct|percent|%|avg|average|score|health|rate|per[_\s]|ratio/i;
  const summable = doc.columns.map(
    (c, i) =>
      !rateLike.test(c) &&
      !rateLike.test(String(headers[i] ?? "")) &&
      doc.rows.some((row) => typeof row[c] === "number") &&
      doc.rows.every((row) => row[c] == null || row[c] === "" || typeof row[c] === "number"),
  );
  if (summable.some(Boolean)) {
    const tr = ws.getRow(headerRowIdx + 1 + doc.rows.length);
    doc.columns.forEach((c, ci) => {
      const cell = tr.getCell(ci + 1);
      if (ci === 0) cell.value = rtl ? "الإجمالي" : "Total";
      else if (summable[ci]) {
        cell.value = doc.rows.reduce((s, row) => s + (typeof row[c] === "number" ? (row[c] as number) : 0), 0);
      }
      cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: XLSX_GREEN_DEEP } };
      cell.alignment = { horizontal: summable[ci] ? "right" : hAlign };
      cell.border = { top: { style: "thin", color: { argb: XLSX_GREEN } } };
    });
  }

  // ---- Freeze header + auto-filter + column widths ----
  ws.views = [{ state: "frozen", ySplit: headerRowIdx, rightToLeft: rtl }];
  ws.autoFilter = {
    from: { row: headerRowIdx, column: 1 },
    to: { row: headerRowIdx, column: Math.max(1, n) },
  };
  doc.columns.forEach((c, i) => {
    const widest = Math.max(
      String(headers[i] ?? c).length,
      ...doc.rows.map((row) => String(row[c] ?? "").length),
    );
    ws.getColumn(i + 1).width = Math.min(46, Math.max(10, widest + 2));
  });

  const buf = await wb.xlsx.writeBuffer();
  void triggerDownload(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${doc.filename}.xlsx`,
  );
}

/**
 * Convenience wrapper for the per-page "Export" buttons: takes a flat list of
 * row objects and produces the styled workbook, deriving columns from the keys
 * and Title-Casing them into headers. Pass `subtitle`/`rtl` for the letterhead.
 */
export async function downloadTableXlsx(
  filenameBase: string,
  title: string,
  rows: Row[],
  opts?: { subtitle?: string; rtl?: boolean; headers?: string[] },
) {
  const columns = rows.length ? Object.keys(rows[0]) : [];
  await downloadXlsx({
    filename: filenameBase.replace(/\.(csv|xlsx)$/i, ""),
    title,
    subtitle: opts?.subtitle,
    columns,
    headers: opts?.headers ?? columns.map(prettifyHeader),
    rows,
    rtl: opts?.rtl,
  });
}

/**
 * A real paginated PDF with a farm letterhead and a striped table.
 *
 * Arabic-capable: jsPDF ships Latin-only fonts and does no cursive joining or
 * bidi reordering, so when the document carries any Arabic we lazy-load the
 * embedded Amiri face and run each string through the shaper before drawing.
 * `rtl` docs additionally flip the column order and right-align. Everything —
 * font, shaper, and jsPDF itself — loads on demand so a CSV/Excel user never
 * pays for it. autotable handles page breaks, repeating the header on every page.
 */
export async function downloadPdf(doc: ReportDoc) {
  const headers = doc.headers ?? doc.columns;
  const bodyRaw = doc.rows.map((r) => doc.columns.map((c) => String(r[c] ?? "")));

  // Does anything in the document need Arabic treatment?
  const needsArabic =
    doc.rtl ||
    headers.some(hasArabicText) ||
    bodyRaw.some((row) => row.some(hasArabicText)) ||
    hasArabicText(doc.title) ||
    hasArabicText(doc.subtitle ?? "");

  const [{ jsPDF }, autoTableMod] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableMod.default;

  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  // Shaper is a no-op until we've loaded the Arabic path; stays identity for
  // pure-Latin documents so nothing changes for them.
  let shape = (s: string) => s;
  let font = "helvetica";

  if (needsArabic) {
    const [{ AMIRI_REGULAR_BASE64 }, { shapeArabic }] = await Promise.all([
      import("@/lib/fonts/amiri"),
      import("@/lib/arabic"),
    ]);
    pdf.addFileToVFS("Amiri-Regular.ttf", AMIRI_REGULAR_BASE64);
    // Register the same face for normal and bold — Amiri has no separate bold,
    // but autotable asks for a bold header face, so point both at the file.
    pdf.addFont("Amiri-Regular.ttf", "Amiri", "normal");
    pdf.addFont("Amiri-Regular.ttf", "Amiri", "bold");
    shape = shapeArabic;
    font = "Amiri";
  }

  const rtl = !!doc.rtl;
  const pageWidth = pdf.internal.pageSize.getWidth();

  pdf.setFont(font, "normal");
  pdf.setFontSize(16);
  pdf.setTextColor(20);
  const titleX = rtl ? pageWidth - 40 : 40;
  const titleAlign = rtl ? "right" : "left";
  pdf.text(shape(doc.title), titleX, 42, { align: titleAlign });
  if (doc.subtitle) {
    pdf.setFontSize(10);
    pdf.setTextColor(120);
    pdf.text(shape(doc.subtitle), titleX, 60, { align: titleAlign });
  }
  pdf.setTextColor(150);
  pdf.setFontSize(9);
  const meta = rtl
    ? shape(`${doc.rows.length} صف · ${new Date().toISOString().slice(0, 10)}`)
    : `Generated ${new Date().toISOString().slice(0, 10)} · ${doc.rows.length} rows`;
  pdf.text(meta, titleX, 74, { align: titleAlign });

  // Shape every cell/header; for RTL flip the column order so the first logical
  // column sits on the right.
  const order = rtl ? [...headers.keys()].reverse() : [...headers.keys()];
  const head = order.map((i) => shape(headers[i]));
  const body = bodyRaw.map((row) => order.map((i) => shape(row[i])));

  autoTable(pdf, {
    startY: 88,
    head: [head],
    body,
    styles: {
      font,
      fontSize: 8,
      cellPadding: 4,
      overflow: "linebreak",
      halign: rtl ? "right" : "left",
    },
    headStyles: { font, fillColor: [22, 101, 74], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [244, 247, 245] },
    margin: { left: 40, right: 40 },
  });

  pdf.save(`${doc.filename}.pdf`);
}
