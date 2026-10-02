"use client";

import { useCallback, useEffect, useState } from "react";
import {
  SampleRefreshError, deleteSampleBackup, keepMyData, listSampleBackups, loadUpdatedSample, markFreshBrowser,
  restoreSampleBackup, sampleBackupFile, sampleStatus, type SampleBackup, type SampleStatus,
} from "./sample-refresh";

/**
 * The offer to load the updated Jelleff sample, and the backups it leaves. `status` is null until
 * mounted (or when storage is unavailable). Loading or restoring reloads the page so every screen
 * reads its data again; the others return an error message or null.
 */
export function useSampleRefresh() {
  const [status, setStatus] = useState<SampleStatus | null>(null);
  const [backups, setBackups] = useState<SampleBackup[]>([]);
  const read = useCallback(() => {
    try { markFreshBrowser(localStorage); setStatus(sampleStatus(localStorage)); setBackups(listSampleBackups(localStorage)); }
    catch { setStatus(null); setBackups([]); }
  }, []);
  useEffect(read, [read]);

  const attempt = useCallback((action: () => void, reload: boolean): string | null => {
    try { action(); } catch (error) { if (error instanceof SampleRefreshError) return error.message; return "Browser storage is unavailable."; }
    if (reload) window.location.reload(); else read();
    return null;
  }, [read]);

  return {
    status, backups,
    /** Backs up this browser's Jelleff data, then loads the current sample. */
    loadUpdatedSample: () => attempt(() => loadUpdatedSample(localStorage), true),
    /** Keeps this browser's data and stops offering this sample version. */
    keepMyData: () => attempt(() => keepMyData(localStorage), false),
    restore: (key: string) => attempt(() => restoreSampleBackup(localStorage, key), true),
    remove: (key: string) => attempt(() => deleteSampleBackup(localStorage, key), false),
    /** The backup as a file for downloadText(name, text). */
    file: (key: string): { name: string; text: string } | null => { try { return sampleBackupFile(localStorage, key); } catch { return null; } },
  };
}
