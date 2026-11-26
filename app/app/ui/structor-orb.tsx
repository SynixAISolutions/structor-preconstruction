"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import "./structor-orb.css";

export type OrbMood = "idle" | "happy" | "thinking";

/**
 * Ask Structor's face (NEW_LOOK_DEMO.md §3): an orange orb with two pill eyes. Idle it blinks and its eyes follow
 * the pointer a little; happy, the eyes turn into arches; thinking, they glance aside while the orb pulses.
 * Decorative only (aria-hidden): whatever it accompanies says what is happening in words.
 */
export function StructorOrb({ size = 40, mood = "idle", look = true, float = false, className = "" }: {
  size?: number; mood?: OrbMood; look?: boolean; float?: boolean; className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !look || mood !== "idle" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        const d = Math.hypot(dx, dy) || 1, reach = Math.min(1, d / 320) * 0.07 * size;
        el.style.setProperty("--look-x", `${((dx / d) * reach).toFixed(2)}px`);
        el.style.setProperty("--look-y", `${((dy / d) * reach).toFixed(2)}px`);
      });
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => { window.removeEventListener("pointermove", move); cancelAnimationFrame(frame); el.style.removeProperty("--look-x"); el.style.removeProperty("--look-y"); };
  }, [look, mood, size]);
  return <span ref={ref} className={`structor-orb mood-${mood}${float ? " is-floating" : ""}${className ? ` ${className}` : ""}`} style={{ "--orb": `${size}px` } as CSSProperties} aria-hidden="true">
    <i className="orb-eye"/><i className="orb-eye"/>
  </span>;
}
