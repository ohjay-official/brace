import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import manifest from "../app/manifest";
import robots from "../app/robots";
import sitemap from "../app/sitemap";
import { SITE_URL } from "./site";

const root = join(__dirname, "..");

describe("launch basics", () => {
  test("site url is the short vercel alias over https", () => {
    expect(SITE_URL).toBe("https://braced.vercel.app");
  });

  test("sitemap lists every public route on the site url, and never the dev route", () => {
    const urls = sitemap().map((e) => e.url);
    for (const p of ["", "/borrow", "/history", "/about", "/privacy", "/asset/SOL", "/asset/BTC", "/asset/ETH", "/asset/XRP", "/asset/ZEC"]) {
      expect(urls).toContain(`${SITE_URL}${p}`);
    }
    expect(urls.some((u) => u.includes("dev-preview"))).toBe(false);
  });

  test("robots points at the sitemap and keeps the dev route out", () => {
    const r = robots();
    expect(r.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
    expect(JSON.stringify(r.rules)).toContain("/dev-preview");
  });

  test("every manifest icon exists in public at its stated size", () => {
    for (const icon of manifest().icons ?? []) {
      const file = join(root, "public", icon.src);
      expect(existsSync(file)).toBe(true);
      const png = readFileSync(file);
      const [w, h] = (icon.sizes ?? "").split("x").map(Number);
      expect(png.readUInt32BE(16)).toBe(w);
      expect(png.readUInt32BE(20)).toBe(h);
    }
  });

  test("brand files Next serves from app/ exist and the share image is 1200x630", () => {
    for (const f of ["icon.svg", "favicon.ico", "apple-icon.png", "opengraph-image.jpg", "twitter-image.jpg"]) {
      expect(existsSync(join(root, "app", f))).toBe(true);
    }
    const jpg = readFileSync(join(root, "app", "opengraph-image.jpg"));
    // Find the SOF0/SOF2 marker and read height and width.
    let i = 2;
    let size: [number, number] | null = null;
    while (i < jpg.length) {
      const marker = jpg.readUInt16BE(i);
      const len = jpg.readUInt16BE(i + 2);
      if (marker === 0xffc0 || marker === 0xffc2) {
        size = [jpg.readUInt16BE(i + 7), jpg.readUInt16BE(i + 5)];
        break;
      }
      i += 2 + len;
    }
    expect(size).toEqual([1200, 630]);
  });
});

describe("per page metadata", () => {
  test("pageMeta keeps the share image and gives each page its own text", async () => {
    const { pageMeta } = await import("./site");
    const m = pageMeta("Privacy", "What Brace touches.", "/privacy");
    expect(m.alternates.canonical).toBe("/privacy");
    expect(m.openGraph.images[0]).toMatchObject({ url: "/opengraph-image.jpg", width: 1200, height: 630 });
    expect(m.twitter.images[0]).toMatchObject({ url: "/twitter-image.jpg" });
    expect(m.openGraph.title).toBe("Privacy | Brace");
  });
});
