import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://farmland-ruddy.vercel.app";

/** Public, indexable pages only — the app itself is behind auth and noindex. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/welcome`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/legal/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/legal/privacy`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
