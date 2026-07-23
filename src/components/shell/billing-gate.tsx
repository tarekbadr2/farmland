"use client";

import * as React from "react";
import { useAuth } from "@/lib/auth/provider";
import { useBilling } from "@/hooks/use-billing";
import { isBillingEnforced } from "@/lib/billing/status";
import { IS_DESKTOP } from "@/lib/platform";
import { Paywall } from "@/components/billing/paywall";
import { PremiumGate } from "@/components/billing/premium-gate";

/**
 * Hard billing gate. When enforcement is on and the farm's access is blocked
 * (lapsed trial / canceled / never subscribed), it replaces the app with a
 * paywall. On the desktop app that's the PremiumGate, which sends the user to
 * the website to subscribe (payments live there); on the web it's the in-app
 * Paywall with the plan picker (they can pay right here). Enforcement is off by
 * default, so until Paymob is wired this never blocks — the trial banner just
 * nudges. Demo/bypass and still-loading states pass straight through.
 */
export function BillingGate({ children }: { children: React.ReactNode }) {
  const { bypassed } = useAuth();
  const { entitlement, loading } = useBilling();

  if (!bypassed && !loading && isBillingEnforced() && entitlement.blocked) {
    return IS_DESKTOP ? (
      <PremiumGate entitlement={entitlement} />
    ) : (
      <Paywall entitlement={entitlement} />
    );
  }
  return <>{children}</>;
}
