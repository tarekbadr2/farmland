import { DesktopSidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { MobileTabBar } from "@/components/shell/mobile-tabbar";
import { ServiceWorkerRegistrar } from "@/components/shell/service-worker";
import { AuthGuard } from "@/components/shell/auth-guard";
import { TourProvider } from "@/components/shell/tour";
import { SampleFarmBanner } from "@/components/shell/sample-banner";
import { BillingGate } from "@/components/shell/billing-gate";
import { WebGate } from "@/components/shell/web-gate";
import { WebDownloadBanner } from "@/components/shell/web-download-banner";
import { TrialBanner } from "@/components/billing/trial-banner";
import { DesktopAlerts } from "@/components/shell/desktop-alerts";
import { DesktopIntegration } from "@/components/shell/desktop-integration";
import { RouteGuard } from "@/lib/auth/guard";
import type { Metadata } from "next";

// The authenticated app is private — keep every route in this group out of
// search indexes (the marketing pages stay indexable).
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <BillingGate>
        <TourProvider>
          <div className="flex min-h-screen bg-background">
            <DesktopSidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <Topbar />
              <WebDownloadBanner />
              <TrialBanner />
              <SampleFarmBanner />
              <main className="flex-1 px-3 pb-24 pt-4 sm:px-5 sm:pb-8 lg:px-7">
                <div className="mx-auto w-full max-w-[1500px]">
                  <WebGate>
                    <RouteGuard>{children}</RouteGuard>
                  </WebGate>
                </div>
              </main>
            </div>
            <MobileTabBar />
            <ServiceWorkerRegistrar />
            <DesktopAlerts />
            <DesktopIntegration />
          </div>
        </TourProvider>
      </BillingGate>
    </AuthGuard>
  );
}
