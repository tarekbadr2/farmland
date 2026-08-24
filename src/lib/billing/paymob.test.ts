import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseMerchantOrderId, verifyWebhook } from "./paymob";

/**
 * The two pure, security-relevant helpers of the Paymob seam. The network flow
 * (`createCheckoutUrl`) isn't unit-tested — it's a thin orchestration over
 * `fetch` — but the webhook signature check and the order-id parser gate money
 * and tenancy, so they're pinned here.
 */

describe("parseMerchantOrderId", () => {
  it("splits a well-formed id into farm + tier", () => {
    expect(parseMerchantOrderId("farm123:growth:1700000000000")).toEqual({
      farmId: "farm123",
      tier: "growth",
    });
  });

  it("ignores the trailing timestamp segment", () => {
    // Extra colons after the tier don't matter — only the first two fields are read.
    expect(parseMerchantOrderId("f1:pro:ts:extra")).toEqual({ farmId: "f1", tier: "pro" });
  });

  it("rejects an unknown tier", () => {
    expect(parseMerchantOrderId("f1:platinum:123")).toBeNull();
  });

  it("rejects a missing farm id or missing tier", () => {
    expect(parseMerchantOrderId(":growth:123")).toBeNull();
    expect(parseMerchantOrderId("f1")).toBeNull();
    expect(parseMerchantOrderId("")).toBeNull();
  });
});

describe("verifyWebhook", () => {
  const SECRET = "test_hmac_secret";

  // The exact fields Paymob signs, in the exact order paymob.ts concatenates
  // them. Building the digest the same way the verifier does lets us assert a
  // genuine round-trip rather than re-implementing the order under test.
  const ORDER = [
    "amount_cents", "created_at", "currency", "error_occured", "has_parent_transaction",
    "id", "integration_id", "is_3d_secure", "is_auth", "is_capture", "is_refunded",
    "is_standalone_payment", "is_voided", "order.id", "owner", "pending",
    "source_data.pan", "source_data.sub_type", "source_data.type", "success",
  ];
  const asStr = (v: unknown) => (v === true ? "true" : v === false ? "false" : String(v ?? ""));
  const get = (obj: Record<string, unknown>, path: string) =>
    path.split(".").reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], obj);
  const sign = (obj: Record<string, unknown>) =>
    crypto
      .createHmac("sha512", SECRET)
      .update(ORDER.map((p) => asStr(get(obj, p))).join(""))
      .digest("hex");

  const txn = (): Record<string, unknown> => ({
    amount_cents: 149900,
    created_at: "2025-06-01T00:00:00Z",
    currency: "EGP",
    error_occured: false,
    has_parent_transaction: false,
    id: 987654,
    integration_id: 4242,
    is_3d_secure: true,
    is_auth: false,
    is_capture: false,
    is_refunded: false,
    is_standalone_payment: true,
    is_voided: false,
    order: { id: 555 },
    owner: 12,
    pending: false,
    source_data: { pan: "1234", sub_type: "MasterCard", type: "card" },
    success: true,
  });

  beforeEach(() => {
    process.env.PAYMOB_HMAC_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.PAYMOB_HMAC_SECRET;
  });

  it("accepts a correctly signed payload", () => {
    const obj = txn();
    expect(verifyWebhook(obj, sign(obj))).toBe(true);
  });

  it("rejects a tampered payload (amount changed after signing)", () => {
    const obj = txn();
    const hmac = sign(obj);
    obj.amount_cents = 1; // attacker lowers the charge
    expect(verifyWebhook(obj, hmac)).toBe(false);
  });

  it("rejects a flipped boolean (failed txn passed off as success)", () => {
    const obj = txn();
    obj.success = false;
    const hmac = sign(obj); // legitimately signs the failed txn
    obj.success = true; // then flips success without re-signing
    expect(verifyWebhook(obj, hmac)).toBe(false);
  });

  it("rejects when the hmac is empty or the secret is unset", () => {
    const obj = txn();
    expect(verifyWebhook(obj, "")).toBe(false);

    delete process.env.PAYMOB_HMAC_SECRET;
    expect(verifyWebhook(obj, sign(obj))).toBe(false);
  });

  it("does not throw on a length-mismatched hmac (constant-time guard)", () => {
    const obj = txn();
    expect(verifyWebhook(obj, "deadbeef")).toBe(false);
  });
});
