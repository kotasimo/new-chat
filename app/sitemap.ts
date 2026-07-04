import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://yosoku-cup.vercel.app";

const routes = [
  "",
  "/guide",
  "/history",
  "/ranking",
  "/transactions",
  "/terms",
  "/privacy",
  "/contact",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return routes.map((route) => ({
    url: `${siteUrl}${route}`,
    lastModified: now,
    changeFrequency: route === "" ? "hourly" : "weekly",
    priority: route === "" ? 1 : 0.7,
  }));
}
