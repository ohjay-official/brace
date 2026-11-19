import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

// One header at every width (Oh-Jay's call): logo, devnet tag, SOL pill and the menu button.
// Every page is reached through the numbered frosted menu, which opens at every width.
const css = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf8");
const chrome = readFileSync(join(__dirname, "..", "components", "Chrome.tsx"), "utf8");
const v3 = css.slice(css.indexOf("/* ==== Header v3"));

describe("one header at every width", () => {
  test("Header v3 is the last header block and shows the menu button with no media query", () => {
    expect(v3.length).toBeGreaterThan(0);
    expect(v3).not.toMatch(/@media/);
    expect(v3).toMatch(/\.menu\s*\{\s*display:\s*block\s*!important/);
    expect(v3).toMatch(/\.site-header \.nav-reading\s*\{\s*display:\s*inline-flex\s*!important/);
    expect(v3).toMatch(/\.site-header \.brand \.net\s*\{\s*display:\s*inline\s*!important/);
  });

  test("the header renders no inline links and no More dropdown", () => {
    const header = chrome.slice(chrome.indexOf("export function Header"), chrome.indexOf("export function Footer"));
    expect(header).not.toMatch(/nav-links|nav-more|MoreLinks/);
    expect(header).toMatch(/<MenuSheet/);
  });

  test("the menu sheet lists every page", () => {
    for (const label of ["How it works", "Live ladder", "Proof log", "FAQ", "History", "Borrow"]) expect(chrome).toContain(`label: "${label}"`);
  });

  test("nav and desktop layout never depend on hover or pointer queries (iPad reports hover: none)", () => {
    const blocks = [...css.matchAll(/@media[^{]*\((?:hover|pointer):[^)]*\)[^{]*\{([\s\S]*?)\n\}/g)].map((m) => m[1]);
    for (const b of blocks) expect(b).not.toMatch(/nav-links|\.menu|\.nav-more|grid-template-columns|display:\s*none/);
  });
});
