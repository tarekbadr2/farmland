import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://farmland-ruddy.vercel.app";

/**
 * Let crawlers index the marketing surface (the landing page + legal), but keep
 * the authenticated app and API out of search results.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/welcome", "/legal"],
        disallow: [
          "/api/",
          "/login",
          "/desktop-signin",
          "/invite/",
          "/dashboard",
          "/animals",
          "/animal",
          "/calves",
          "/breeding",
          "/health",
          "/milk",
          "/feed",
          "/meat",
          "/production",
          "/tasks",
          "/inventory",
          "/employees",
          "/finance",
          "/purchasing",
          "/accounting",
          "/assets",
          "/partners",
          "/reports",
          "/analytics",
          "/activity",
          "/assistant",
          "/settings",
          "/map",
          "/notifications",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
