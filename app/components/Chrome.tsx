"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Moon, Sun } from "lucide-react";
import { PROGRAM_ID, REPO_URL, explorerAddress, feedEffectiveLtvBps, feedStatus } from "@/lib/brace";
import { pct1 } from "@/lib/chart";
import { RELAYER_URL } from "@/lib/history";
import { useBoard } from "./BoardProvider";
import { Logo } from "./ui/Logo";
import { CopyField } from "./ui/CopyField";

type Theme = "light" | "dark";

function useTheme() {
  const [theme, setTheme] = useState<Theme | null>(null);
  useEffect(() => {
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr === "light" || attr === "dark") setTheme(attr);
    else setTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }, []);
  const set = useCallback((next: Theme) => {
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("brace-theme", next);
    } catch {
      // Storage can be blocked (private mode); the switch still works for this visit.
    }
    setTheme(next);
  }, []);
  return [theme, set] as const;
}

/** Paper or night shift. Two radios; arrow keys move between them. */
function ThemeSwitch({ id }: { id: string }) {
  const [theme, set] = useTheme();
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      set(theme === "dark" ? "light" : "dark");
    }
  };
  return (
    <div className="theme-sw" role="radiogroup" aria-label="Theme" id={id} onKeyDown={onKey}>
      <button
        type="button"
        role="radio"
        aria-checked={theme === "light"}
        tabIndex={theme === "dark" ? -1 : 0}
        onClick={() => set("light")}
        aria-label="Light theme"
      >
        <Sun size={16} strokeWidth={1.5} aria-hidden />
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={theme === "dark"}
        tabIndex={theme === "dark" ? 0 : -1}
        onClick={() => set("dark")}
        aria-label="Dark theme"
      >
        <Moon size={16} strokeWidth={1.5} aria-hidden />
      </button>
    </div>
  );
}

/** Pages, for the footer. */
const LINKS = [
  { href: "/", label: "Board" },
  { href: "/borrow", label: "Borrow" },
  { href: "/history", label: "History" },
  { href: "/about", label: "About" },
  { href: "/privacy", label: "Privacy" },
];

/** Every section and page, for the top nav and the menu sheet. */
const NAV = [
  {
    href: "/about",
    label: "How it works",
    note: "The oracle, the math and its limits",
    top: true,
  },
  {
    href: "/#ladder",
    label: "Live ladder",
    note: "The Gemini strikes behind the SOL limit",
    top: true,
  },
  {
    href: "/#proof",
    label: "Proof log",
    note: "Each relayer post, on Solana Explorer",
    top: true,
  },
  {
    href: "/#faq",
    label: "FAQ",
    note: "Short answers to the usual questions",
    top: true,
  },
  {
    href: "/history",
    label: "History",
    note: "24 hours of limits, blocks and borrows",
    top: false,
  },
  {
    href: "/borrow",
    label: "Borrow",
    note: "Borrow test USD against devnet SOL",
    top: true,
  },
];
const DOCS_URL = `${REPO_URL}/tree/main/docs`;

function isActive(path: string, href: string) {
  if (href.includes("#")) return false;
  if (href === "/") return path === "/" || path.startsWith("/asset");
  return path === href;
}

/** SOL live limit in the header. Not a live region; the stage carries the announcement. */
function NavReading() {
  const { state, now } = useBoard();
  const ok = state?.kind === "ok" ? state : null;
  const f = ok?.feeds.SOL ?? null;
  const status = ok ? feedStatus(f, ok.config.params, now) : null;
  const limit = ok && f ? feedEffectiveLtvBps(f, ok.config.params, now) : null;
  return (
    <Link href="/asset/SOL" className="nav-reading" aria-label={`SOL live limit ${limit === null ? "not read yet" : pct1(limit)}`}>
      <span className={`dot ${status ?? "none"}`} aria-hidden />
      <span aria-hidden>SOL</span>
      <strong aria-hidden>{limit === null ? "--" : pct1(limit)}</strong>
    </Link>
  );
}

