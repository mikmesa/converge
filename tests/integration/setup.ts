// Defaults target the local `supabase start` stack. Override via env for CI.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
process.env.DATABASE_URL ??= "postgresql://converge_server:converge-local-dev@127.0.0.1:54322/postgres";
process.env.TEST_ADMIN_DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
delete process.env.ANTHROPIC_API_KEY;
