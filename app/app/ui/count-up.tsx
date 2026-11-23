"use client";

import { useEffect, useRef, useState } from "react";

const still = () => typeof window === "undefined"
  || !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  || !!document.querySelector(".product-app.motion-off");

/**
 * A headline number that counts up to its value (NEW_LOOK_DEMO.md §4): from 0 the first time, then from the number
 * shown to the new one when it changes. With reduced motion (the system setting or Settings → Appearance) it shows
 * the value at once. Only for the few headline numbers on home screens, never in tables.
 */
export function CountUp({ value, duration = 1000, format = n => n.toLocaleString() }: { value: number; duration?: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(0);
  const now = useRef(0); // what is on screen, so a new value counts on from there
  useEffect(() => {
    const show = (n: number) => { now.current = n; setShown(n); };
    const start = now.current;
    if (!Number.isFinite(value) || start === value || still()) { show(value); return; }
    let frame = 0;
    const began = performance.now();
    const tick = (at: number) => {
      const t = Math.min(1, (at - began) / duration), eased = 1 - Math.pow(1 - t, 3);
      show(Math.round(start + (value - start) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);
  return <>{format(shown)}</>;
}
