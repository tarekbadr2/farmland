"use client";

import * as React from "react";
import { useFarm } from "./use-farm-data";
import { resolveEntitlement, type Entitlement } from "@/lib/billing/status";
import type { Farm } from "@/core/domain/types";

/** Billing entitlement for the active farm, derived from the farm document. */
export function useBilling(): {
  entitlement: Entitlement;
  farm: Farm | undefined;
  loading: boolean;
} {
  const { data: farm, isLoading } = useFarm();
  const entitlement = React.useMemo(() => resolveEntitlement(farm), [farm]);
  return { entitlement, farm, loading: isLoading };
}
