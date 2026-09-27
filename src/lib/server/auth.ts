import "server-only";
import { createClient } from "@supabase/supabase-js";
import { ApiError } from "./errors";

/**
 * Verifies the caller's Supabase access token (anonymous session) with the
 * Supabase Auth server and returns the authenticated user id. The token is
 * sent as `Authorization: Bearer <access_token>`.
 */
export async function requireUserId(request: Request): Promise<string> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) throw new ApiError("unauthenticated");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new ApiError("server_misconfigured");
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(match[1]);
  if (error || !data.user) throw new ApiError("unauthenticated");
  return data.user.id;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}
