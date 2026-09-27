"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client using ONLY the public URL + publishable key.
 *
 * Identity is an invisible anonymous Supabase Auth session persisted in
 * localStorage. It is created the first time someone creates or joins a
 * decision, and restored on refresh / return visits on the same device.
 * If storage is cleared the session is lost; there is deliberately no
 * recovery mechanism in V1 (§36A.10, §40.13).
 */

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured");
  client = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: "converge-session" },
  });
  return client;
}

export class SessionUnavailableError extends Error {}

/** Returns the current session's access token, creating an anonymous one if needed. */
export async function ensureSession(): Promise<string> {
  const sb = supabase();
  const { data } = await sb.auth.getSession();
  if (data.session) return data.session.access_token;
  const { data: created, error } = await sb.auth.signInAnonymously();
  if (error || !created.session) throw new SessionUnavailableError(error?.message ?? "no session");
  return created.session.access_token;
}

/** Existing session only — never creates one (used for read-only checks). */
export async function currentAccessToken(): Promise<string | null> {
  const { data } = await supabase().auth.getSession();
  return data.session?.access_token ?? null;
}
