"use client";

import { useReducedMotion, usePrevious } from "./hooks";

const DIGITS = "0123456789";

/**
 * Shows a formatted value (for example "69.6%"). When a new real reading
 * arrives, each digit rolls to its new place. The first render shows the
 * value directly: it never counts up from zero. Screen readers get the plain
 * text once; nothing here is an aria-live region. The rolling digits are drawn
 * from data-ch with CSS, so page text (and bots reading it) holds the value once.
 */
export function RollingNumber({ value, className = "" }: { value: string; className?: string }) {
  const reduced = useReducedMotion();
  const prev = usePrevious(value);
  const dir = prev && prev !== value ? (parseFloat(value) > parseFloat(prev) ? "up" : parseFloat(value) < parseFloat(prev) ? "down" : "") : "";
  const chars = value.split("");
  return (
    <span className={`roll ${className}`} data-dir={dir || undefined}>
      <span className="sr-only">{value}</span>
      <span className="roll-vis" aria-hidden>
        {chars.map((c, i) => {
          const d = DIGITS.indexOf(c);
          if (d < 0 || reduced) {
            return (
              <span key={`${i}-${c}`} className="roll-ch" data-ch={c} />
            );
          }
          return (
            <span key={`${i}-${chars.length}`} className="roll-col">
              <span className="roll-strip" style={{ transform: `translateY(${-d * 10}%)` }}>
                {DIGITS.split("").map((n) => (
                  <span key={n} data-ch={n} />
                ))}
              </span>
              <span className="roll-ghost" data-ch={c} />
            </span>
          );
        })}
      </span>
    </span>
  );
}
