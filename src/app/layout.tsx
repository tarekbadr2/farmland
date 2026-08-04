import type { Metadata, Viewport } from "next";
import { Inter, IBM_Plex_Sans_Arabic } from "next/font/google";
import { Providers } from "@/components/providers";
import { MonitoringInit } from "@/components/shell/monitoring-init";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const arabic = IBM_Plex_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://farmland-ruddy.vercel.app";
const SITE_DESC =
  "Enterprise herd management for buffalo dairies: milk, breeding, health, feed, finance and analytics in one system.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Herd OS — Buffalo Farm Management",
    template: "%s · Herd OS",
  },
  description: SITE_DESC,
  openGraph: {
    type: "website",
    siteName: "Herd OS",
    title: "Herd OS — Buffalo Farm Management",
    description: SITE_DESC,
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "Herd OS — Buffalo Farm Management",
    description: SITE_DESC,
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Herd OS" },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#12161c" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <body className={`${inter.variable} ${arabic.variable} antialiased`}>
        <MonitoringInit />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
