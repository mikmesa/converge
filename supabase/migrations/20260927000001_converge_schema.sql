-- =============================================================================
-- Converge — schema, constraints, RLS, atomic RPCs
--
-- Security model (see docs/security.md):
--   * Participants are anonymous Supabase Auth users (role `authenticated`).
--   * Clients can SELECT only their OWN participant row, OWN responses and
--     OWN vote. There is NO client SELECT on decisions, options, other
--     participants' rows, other responses or other votes — ever.
--   * All client writes go through SECURITY DEFINER RPCs that derive identity
--     from auth.uid(). No RPC accepts a participant_id, so impersonation
--     cannot even be expressed.
--   * Cross-participant computation happens only in the Next.js server,
--     connected as the least-privilege `converge_server` role. It returns
--     sanitized, categorical output. That server path is the single privacy
--     boundary for cross-participant data (§36A.2).
--   * Every multi-condition state transition takes a row lock on the
--     decision (SELECT … FOR UPDATE) inside one transaction (§40.14).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Taxonomies (kept in sync with src/lib/domain/taxonomy.ts by a unit test)
-- ---------------------------------------------------------------------------
create or replace function public.converge_option_types()
returns text[] language sql immutable parallel safe
as $$ select array['beach','hills','high_mountains','heritage','backwaters','wildlife','adventure']::text[] $$;

create or replace function public.converge_activities()
returns text[] language sql immutable parallel safe
as $$ select array['beaches_swimming','water_sports','trekking','rafting','safari','forts_palaces','food_markets','nightlife','yoga_wellness','cafes','boating','camping','scenic_drives','plantations','photography']::text[] $$;

-- Validates [{ "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }, ...]
create or replace function public.converge_valid_date_ranges(r jsonb, max_items int)
returns boolean language plpgsql immutable
as $$
declare
  e jsonb;
  s date;
  t date;
begin
  if r is null then return true; end if;
  if jsonb_typeof(r) <> 'array' then return false; end if;
  if jsonb_array_length(r) < 1 or jsonb_array_length(r) > max_items then return false; end if;
  for e in select value from jsonb_array_elements(r) loop
    if jsonb_typeof(e) <> 'object' then return false; end if;
    if (select count(*) from jsonb_object_keys(e)) <> 2 then return false; end if;
    if jsonb_typeof(e -> 'start') is distinct from 'string'
       or jsonb_typeof(e -> 'end') is distinct from 'string' then
      return false;
    end if;
    if (e ->> 'start') !~ '^\d{4}-\d{2}-\d{2}$' or (e ->> 'end') !~ '^\d{4}-\d{2}-\d{2}$' then
      return false;
    end if;
    begin
      s := to_date(e ->> 'start', 'YYYY-MM-DD');
      t := to_date(e ->> 'end', 'YYYY-MM-DD');
    exception when others then
      return false;
    end;
    -- to_date is lenient (2026-02-30 → 2026-03-02); require a round trip.
    if to_char(s, 'YYYY-MM-DD') <> (e ->> 'start') or to_char(t, 'YYYY-MM-DD') <> (e ->> 'end') then
      return false;
    end if;
    if s > t then return false; end if;
  end loop;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.options (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null,
  type text not null check (type = any (public.converge_option_types())),
  cost_per_person int not null check (cost_per_person > 0),
  availability_windows jsonb not null
    check (public.converge_valid_date_ranges(availability_windows, 20)),
  description text not null,
  typical_duration_days int check (typical_duration_days between 1 and 30),
  activities text[] not null default '{}' check (activities <@ public.converge_activities()),
  tags text[] not null default '{}',
  -- Ranking tie-break rule 5 (§36A.7): explicit, unique, manually curated.
  sort_order int not null unique
);

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id),
  status text not null default 'collecting'
    check (status in ('collecting', 'revealed', 'decided')),
  participant_limit int not null check (participant_limit between 3 and 8),
  travel_year int check (travel_year between 2026 and 2035),
  revealed_at timestamptz,
  decided_at timestamptz,
  outcome text check (outcome in ('selected', 'tied_no_decision')),
  final_choice_option_id uuid references public.options (id),
  vote_tally jsonb,
  tiebreak_reason text check (tiebreak_reason in ('majority', 'strong_fit', 'fewest_conflict')),
  check ((status = 'collecting') = (revealed_at is null)),
  check ((status = 'decided') = (decided_at is not null)),
  check ((status = 'decided') = (outcome is not null)),
  check ((outcome = 'selected') is not false or final_choice_option_id is null),
  check (outcome is distinct from 'selected' or final_choice_option_id is not null),
  check (outcome is distinct from 'selected' or tiebreak_reason is not null)
);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references public.decisions (id),
  auth_user_id uuid not null references auth.users (id),
  -- Names are intentionally NOT unique: two people can share a name.
  name text not null check (char_length(name) between 1 and 40),
  is_organizer boolean not null default false,
  joined_at timestamptz not null default clock_timestamp(),
  join_seq bigint generated always as identity,
  unique (decision_id, auth_user_id)
);
-- At most one organizer per decision; create_decision guarantees at least one.
create unique index participants_one_organizer
  on public.participants (decision_id) where is_organizer;
