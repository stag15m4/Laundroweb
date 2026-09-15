import type { MetadataRoute } from "next";
import { business } from "@/content/site";
import { orFallback } from "@/content/util";

export const dynamic = "force-static";

const routes = ["", "/pricing", "/commercial", "/visit"];

export default function sitemap(): MetadataRoute.Sitemap {
  // Falls back to a relative-looking base until the real domain is set; the
  // sitemap is regenerated on every build, so it self-corrects at launch.
  const base = orFallback(business.siteUrl, "https://example.com").replace(/\/$/, "");
  return routes.map((route) => ({
    url: `${base}${route}/`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: route === "" ? 1 : 0.8,
  }));
}
