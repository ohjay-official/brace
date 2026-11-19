import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

// Regression: on a tablet in landscape the inline nav showed only some links and no menu button,
// so History was unreachable from the header. The menu button must show at every width.
const css = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf8");

describe("header reaches every page at every width", () => {
  test("the last word on .menu is display:block !important, outside any media query", () => {
    const rules = [...css.matchAll(/(^|\n)\.menu\s*\{([^}]*)\}/g)];
    expect(rules.length).toBeGreaterThan(0);
    expect(rules[rules.length - 1][2]).toMatch(/display:\s*block\s*!important/);
    expect(css).not.toMatch(/\.menu\s*\{\s*display:\s*none\s*!important/);
  });

  test("nav links never fade in from zero opacity", () => {
    expect(css).toMatch(/\.site-header \.nav-links a\s*\{[^}]*animation:\s*none\s*!important/);
  });
});
