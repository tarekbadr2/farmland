import bidiFactory from "bidi-js";
import { ArabicShaper } from "arabic-persian-reshaper";

/**
 * Arabic text preparation for renderers that don't shape or reorder — jsPDF in
 * particular draws glyphs strictly left-to-right with no cursive joining and no
 * bidirectional reordering. On the web the browser does both for us; in a PDF we
 * have to do them by hand:
 *
 *   1. shape — swap each letter for its connected presentation form so the word
 *      joins up instead of rendering as isolated, broken letters;
 *   2. reorder — run the Unicode bidi algorithm and flip the runs into visual
 *      order, so a right-to-left string drawn left-to-right still reads right.
 *
 * Latin, digits, and punctuation embedded in an Arabic string keep their order
 * (the bidi pass handles the mixing), so tags like "BF-0421" stay intact inside
 * an otherwise-Arabic cell.
 */

const bidi = bidiFactory();

// Arabic + Arabic Supplement + Presentation Forms A/B.
const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

export function hasArabic(s: unknown): boolean {
  return typeof s === "string" && ARABIC_RE.test(s);
}

/** Logical-order Arabic/mixed text → visual-order, shaped text for jsPDF. */
export function shapeArabic(s: string): string {
  if (!s || !ARABIC_RE.test(s)) return s;
  const shaped = ArabicShaper.convertArabic(s);
  const levels = bidi.getEmbeddingLevels(shaped, "rtl");
  return bidi.getReorderedString(shaped, levels);
}
