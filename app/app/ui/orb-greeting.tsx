"use client";

import { useEffect, useRef, useState } from "react";
import type { Screen } from "./shared";
import { StructorOrb } from "./structor-orb";

const SIZE = 56;
const KEY = "structor-orb-greeted";
let greetedThisLoad = false;
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Once per person per day, in this browser (the greeting must never become noise). The day only counts once the
 * greeting has been seen (markGreeted, at its line): a greeting cut short by a screen change, as the app's own
 * start-up does on a reload, comes back.
 */
function greetedToday(): boolean {
  if (greetedThisLoad) return true;
  try { return localStorage.getItem(KEY) === today(); } catch { return false; }
}
function markGreeted() {
  greetedThisLoad = true; // storage blocked: once per page load is the fallback
  try { localStorage.setItem(KEY, today()); } catch { /* see above */ }
}
const still = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || !!document.querySelector(".product-app.motion-off");
const at = (x: number, y: number, scale = 1) => `translate(${Math.round(x - SIZE / 2)}px, ${Math.round(y - SIZE / 2)}px) scale(${scale})`;

type Phase = "off" | "arrive" | "greet" | "dock";

/**
 * The orb's first-visit greeting on the Preconstruction to-do (NEW_LOOK_DEMO.md §3.1): it floats in while the cards
 * settle, says one line, then shrinks into the Ask Structor button. A click sends it there at once. Never with
 * reduced motion.
 */
export function OrbGreeting({ screen, reduced }: { screen: Screen; reduced: boolean }) {
  const [phase, setPhase] = useState<Phase>("off");
  const box = useRef<HTMLDivElement>(null);
  const spot = useRef({ x: 0, y: 0 });

  // Ask Structor's button and panel are drawn straight into <body>, outside the shell's .new-look: the page root
  // carries the class too, so new-look.css reaches them.
  useEffect(() => { document.documentElement.classList.add("new-look"); return () => document.documentElement.classList.remove("new-look"); }, []);

  useEffect(() => {
    if (screen === "turnover" && !reduced && !still() && !greetedToday()) setPhase("arrive");
  }, [screen, reduced]);
  useEffect(() => { if (screen !== "turnover" && phase !== "off") setPhase("off"); }, [screen, phase]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let timer = 0;
    if (phase === "arrive") {
      const area = document.querySelector(".product-content")?.getBoundingClientRect() ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight);
      const a = { x: area.left + Math.min(area.width * 0.28, 320), y: area.top + 190 };
      const b = { x: Math.max(area.left + SIZE, Math.min(area.left + area.width * 0.56, area.right - SIZE / 2 - 340)), y: area.top + 120 };
      spot.current = b;
      el.animate([
        { transform: at(a.x, a.y + 30, 0.4), opacity: 0 },
        { transform: at(a.x, a.y), opacity: 1, offset: 0.25 },
        { transform: at((a.x + b.x) / 2, Math.min(a.y, b.y) - 50), opacity: 1, offset: 0.62 },
        { transform: at(b.x, b.y), opacity: 1 },
      ], { duration: 1500, easing: "cubic-bezier(.45,.05,.3,1)", fill: "forwards" });
      // Timers, not the animation's `finished`, move it on: a browser that stops drawing frames once nothing
      // changes (seen headless and in a hidden pane) would otherwise leave the orb parked here for good.
      timer = window.setTimeout(() => setPhase("greet"), 1500);
    } else if (phase === "greet") {
      markGreeted();
      timer = window.setTimeout(() => setPhase("dock"), 2600);
    } else if (phase === "dock") {
      const from = spot.current;
      const launcher = document.querySelector<HTMLElement>(".ask-launcher");
      const target = launcher?.querySelector(".structor-orb")?.getBoundingClientRect() ?? launcher?.getBoundingClientRect();
      const to = target ? { x: target.left + target.width / 2, y: target.top + target.height / 2, scale: Math.min(1, target.width / SIZE) } : { x: window.innerWidth - 40, y: window.innerHeight - 40, scale: 0.4 };
      el.animate([
        { transform: at(from.x, from.y), opacity: 1 },
        { transform: at(from.x + (to.x - from.x) * 0.35, Math.min(from.y, to.y) - 30, 0.9), opacity: 1, offset: 0.4 },
        { transform: at(to.x, to.y, to.scale), opacity: 1, offset: 0.92 },
        { transform: at(to.x, to.y, to.scale), opacity: 0 },
      ], { duration: 800, easing: "cubic-bezier(.55,0,.2,1)", fill: "forwards" });
      timer = window.setTimeout(() => {
        launcher?.classList.add("orb-arrived");
        window.setTimeout(() => launcher?.classList.remove("orb-arrived"), 650);
        setPhase("off");
      }, 800);
    }
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (phase === "off") return null;
  return <div ref={box} className={`orb-greeting phase-${phase}`} onClick={() => { markGreeted(); if (phase !== "dock") setPhase("dock"); }}>
    <StructorOrb size={SIZE} mood={phase === "greet" ? "happy" : "idle"} look={false} float={phase === "greet"}/>
    <p className="orb-bubble" role="status">I&apos;m Structor. Ask me anything about this project.</p>
  </div>;
}
