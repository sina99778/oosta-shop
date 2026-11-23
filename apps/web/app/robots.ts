import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";

// The public origin is configured at runtime in the standalone deployment.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const site = siteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/api/products/*/image",
          "/api/product-images/",
          "/api/blog-cover/",
          "/api/blog-media/",
        ],
        disallow: [
          "/en/dashboard",
          "/fa/dashboard",
          "/en/admin",
          "/fa/admin",
          "/en/support",
          "/fa/support",
          "/en/cart",
          "/fa/cart",
          "/en/checkout",
          "/fa/checkout",
          "/en/login",
          "/fa/login",
          "/en/signup",
          "/fa/signup",
          "/api/",
        ],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
    host: site,
  };
}
