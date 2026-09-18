"use client";

import { useEffect, useState } from "react";

/**
 * Draft state for a preview screen, persisted per browser under `structor-ui-<key>`.
 * Storage failures are tolerated: the draft stays editable for the session either way.
 */
export function useLocalDraft<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`structor-ui-${key}`);
      if (saved) setValue(JSON.parse(saved) as T);
    } catch { /* A fresh draft remains usable when storage is unavailable. */ }
    setReady(true);
  }, [key]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(`structor-ui-${key}`, JSON.stringify(value));
    } catch { /* Keep the current session editable when storage is full. */ }
  }, [key, ready, value]);

  return [value, setValue] as const;
}
