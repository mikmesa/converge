-- Pin search_path on helper and trigger functions (Supabase linter 0011).
-- They reference only pg_catalog built-ins, so an empty search_path is safe.
alter function public.converge_option_types() set search_path = '';
alter function public.converge_activities() set search_path = '';
alter function public.converge_valid_date_ranges(jsonb, int) set search_path = '';
alter function public.converge_forbid_change() set search_path = '';
alter function public.converge_decisions_transition_guard() set search_path = '';