create index participants_decision on public.participants (decision_id);

create table public.responses (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants (id),
  submitted_at timestamptz not null default clock_timestamp(),
  -- Monotonic tie-break so "latest response" is always well defined.
  seq bigint generated always as identity,
  preferred_date_ranges jsonb
    check (public.converge_valid_date_ranges(preferred_date_ranges, 5)),
  ideal_budget int check (ideal_budget between 1 and 10000000),
  max_budget int check (max_budget between 1 and 10000000),
  preferred_types text[] not null default '{}'
    check (preferred_types <@ public.converge_option_types()),
  avoided_types text[] not null default '{}'
    check (avoided_types <@ public.converge_option_types()),
  dealbreaker_types text[] not null default '{}'
    check (dealbreaker_types <@ public.converge_option_types()),
  wanted_activities text[] not null default '{}'
    check (wanted_activities <@ public.converge_activities()),
  avoided_activities text[] not null default '{}'
    check (avoided_activities <@ public.converge_activities()),
  notes text check (char_length(notes) <= 1000),
  -- D6: budgets are both-or-neither, and ideal ≤ max.
  check ((ideal_budget is null) = (max_budget is null)),
  check (ideal_budget is null or ideal_budget <= max_budget),
  -- A type can be in at most one of preferred / avoided / dealbreaker.
  check (not (preferred_types && avoided_types)),
  check (not (preferred_types && dealbreaker_types)),
  check (not (avoided_types && dealbreaker_types)),
  check (not (wanted_activities && avoided_activities))
);
create index responses_participant_latest on public.responses (participant_id, seq desc);

create table public.votes (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references public.decisions (id),
  participant_id uuid not null references public.participants (id),
  option_id uuid not null references public.options (id),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (decision_id, participant_id)
);

-- Cached AI explanations, keyed by a hash of the sanitized input they were
-- generated from. Contains only derived prose. Server-only.
create table public.explanation_cache (
  decision_id uuid not null references public.decisions (id),
  input_hash text not null,
  content jsonb not null,
  created_at timestamptz not null default now(),
  primary key (decision_id, input_hash)
);

-- ---------------------------------------------------------------------------
-- Guard triggers (defense in depth — they apply to every writer)
-- ---------------------------------------------------------------------------
create or replace function public.converge_forbid_change()
returns trigger language plpgsql
as $$
begin
  raise exception 'immutable_row' using errcode = 'P0001',
    detail = format('%s on %s is not allowed', tg_op, tg_table_name);
end;
$$;

-- Responses are append-only (§19): never overwrite, never delete.
create trigger responses_append_only
  before update or delete on public.responses
  for each row execute function public.converge_forbid_change();
create trigger participants_immutable
  before update or delete on public.participants
  for each row execute function public.converge_forbid_change();
create trigger decisions_no_delete
  before delete on public.decisions
  for each row execute function public.converge_forbid_change();
create trigger options_immutable_during_use
  before delete on public.options
  for each row execute function public.converge_forbid_change();

create or replace function public.converge_decisions_transition_guard()
returns trigger language plpgsql
as $$
begin
  if new.id <> old.id or new.created_at <> old.created_at or new.created_by <> old.created_by
     or new.name <> old.name or new.travel_year is distinct from old.travel_year then
    raise exception 'immutable_field' using errcode = 'P0001';
  end if;
  if old.status = 'decided' then
    raise exception 'decision_frozen' using errcode = 'P0001';
  end if;
  if new.status <> old.status and not (
       (old.status = 'collecting' and new.status = 'revealed')
    or (old.status = 'revealed' and new.status = 'decided')) then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  -- D12: the limit only ever increases, and only while collecting.
  if new.participant_limit <> old.participant_limit
     and (old.status <> 'collecting' or new.participant_limit < old.participant_limit) then
    raise exception 'invalid_limit_change' using errcode = 'P0001';
  end if;
  if new.revealed_at is distinct from old.revealed_at and old.revealed_at is not null then
    raise exception 'immutable_field' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger decisions_transition_guard
  before update on public.decisions
  for each row execute function public.converge_decisions_transition_guard();

