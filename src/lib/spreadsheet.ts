"use client";

/**
 * Spreadsheet reading for the herd import — CSV parsed directly, XLSX via
 * ExcelJS (already a dependency). This replaces SheetJS/`xlsx`, whose parser has
 * unpatched prototype-pollution + ReDoS advisories on exactly this path
 * (reading untrusted uploads).
 */

import type { Worksheet } from "exceljs";

type Cell = string | number | boolean | Date | null | undefined;

/** Normalise an ExcelJS cell value (which can be a formula/hyperlink/rich-text
 *  object or a Date) to a primitive, keeping numbers as numbers. */
export function cellValue(v: unknown): string | number {
  if (v == null) return "";
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("text" in o && o.text != null) return String(o.text); // hyperlink
    if ("result" in o) return (o.result as string | number) ?? ""; // formula
    if ("richText" in o && Array.isArray(o.richText)) {
      return (o.richText as { text?: string }[]).map((t) => t.text ?? "").join("");
    }
  }
  return String(v);
}

/** Split CSV text into a matrix, honouring quoted fields, escaped quotes and a
 *  leading BOM. */
function csvToMatrix(text: string): string[][] {
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // strip BOM
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const numericLike = (s: string) => s !== "" && /^-?\d+(\.\d+)?$/.test(s.trim());

/** CSV text → row objects keyed by the header row. Numeric cells become numbers
 *  (mirroring how a spreadsheet reader would type them). */
export function parseCsv(text: string): Record<string, unknown>[] {
  const matrix = csvToMatrix(text);
  if (!matrix.length) return [];
  const headers = matrix[0].map((h) => h.trim());
  return matrix
    .slice(1)
    .filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) => {
      const obj: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        if (!h) return;
        const raw = (r[i] ?? "").trim();
        obj[h] = numericLike(raw) ? Number(raw) : raw;
      });
      return obj;
    });
}

/** ExcelJS worksheet → row objects keyed by the header row. */
export function worksheetToRows(ws: Worksheet): Record<string, unknown>[] {
  const headers: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col - 1] = String(cellValue(cell.value as Cell)).trim();
  });
  const rows: Record<string, unknown>[] = [];
  const last = ws.rowCount;
  for (let r = 2; r <= last; r++) {
    const row = ws.getRow(r);
    const obj: Record<string, unknown> = {};
    let any = false;
    headers.forEach((h, i) => {
      if (!h) return;
      const v = cellValue(row.getCell(i + 1).value as Cell);
      obj[h] = v;
      if (v !== "" && v != null) any = true;
    });
    if (any) rows.push(obj);
  }
  return rows;
}

/** Read the first sheet of an uploaded CSV/XLSX file into row objects. */
export async function parseSpreadsheet(file: File): Promise<Record<string, unknown>[]> {
  const buf = await file.arrayBuffer();
  if (/\.csv$/i.test(file.name)) {
    return parseCsv(new TextDecoder().decode(buf));
  }
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  return ws ? worksheetToRows(ws) : [];
}
