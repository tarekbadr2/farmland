// Minimal type shims for JS-only vendor libraries used by the PDF Arabic path.

declare module "arabic-persian-reshaper" {
  export const ArabicShaper: {
    convertArabic(input: string): string;
    convertArabicBack(input: string): string;
  };
  export const PersianShaper: {
    convertArabic(input: string): string;
    convertArabicBack(input: string): string;
  };
}

declare module "bidi-js" {
  interface EmbeddingLevels {
    levels: Uint8Array;
    paragraphs: { start: number; end: number; level: number }[];
  }
  interface Bidi {
    getEmbeddingLevels(text: string, baseDirection?: "ltr" | "rtl" | "auto"): EmbeddingLevels;
    getReorderedString(text: string, embeddingLevels: EmbeddingLevels): string;
    getReorderSegments(
      text: string,
      embeddingLevels: EmbeddingLevels,
    ): [number, number][];
  }
  export default function bidiFactory(): Bidi;
}
