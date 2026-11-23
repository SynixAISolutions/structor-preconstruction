"use client";

import { useLayoutEffect, useState, type MouseEvent } from "react";
import { flushSync } from "react-dom";
import { Moon, Sun } from "lucide-react";

const THEME_KEY = "structor-color-theme";
type Theme = "light" | "dark";

function savedTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function ThemeToggle({ reduced }: { reduced: boolean }) {
  const [theme, setTheme] = useState<Theme>("light");

  useLayoutEffect(() => {
    const saved = savedTheme();
    document.documentElement.dataset.structorTheme = saved;
    setTheme(saved);
  }, []);

  function toggle(event: MouseEvent<HTMLButtonElement>) {
    const root = document.documentElement;
    if (root.classList.contains("theme-reveal")) return;

    const next = theme === "light" ? "dark" : "light";
    const apply = () => {
      root.dataset.structorTheme = next;
      setTheme(next);
      try { localStorage.setItem(THEME_KEY, next); } catch { /* The current tab still changes appearance. */ }
    };

    if (reduced || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !document.startViewTransition) {
      apply();
      return;
    }

    const button = event.currentTarget.getBoundingClientRect();
    const x = button.left + button.width / 2;
    const y = button.top + button.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    root.style.setProperty("--nl-reveal-origin", `${x}px ${y}px`);
    root.style.setProperty("--nl-reveal-radius", `${Math.ceil(radius)}px`);
    root.classList.add("theme-reveal");

    // Allow the snapshot to finish even if a background tab never paints the reveal.
    let pending = true;
    function clear() {
      if (!pending) return;
      pending = false;
      window.clearTimeout(timer);
      root.classList.remove("theme-reveal");
      root.style.removeProperty("--nl-reveal-origin");
      root.style.removeProperty("--nl-reveal-radius");
    }
    let timer = window.setTimeout(clear, 1500);
    try {
      const transition = document.startViewTransition(() => flushSync(apply));
      void transition.ready.then(() => {
        if (!pending) return;
        window.clearTimeout(timer);
        timer = window.setTimeout(clear, 520);
      }, clear);
    } catch {
      clear();
      apply();
    }
  }

  const dark = theme === "dark";
  return <button type="button" className="theme-toggle" aria-label="Dark mode" aria-pressed={dark}
    title={dark ? "Switch to light mode" : "Switch to dark mode"} onClick={toggle}>
    {dark ? <Sun size={16} aria-hidden="true"/> : <Moon size={16} aria-hidden="true"/>}
  </button>;
}
