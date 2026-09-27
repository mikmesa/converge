"use client";

/**
 * Per-device draft of an unsubmitted form, so a refresh or accidental
 * back-navigation doesn't wipe half-filled answers. This is a per-viewer
 * convenience only: it never leaves this browser and is cleared on submit.
 * Storage can be unavailable (private mode, blocked site data) — every access
 * is guarded and the form works without it.
 */

const PREFIX = "converge-draft:";

export function loadDraft<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveDraft<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable — drafts are best-effort */
  }
}

export function clearDraft(key: string): void {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}
