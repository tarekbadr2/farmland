import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";

import { parseCsv, cellValue, worksheetToRows } from "./spreadsheet";

describe("cellValue", () => {
  it("normalises the shapes ExcelJS returns", () => {
    expect(cellValue(12)).toBe(12);
    expect(cellValue("x")).toBe("x");
    expect(cellValue(null)).toBe("");
    expect(cellValue(new Date("2025-03-04T00:00:00Z"))).toBe("2025-03-04");
    expect(cellValue({ formula: "A1", result: 42 })).toBe(42);
    expect(cellValue({ text: "EG-1", hyperlink: "http://x" })).toBe("EG-1");
    expect(cellValue({ richText: [{ text: "Far" }, { text: "ida" }] })).toBe("Farida");
  });
});

describe("parseCsv", () => {
  it("keys rows by header and keeps numbers numeric", () => {
    const rows = parseCsv("tag,name,weight\nA-1,Farida,540\nA-2,Samira,610\n");
    expect(rows).toEqual([
      { tag: "A-1", name: "Farida", weight: 540 },
      { tag: "A-2", name: "Samira", weight: 610 },
    ]);
  });

  it("handles a BOM, quoted commas and escaped quotes", () => {
    const rows = parseCsv('﻿tag,note\nA-1,"cow, brown"\nA-2,"say ""hi"""\n');
    expect(rows[0]).toEqual({ tag: "A-1", note: "cow, brown" });
    expect(rows[1]).toEqual({ tag: "A-2", note: 'say "hi"' });
  });

  it("skips blank rows and empty input", () => {
    expect(parseCsv("tag,name\nA-1,Farida\n\n,\n")).toEqual([{ tag: "A-1", name: "Farida" }]);
    expect(parseCsv("")).toEqual([]);
  });
});

describe("worksheetToRows (xlsx path)", () => {
  it("reads the header row and data, keeping numbers", () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sheet1");
    ws.addRow(["tag", "name", "weight"]);
    ws.addRow(["A-1", "Farida", 540]);
    ws.addRow(["A-2", "Samira", 610]);
    ws.addRow(["", "", ""]); // blank → dropped

    expect(worksheetToRows(ws)).toEqual([
      { tag: "A-1", name: "Farida", weight: 540 },
      { tag: "A-2", name: "Samira", weight: 610 },
    ]);
  });
});
