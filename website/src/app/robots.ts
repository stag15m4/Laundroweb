import type { MetadataRoute } from "next";
import { business } from "@/content/site";
import { orUndefined } from "@/content/util";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = orUndefined(business.siteUrl);
  return {
    rules: { userAgent: "*", allow: "/" },
    ...(siteUrl ? { sitemap: `${siteUrl}/sitemap.xml` } : {}),
  };
}
