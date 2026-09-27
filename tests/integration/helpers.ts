import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import postgres from "postgres";

export interface Person {
  client: SupabaseClient;
  userId: string;
  accessToken: string;
  name: string;
}

let admin: postgres.Sql | null = null;
/** Superuser connection — ONLY for test setup and assertions. */
export function adminSql(): postgres.Sql {
  admin ??= postgres(process.env.TEST_ADMIN_DATABASE_URL!, { max: 2, onnotice: () => {} });
  return admin;
}

export async function person(name: string): Promise<Person> {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.session) throw error ?? new Error("no session");
  return { client, userId: data.user!.id, accessToken: data.session.access_token, name };
}

/** A client with no session at all (role `anon`). */
export function anonymousNoSession(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function rpc<T = unknown>(p: Person, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await p.client.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export async function createDecision(organizer: Person, limit: number, name = "Test trip"): Promise<string> {
  return rpc<string>(organizer, "create_decision", {
    p_name: name,
    p_participant_limit: limit,
    p_organizer_name: organizer.name,
  });
}

export async function join(p: Person, decisionId: string): Promise<string> {
  return rpc<string>(p, "join_decision", { p_decision_id: decisionId, p_name: p.name });
}

export interface ResponseInput {
  preferred_date_ranges?: { start: string; end: string }[] | null;
  ideal_budget?: number | null;
  max_budget?: number | null;
  preferred_types?: string[];
  avoided_types?: string[];
  dealbreaker_types?: string[];
  wanted_activities?: string[];
  avoided_activities?: string[];
  notes?: string | null;
}

export async function submit(p: Person, decisionId: string, response: ResponseInput = {}) {
  return rpc<{ response_id: string; status: string }>(p, "submit_response", {
    p_decision_id: decisionId,
    p_response: response,
  });
}

export async function decisionRow(id: string) {
  const rows = await adminSql()`select * from public.decisions where id = ${id}`;
  return rows[0];
}

export async function optionId(slug: string): Promise<string> {
  const rows = await adminSql()`select id from public.options where slug = ${slug}`;
  return rows[0].id as string;
}

/** Sets up a group where everyone has joined; nobody has submitted. */
export async function group(size: number, limit = size): Promise<{ decisionId: string; people: Person[] }> {
  const people = await Promise.all(
    Array.from({ length: size }, (_, i) => person(`P${i + 1}`)),
  );
  const decisionId = await createDecision(people[0], limit);
  for (const p of people.slice(1)) await join(p, decisionId);
  return { decisionId, people };
}

export async function expectRpcError(promise: Promise<unknown>, code: string) {
  try {
    await promise;
  } catch (e) {
    if (!(e as Error).message.includes(code)) {
      throw new Error(`Expected error "${code}", got "${(e as Error).message}"`);
    }
    return;
  }
  throw new Error(`Expected error "${code}", but the call succeeded`);
}
