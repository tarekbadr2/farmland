"use client";

import * as React from "react";
import { useAuth } from "@/lib/auth/provider";
import { useBilling } from "@/hooks/use-billing";
import { isBillingEnforced } from "@/lib/billing/status";
import { Paywall } from "@/components/billing/paywall";

/**
 * Hard billing gate. When enforcement is on and the farm's access is blocked
 * (lapsed trial / canceled), it replaces the app with the paywall. Enforcement
 * is off by default, so until Paymob is wired this never blocks — the trial
 * banner just nudges. Demo/bypass and still-loading states pass straight through.
 */
export function BillingGate({ children }: { children: React.ReactNode }) {
  const { bypassed } = useAuth();
  const { entitlement, loading } = useBilling();

  if (!bypassed && !loading && isBillingEnforced() && entitlement.blocked) {
    return <Paywall entitlement={entitlement} />;
  }
  return <>{children}</>;
}
