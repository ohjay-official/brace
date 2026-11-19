"use client";

import { useEffect } from "react";

/**
 * Adds a one-time fade-up to blocks marked [data-reveal] that start below the
 * fold. Content is never hidden before this runs (no-JS and reduced motion see
 * everything), and blocks already on screen are left alone.
 */
export function RevealOnScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || navigator.webdriver) return;
    if (typeof IntersectionObserver === "undefined") return;
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]:not(.rv-done)"));
    const below = els.filter((el) => el.getBoundingClientRect().top > window.innerHeight * 0.92);
    below.forEach((el) => el.classList.add("rv-wait"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          el.classList.add("rv-in");
          el.classList.remove("rv-wait");
          io.unobserve(el);
          setTimeout(() => el.classList.add("rv-done"), 700);
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    below.forEach((el) => io.observe(el));
    // Safety: never leave a block hidden.
    const safety = setTimeout(() => below.forEach((el) => el.classList.remove("rv-wait")), 6000);
    return () => {
      io.disconnect();
      clearTimeout(safety);
      below.forEach((el) => el.classList.remove("rv-wait"));
    };
  }, []);
  return null;
}