function MenuSheet({ path }: { path: string }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) btn.current?.focus();
  }, []);

  useEffect(() => setOpen(false), [path]);

  useEffect(() => {
    if (!open) return;
    const onPtr = (e: PointerEvent) => {
      const t = e.target as Node;
      if (sheet.current?.contains(t) || btn.current?.contains(t)) return;
      close();
    };
    document.addEventListener("pointerdown", onPtr);
    return () => document.removeEventListener("pointerdown", onPtr);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFirst = () => {
      const first = sheet.current?.querySelector<HTMLElement>("a[href], button");
      first?.focus();
    };
    const focusId = window.setTimeout(focusFirst, 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
      if (e.key === "Tab" && sheet.current) {
        const f = Array.from(sheet.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")).filter((el) => el.tabIndex !== -1);
        const all = [btn.current!, ...f];
        const i = all.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && i <= 0) {
          e.preventDefault();
          all[all.length - 1].focus();
        } else if (!e.shiftKey && i === all.length - 1) {
          e.preventDefault();
          all[0].focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(focusId);
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  return (
    <div className="menu">
      <button
        ref={btn}
        type="button"
        className={`burger${open ? " is-open" : ""}`}
        aria-expanded={open}
        aria-controls="site-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden />
        <span aria-hidden />
      </button>
      <div
        ref={sheet}
        id="site-menu"
        className={`sheet${open ? " is-open" : ""}`}
        aria-hidden={!open}
        inert={!open}
      >
        <div className="sheet-in">
          <nav aria-label="Menu">
            <ol className="sheet-links">
              {NAV.map((l, i) => (
                <li key={l.href} style={{ ["--i" as string]: i }}>
                  <Link href={l.href} aria-current={isActive(path, l.href) ? "page" : undefined} onClick={() => close(false)}>
                    <span className="sl-n">0{i + 1}</span>
                    <span className="sl-t">{l.label}</span>
                    <span className="sl-d">{l.note}</span>
                  </Link>
                </li>
              ))}
            </ol>
            <ul className="sheet-ext">
              <li>
                <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
                  GitHub <ArrowUpRight size={16} aria-hidden />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </li>
              <li>
                <a href={DOCS_URL} target="_blank" rel="noopener noreferrer">
                  Docs <ArrowUpRight size={16} aria-hidden />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </li>
              <li>
                <a href={explorerAddress(PROGRAM_ID.toBase58())} target="_blank" rel="noopener noreferrer">
                  Explorer <ArrowUpRight size={16} aria-hidden />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </li>
            </ul>
          </nav>
          <div className="sheet-foot">
            <div className="sheet-theme">
              <span className="sheet-k" id="theme-menu-label">
                Theme
              </span>
              <ThemeSwitch id="theme-menu" />
            </div>
            <Link href="/borrow" className="btn btn-primary" onClick={() => close(false)}>
              Try a borrow <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Header() {
  const path = usePathname();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <>
      <a href="#main" className="skip">
        Skip to content
      </a>
      <header className={`site-header${scrolled ? " is-scrolled" : ""}`}>
        <div className="wrap hd">
          <Link href="/" className="brand" aria-label="Brace, devnet, home">
            <Logo size={24} />
            <span className="brand-word">Brace</span>
            <span className="net">devnet</span>
          </Link>
          <div className="nav-right">
            <NavReading />
            <MenuSheet path={path} />
          </div>
        </div>
      </header>
    </>
  );
}

export function Footer() {
  const id = PROGRAM_ID.toBase58();
  return (
    <footer className="site-footer">
      <div className="wrap ft">
        <div className="ft-brand">
          <Link href="/" className="brand" aria-label="Brace, home">
            <Logo size={24} />
            <span className="brand-word">Brace</span>
          </Link>
          <p>Lending limits from live prediction market odds. A devnet build for UBC 2026. Test funds only.</p>
        </div>
        <nav className="ft-links" aria-label="Footer">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href}>
              {l.label}
            </Link>
          ))}
          <a href={explorerAddress(id)} target="_blank" rel="noopener noreferrer">
            Explorer <ArrowUpRight size={14} aria-hidden />
          </a>
          <a href={`${RELAYER_URL}/health`} target="_blank" rel="noopener noreferrer">
            Relayer <ArrowUpRight size={14} aria-hidden />
          </a>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
            GitHub <ArrowUpRight size={14} aria-hidden />
          </a>
        </nav>
        <div className="ft-id">
          <CopyField label="Program id" value={id} display={`${id.slice(0, 8)}…${id.slice(-8)}`} />
          <p className="ft-built">Gemini prediction markets, Solana devnet, QuickNode Streams, Cloudflare Workers</p>
        </div>
      </div>
    </footer>
  );
}
