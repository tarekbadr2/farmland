"use client";

/** Client-side exports. Real deployments swap these for a Cloud Function that
 *  renders the same data server-side and emails it on a schedule. */

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
  triggerDownload(blob, filename);
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  triggerDownload(blob, filename);
}

function triggerDownload(blob: Blob, filename: string) {
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

/**
 * A real .xlsx workbook — not CSV with a different extension.
 *
 * SheetJS handles Unicode natively, so Arabic names and mixed scripts survive,
 * numbers stay numbers (sortable, summable in Excel) rather than becoming text,
 * and the column widths are sized to the content so nothing opens truncated.
 * Loaded on demand so the ~400 KB library never touches first paint.
 */
export async function downloadXlsx(doc: ReportDoc) {
  const XLSX = await import("xlsx");
  const headers = doc.headers ?? doc.columns;

  const aoa = [headers, ...doc.rows.map((r) => doc.columns.map((c) => r[c] ?? ""))];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);

  // Size each column to its widest cell (capped) so it opens readable.
  sheet["!cols"] = doc.columns.map((c, i) => {
    const widest = Math.max(
      String(headers[i] ?? c).length,
      ...doc.rows.map((r) => String(r[c] ?? "").length),
    );
    return { wch: Math.min(40, Math.max(8, widest + 2)) };
  });

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, doc.title.slice(0, 31));
  XLSX.writeFile(book, `${doc.filename}.xlsx`);
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