create or replace function public.converge_responses_insert_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_status text;
begin
  select d.status into v_status
  from public.participants p join public.decisions d on d.id = p.decision_id
  where p.id = new.participant_id;
  if v_status is null or v_status = 'decided' then
    raise exception 'decision_frozen' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger responses_insert_guard
  before insert on public.responses
  for each row execute function public.converge_responses_insert_guard();

-- Votes: only while revealed, only by a participant of that decision, and
-- NEVER for an option that hard-excludes the voter (§21), checked against the
-- voter's current (latest) response. The server also checks that the option
-- is in the current top 3 inside the same locked transaction.
create or replace function public.converge_votes_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_status text;
  v_cost int;
  v_type text;
  v_max int;
  v_deal text[];
begin
  if tg_op = 'DELETE' then
    select status into v_status from public.decisions where id = old.decision_id;
    if v_status <> 'revealed' then
      raise exception 'voting_closed' using errcode = 'P0001';
    end if;
    return old;
  end if;

  select status into v_status from public.decisions where id = new.decision_id;
  if v_status is distinct from 'revealed' then
    raise exception 'voting_closed' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.participants
    where id = new.participant_id and decision_id = new.decision_id
  ) then
    raise exception 'participant_not_in_decision' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and (new.decision_id <> old.decision_id or new.participant_id <> old.participant_id) then
    raise exception 'immutable_field' using errcode = 'P0001';
  end if;

  select cost_per_person, type into v_cost, v_type from public.options where id = new.option_id;
  select max_budget, dealbreaker_types into v_max, v_deal
  from public.responses where participant_id = new.participant_id
  order by seq desc limit 1;
  if (v_max is not null and v_cost > v_max) or v_type = any (coalesce(v_deal, '{}')) then
    raise exception 'hard_excluded_option' using errcode = 'P0001';
  end if;

  new.updated_at := clock_timestamp();
  return new;
end;
$$;
create trigger votes_guard
  before insert or update or delete on public.votes
  for each row execute function public.converge_votes_guard();

-- ---------------------------------------------------------------------------
-- Privileges & RLS
-- ---------------------------------------------------------------------------
alter table public.options enable row level security;
alter table public.decisions enable row level security;
alter table public.participants enable row level security;
alter table public.responses enable row level security;
alter table public.votes enable row level security;
alter table public.explanation_cache enable row level security;

-- Supabase grants broad default privileges on new public tables; remove them.
revoke all on public.options, public.decisions, public.participants,
  public.responses, public.votes, public.explanation_cache
  from anon, authenticated, public;

-- Clients: read OWN rows only. No insert/update/delete grants at all.
grant select on public.participants, public.responses, public.votes to authenticated;

create policy participants_select_own on public.participants
  for select to authenticated
  using (auth_user_id = (select auth.uid()));

create policy responses_select_own on public.responses
  for select to authenticated
  using (exists (
    select 1 from public.participants p
    where p.id = responses.participant_id and p.auth_user_id = (select auth.uid())
  ));

create policy votes_select_own on public.votes
  for select to authenticated
  using (exists (
    select 1 from public.participants p
    where p.id = votes.participant_id and p.auth_user_id = (select auth.uid())
  ));

-- Server role: least privilege, no BYPASSRLS. It logs in only after an
-- operator sets a password per environment (see README).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'converge_server') then
    create role converge_server nologin noinherit;
  end if;
end;
$$;

grant usage on schema public to converge_server;
grant select on public.options, public.decisions, public.participants,
  public.responses, public.votes, public.explanation_cache to converge_server;
grant insert, update, delete on public.votes to converge_server;
grant insert on public.explanation_cache to converge_server;
grant update (status, outcome, final_choice_option_id, vote_tally, tiebreak_reason, decided_at)
  on public.decisions to converge_server;

create policy server_read_options on public.options for select to converge_server using (true);
create policy server_read_decisions on public.decisions for select to converge_server using (true);
-- USING (true) so the server can `SELECT … FOR UPDATE` any decision it reads
-- (row locks are subject to the UPDATE policy). What it may change is limited
-- by the column grants above and by decisions_transition_guard, which
-- rejects any change to a decided decision and any invalid transition.
create policy server_finalize_decisions on public.decisions for update to converge_server
  using (true) with check (status = 'decided');
create policy server_read_participants on public.participants for select to converge_server using (true);
create policy server_read_responses on public.responses for select to converge_server using (true);
create policy server_votes on public.votes for all to converge_server using (true) with check (true);
create policy server_explanations on public.explanation_cache for all to converge_server
  using (true) with check (true);

