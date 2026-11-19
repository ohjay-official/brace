import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

// Regressions: on a tablet the header once showed only some links and no menu button, so History
// was unreachable. Now: below 768px the menu button carries every page; from 768px every page
// link is inline, the menu button is gone, and GitHub, Docs and Explorer sit under More until
// they fit inline.
const css = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf8");
const chrome = readFileSync(join(__dirname, "..", "components", "Chrome.tsx"), "utf8");
const v2 = css.slice(css.indexOf("/* ==== Header v2"));

describe("header reaches every page at every width", () => {
  test("from 768px the inline nav shows and the menu button hides", () => {
    const block = v2.slice(v2.indexOf("@media (min-width: 768px) {"));
    expect(block).toMatch(/\.menu\s*\{\s*display:\s*none\s*!important/);
    expect(block).toMatch(/\.nav-links\s*\{[^}]*display:\s*flex\s*!important/);
  });

  test("no rule after Header v2 hides the inline nav or shows the menu at tablet widths", () => {
    expect(v2).not.toMatch(/\.nav-links\s*\{\s*display:\s*none/);
    expect(v2).not.toMatch(/\.menu\s*\{\s*display:\s*block/);
  });

  test("every page link is rendered inline, not only the top ones", () => {
    expect(chrome).toMatch(/className="nav-links"[\s\S]*?\{NAV\.map\(/);
    expect(chrome).not.toMatch(/NAV\.filter\(\(l\) => l\.top\)/);
  });

  test("GitHub, Docs and Explorer are reachable under More until they fit inline", () => {
    expect(chrome).toMatch(/<details className="nav-more"/);
    expect(v2).toMatch(/@media \(min-width: 1280px\)\s*\{[^@]*\.nav-more\s*\{\s*display:\s*none/);
  });

  test("nav links never fade in from zero opacity", () => {
    expect(css).toMatch(/\.site-header \.nav-links a\s*\{[^}]*animation:\s*none\s*!important/);
  });
});
