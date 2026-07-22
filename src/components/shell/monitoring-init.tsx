"use client";

import * as React from "react";
import { initMonitoring } from "@/lib/monitoring";

/** Starts error tracking on mount (no-op without a DSN). */
export function MonitoringInit() {
  React.useEffect(() => {
    initMonitoring();
  }, []);
  return null;
}