-- ---------------------------------------------------------------------------
-- RPCs (the only client write paths)
-- ---------------------------------------------------------------------------

-- Creates the decision AND its organizer participant atomically.
create or replace function public.create_decision(
  p_name text,
  p_participant_limit int,
  p_organizer_name text,
  p_travel_year int default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  insert into public.decisions (name, participant_limit, travel_year, created_by)
  values (btrim(p_name), p_participant_limit, p_travel_year, v_uid)
  returning id into v_id;
  insert into public.participants (decision_id, auth_user_id, name, is_organizer)
  values (v_id, v_uid, btrim(p_organizer_name), true);
  return v_id;
end;
$$;

-- Public metadata needed to participate. Deliberately returns NO counts of
-- joined/submitted participants to members (§5, D17). Non-members get only
-- a boolean "roster full" so the join screen can explain itself.
create or replace function public.get_decision_public(p_decision_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  d public.decisions%rowtype;
  p public.participants%rowtype;
  v_joined int;
begin
  select * into d from public.decisions where id = p_decision_id;
  if not found then
    return null;
  end if;
  select * into p from public.participants
  where decision_id = p_decision_id and auth_user_id = v_uid;
  if found then
    return jsonb_build_object(
      'id', d.id,
      'name', d.name,
      'status', d.status,
      'participant_limit', d.participant_limit,
      'travel_year', d.travel_year,
      'member', jsonb_build_object(
        'participant_id', p.id,
        'name', p.name,
        'is_organizer', p.is_organizer,
        'has_submitted', exists (select 1 from public.responses r where r.participant_id = p.id)
      ),
      'is_full', null
    );
  end if;
  select count(*) into v_joined from public.participants where decision_id = p_decision_id;
  return jsonb_build_object(
    'id', d.id,
    'name', d.name,
    'status', d.status,
    'participant_limit', null,
    'travel_year', d.travel_year,
    'member', null,
    'is_full', d.status = 'collecting' and v_joined >= d.participant_limit
  );
end;
$$;

-- Join (§20, §36A.3): only while collecting, capped at participant_limit
-- (organizer included). Idempotent for an existing member.
create or replace function public.join_decision(p_decision_id uuid, p_name text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  d public.decisions%rowtype;
  v_existing uuid;
  v_joined int;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  select * into d from public.decisions where id = p_decision_id for update;
  if not found then
    raise exception 'decision_not_found' using errcode = 'P0001';
  end if;
  select id into v_existing from public.participants
  where decision_id = p_decision_id and auth_user_id = v_uid;
  if v_existing is not null then
    return v_existing;
  end if;
  if d.status <> 'collecting' then
    raise exception 'decision_closed' using errcode = 'P0001';
  end if;
  select count(*) into v_joined from public.participants where decision_id = p_decision_id;
  if v_joined >= d.participant_limit then
    raise exception 'roster_full' using errcode = 'P0001';
  end if;
  insert into public.participants (decision_id, auth_user_id, name, is_organizer)
  values (p_decision_id, v_uid, btrim(p_name), false)
  returning id into v_id;
  return v_id;
end;
$$;

-- Submit (or edit) the caller's own response. Always INSERTS a new row.
--   collecting: may atomically trigger reveal when submitted == limit.
--   revealed:   clears ALL votes (D5) — results may have changed.
--   decided:    rejected (responses immutable).
create or replace function public.submit_response(p_decision_id uuid, p_response jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  d public.decisions%rowtype;
  v_participant uuid;
  v_response uuid;
  v_submitted int;
  v_dates jsonb;
  v_status text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if p_response is null or jsonb_typeof(p_response) <> 'object' then
    raise exception 'invalid_response' using errcode = 'P0001';
  end if;

  -- Serialises with every other submission, join, limit change and vote.
  select * into d from public.decisions where id = p_decision_id for update;
  if not found then
    raise exception 'decision_not_found' using errcode = 'P0001';
  end if;
  select id into v_participant from public.participants
  where decision_id = p_decision_id and auth_user_id = v_uid;
  if v_participant is null then
    raise exception 'not_a_participant' using errcode = 'P0001';
  end if;
  if d.status = 'decided' then
    raise exception 'decision_frozen' using errcode = 'P0001';
  end if;

  v_dates := p_response -> 'preferred_date_ranges';
  if v_dates is null or jsonb_typeof(v_dates) = 'null'
     or (jsonb_typeof(v_dates) = 'array' and jsonb_array_length(v_dates) = 0) then
    v_dates := null;
  end if;

  begin
    insert into public.responses (
      participant_id, preferred_date_ranges, ideal_budget, max_budget,
      preferred_types, avoided_types, dealbreaker_types,
      wanted_activities, avoided_activities, notes
    ) values (
      v_participant,
      v_dates,
      (p_response ->> 'ideal_budget')::int,
      (p_response ->> 'max_budget')::int,
      (select coalesce(array_agg(distinct x order by x), '{}')
         from jsonb_array_elements_text(coalesce(p_response -> 'preferred_types', '[]')) x),
      (select coalesce(array_agg(distinct x order by x), '{}')
         from jsonb_array_elements_text(coalesce(p_response -> 'avoided_types', '[]')) x),
      (select coalesce(array_agg(distinct x order by x), '{}')
         from jsonb_array_elements_text(coalesce(p_response -> 'dealbreaker_types', '[]')) x),
      (select coalesce(array_agg(distinct x order by x), '{}')
         from jsonb_array_elements_text(coalesce(p_response -> 'wanted_activities', '[]')) x),
      (select coalesce(array_agg(distinct x order by x), '{}')
         from jsonb_array_elements_text(coalesce(p_response -> 'avoided_activities', '[]')) x),
      nullif(btrim(p_response ->> 'notes'), '')
    ) returning id into v_response;
  exception
    when check_violation or invalid_text_representation or numeric_value_out_of_range
      or invalid_parameter_value or datatype_mismatch then
      raise exception 'invalid_response' using errcode = 'P0001';
  end;

  v_status := d.status;
  if d.status = 'revealed' then
    -- D5: any post-reveal edit restarts voting for everyone.
    delete from public.votes where decision_id = p_decision_id;
  elsif d.status = 'collecting' then
    select count(distinct r.participant_id) into v_submitted
    from public.responses r
    join public.participants p on p.id = r.participant_id
    where p.decision_id = p_decision_id;
    if v_submitted = d.participant_limit then
      update public.decisions
      set status = 'revealed', revealed_at = clock_timestamp()
      where id = p_decision_id;
      v_status := 'revealed';
    end if;
  end if;

  return jsonb_build_object('response_id', v_response, 'status', v_status);
end;
$$;

-- Organizer-only: raise participant_limit while collecting (D12).
--
-- GUARD: this function must never lower the limit and must never evaluate
-- the reveal condition. Because new > old ≥ joined ≥ submitted, an increase
-- cannot make submitted == limit; allowing decreases would let the organizer
-- probe submission progress by watching for an instant reveal. Its result
-- and errors depend only on (is organizer, status, old limit, new limit) —
-- never on joined/submitted counts. Covered by
-- src/lib/domain/__tests__/rules.test.ts and
-- tests/integration/limit.test.ts.
create or replace function public.set_participant_limit(p_decision_id uuid, p_new_limit int)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  d public.decisions%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  select * into d from public.decisions where id = p_decision_id for update;
  if not found then
    raise exception 'decision_not_found' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.participants
    where decision_id = p_decision_id and auth_user_id = v_uid and is_organizer
  ) then
    raise exception 'not_organizer' using errcode = 'P0001';
  end if;
  if d.status <> 'collecting' then
    raise exception 'decision_not_collecting' using errcode = 'P0001';
  end if;
  if p_new_limit is null or p_new_limit > 8 then
    raise exception 'limit_out_of_range' using errcode = 'P0001';
  end if;
  if p_new_limit <= d.participant_limit then
    raise exception 'limit_must_increase' using errcode = 'P0001';
  end if;
  update public.decisions set participant_limit = p_new_limit where id = p_decision_id;
end;
$$;

revoke all on function public.create_decision(text, int, text, int) from public, anon;
revoke all on function public.get_decision_public(uuid) from public, anon;
revoke all on function public.join_decision(uuid, text) from public, anon;
revoke all on function public.submit_response(uuid, jsonb) from public, anon;
revoke all on function public.set_participant_limit(uuid, int) from public, anon;
grant execute on function public.create_decision(text, int, text, int) to authenticated;
grant execute on function public.get_decision_public(uuid) to authenticated;
grant execute on function public.join_decision(uuid, text) to authenticated;
grant execute on function public.submit_response(uuid, jsonb) to authenticated;
grant execute on function public.set_participant_limit(uuid, int) to authenticated;

-- Internal helpers/trigger functions are not callable as RPCs.
revoke all on function public.converge_forbid_change() from public, anon, authenticated;
revoke all on function public.converge_decisions_transition_guard() from public, anon, authenticated;
revoke all on function public.converge_responses_insert_guard() from public, anon, authenticated;
revoke all on function public.converge_votes_guard() from public, anon, authenticated;
