import type { MetadataRoute } from "next";
import { SYMBOLS } from "../lib/brace";
import { SITE_URL } from "../lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["/", "/borrow", "/history", "/about", "/privacy", ...SYMBOLS.map((s) => `/asset/${s}`)];
  return paths.map((p) => ({ url: `${SITE_URL}${p === "/" ? "" : p}` }));
}
