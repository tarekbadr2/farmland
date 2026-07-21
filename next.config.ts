import type { NextConfig } from "next";

// Two build targets from one codebase:
//   • default (web / Vercel) — normal Next build, keeps API routes and SSR.
//   • BUILD_TARGET=desktop    — a fully static export bundled inside the Electron
//     app, so the whole app runs locally with no server. Static export can't
//     carry API routes (the desktop build strips src/app/api first) and needs
//     unoptimised images; NEXT_PUBLIC_DESKTOP lets the client skip the service
//     worker, which is pointless when the app is already served from disk.
const desktop = process.env.BUILD_TARGET === "desktop";

const nextConfig: NextConfig = desktop
  ? {
      output: "export",
      trailingSlash: true,
      images: { unoptimized: true },
      env: { NEXT_PUBLIC_DESKTOP: "1" },
    }
  : {};

export default nextConfig;
