import { describe, it, expect } from "vitest";

import { isDangerous } from "../../../functions/src/upload-scan-magic";

/**
 * The magic-byte denylist behind the storage upload scanner. Tested from the
 * app suite (the function module itself pulls in the Storage SDK), the same way
 * the ledger guard is. The contract: real media passes, disguised executables /
 * scripts / archives are caught.
 */
const head = (...bytes: number[]) => {
  const buf = new Uint8Array(16);
  bytes.forEach((v, i) => (buf[i] = v));
  return buf;
};

describe("upload magic-byte scan", () => {
  it("passes genuine media signatures", () => {
    expect(isDangerous(head(0x89, 0x50, 0x4e, 0x47))).toBe(false); // PNG
    expect(isDangerous(head(0xff, 0xd8, 0xff, 0xe0))).toBe(false); // JPEG
    expect(isDangerous(head(0x47, 0x49, 0x46, 0x38))).toBe(false); // GIF
    expect(isDangerous(head(0x25, 0x50, 0x44, 0x46))).toBe(false); // %PDF
    expect(isDangerous(head(0x52, 0x49, 0x46, 0x46))).toBe(false); // RIFF (WAV/WEBP)
    expect(isDangerous(head(0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70))).toBe(false); // MP4 ftyp
    expect(isDangerous(head(0x4f, 0x67, 0x67, 0x53))).toBe(false); // OGG
  });

  it("catches executables and scripts disguised as media", () => {
    expect(isDangerous(head(0x4d, 0x5a))).toBe(true); // MZ / PE .exe
    expect(isDangerous(head(0x7f, 0x45, 0x4c, 0x46))).toBe(true); // ELF
    expect(isDangerous(head(0xcf, 0xfa, 0xed, 0xfe))).toBe(true); // Mach-O 64 LE
    expect(isDangerous(head(0xca, 0xfe, 0xba, 0xbe))).toBe(true); // Java class / Mach-O universal
    expect(isDangerous(head(0x23, 0x21, 0x2f, 0x62))).toBe(true); // #!/b… shebang
  });

  it("catches archives (no allowed media type is zip-based)", () => {
    expect(isDangerous(head(0x50, 0x4b, 0x03, 0x04))).toBe(true); // ZIP/JAR/APK/Office
    expect(isDangerous(head(0x52, 0x61, 0x72, 0x21))).toBe(true); // RAR
    expect(isDangerous(head(0x1f, 0x8b))).toBe(true); // gzip
  });

  it("does not flag an empty or short header", () => {
    expect(isDangerous(new Uint8Array(0))).toBe(false);
    expect(isDangerous(head(0x00))).toBe(false);
  });
});
