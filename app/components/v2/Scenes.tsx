"use client";

import { useEffect } from "react";

/**
 * Scene choreography. Marks <html> with .motion when motion is allowed, then
 * sets data-in on every [data-scene] once a fifth of it is on screen, so CSS can
 * stage that section's entrance. A data attribute, not a class, so React
 * re-renders never wipe it. Reduced motion and no-JS see every scene finished.
 */
export function Scenes() {
  useEffect(() => {
    const root = document.documentElement;
    // Automated browsers (screenshot bots, AI screeners) get every scene finished, so full-page captures are never blank.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof IntersectionObserver === "undefined" || navigator.webdriver) {
      root.classList.remove("motion");
      return;
    }
    root.classList.add("motion");
    (window as unknown as { __scenes?: number }).__scenes = 1;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          (e.target as HTMLElement).dataset.in = "1";
          io.unobserve(e.target);
        }
      },
      { threshold: 0.12 },
    );
    const watch = () => document.querySelectorAll<HTMLElement>("[data-scene]:not([data-in])").forEach((el) => io.observe(el));
    watch();
    // Scenes mounted later (data arriving, menu opening) are picked up too.
    let queued = false;
    const mo = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        watch();
      });
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);
  return null;
}
