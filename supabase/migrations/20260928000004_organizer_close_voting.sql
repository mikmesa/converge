-- Organizer may close voting early (product decision after the 10-person
-- test: a lost-session "ghost" seat can otherwise block voting forever).
--
-- Rules, enforced in the server's locked vote transaction:
--   * organizer only, only while revealed with voting open;
--   * more than half of the participants must have voted (quorum), so an
--     organizer can't vote and immediately close;
--   * irreversible (the decision becomes 'decided'), so it can't be used to
--     probe voting progress repeatedly;
--   * non-voters are simply not counted; tie-breaks are unchanged.
alter table public.decisions
  add column closed_early boolean not null default false,
  add column votes_cast int check (votes_cast >= 0);

alter table public.decisions
  add constraint decisions_closed_early_only_when_decided
  check (not closed_early or status = 'decided');

grant update (closed_early, votes_cast) on public.decisions to converge_server;
