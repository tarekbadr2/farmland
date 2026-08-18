/**
 * The magic-byte check, with no Firebase in it — split out so the app's test
 * suite can import and exercise it directly (same arrangement as ledger-check).
 * See upload-scan.ts for what it's used for.
 */

export const HEAD_BYTES = 16;

/** True if the header matches a known executable / script / archive signature —
 *  i.e. a payload disguised as media. A denylist of clearly-dangerous content,
 *  not an allowlist of valid media, so a legitimate image is never flagged. */
export function isDangerous(head: Uint8Array): boolean {
  const b = (...bytes: number[]) => bytes.every((v, i) => head[i] === v);

  return (
    b(0x4d, 0x5a) || // MZ — Windows PE (.exe/.dll)
    b(0x7f, 0x45, 0x4c, 0x46) || // ELF — Linux/Android executable
    b(0xfe, 0xed, 0xfa, 0xce) || // Mach-O 32 BE
    b(0xfe, 0xed, 0xfa, 0xcf) || // Mach-O 64 BE
    b(0xce, 0xfa, 0xed, 0xfe) || // Mach-O 32 LE
    b(0xcf, 0xfa, 0xed, 0xfe) || // Mach-O 64 LE
    b(0xca, 0xfe, 0xba, 0xbe) || // Mach-O universal / Java class
    b(0x23, 0x21) || // #! — shell/interpreter script
    b(0x50, 0x4b, 0x03, 0x04) || // PK.. — ZIP/JAR/APK/Office
    b(0x50, 0x4b, 0x05, 0x06) || // empty ZIP
    b(0x52, 0x61, 0x72, 0x21) || // Rar!
    b(0x1f, 0x8b) // gzip
  );
}
