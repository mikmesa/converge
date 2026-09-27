"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, AppError, type DecisionPublic, type OwnResponse } from "@/lib/client/api";
import { timeAgo } from "@/lib/client/format";
import type { SanitizedResult } from "@/lib/domain/result-types";
import { Button, Card, cx, Notice } from "../ui";
import { PreferenceForm } from "./PreferenceForm";
import {
  Explanations,
  FitMatrix,
  OptionCardView,
  OutcomeCard,
  SectionTitle,
  Sensitivity,
} from "./ResultParts";
import { LoadingState, NetworkErrorState } from "./States";

type AiState = { status: "loading" | "ok" | "unavailable"; explanations: Record<string, string> };

export function useResults(decisionId: string) {
  const [result, setResult] = useState<SanitizedResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(
    async (quiet = false) => {
      try {
        const r = await api.results(decisionId);
        setResult(r);
        setError(null);
      } catch (err) {
        if (!quiet) setError(err instanceof AppError ? err.code : "unknown");
      }
    },
    [decisionId],
  );
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    load();
  }, [load]);
  return { result, error, reload: load };
}

export function ResultsView({ decision }: { decision: DecisionPublic }) {
  const { result, error, reload } = useResults(decision.id);
  const [editing, setEditing] = useState(false);
  const [history, setHistory] = useState<OwnResponse[] | null>(null);
  const [ai, setAi] = useState<AiState>({ status: "loading", explanations: {} });
  const [showDetail, setShowDetail] = useState(false);

  // Keep results fresh (edits by others, final outcome). Polling returns only
  // sanitized data; blind voting means no vote progress is ever included.
  const decided = result?.decision.status === "decided";
  useEffect(() => {
    if (decided || editing) return;
    const t = setInterval(() => reload(true), 15000);
    return () => clearInterval(t);
  }, [decided, editing, reload]);

  // AI explanation is optional and loaded separately — it never blocks.
  const aiKey = useMemo(
    () => (result ? JSON.stringify([result.top, result.matrix, result.participants.map((p) => p.name)]) : null),
    [result],
  );
  useEffect(() => {
    if (!aiKey || !result || result.top.length === 0) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset for new input
    setAi((prev) => ({ status: "loading", explanations: prev.explanations }));
    api
      .explanation(decision.id, ctrl.signal)
      .then((e) => setAi({ status: e.status, explanations: e.explanations }))
      .catch(() => setAi({ status: "unavailable", explanations: {} }))
      .finally(() => clearTimeout(timer));
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on content
  }, [aiKey, decision.id]);

  async function startEditing() {
    if (!decision.member) return;
    const h = await api.myResponses(decision.member.participant_id);
    setHistory(h);
    setEditing(true);
  }

  if (error && !result) return <NetworkErrorState onRetry={() => reload()} />;
  if (!result) return <LoadingState label="Loading results…" />;

  if (editing && history) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Update your response</h1>
        <PreferenceForm
          initial={history[0] ?? null}
          travelYear={decision.travel_year}
          afterReveal
          onCancel={() => setEditing(false)}
          onSubmit={async (payload) => {
            await api.submit(decision.id, payload);
            setEditing(false);
            await reload();
          }}
        />
      </div>
    );
  }

  const updates = result.participants.filter((p) => p.updatedAfterRevealAt && !p.isViewer);
  const noFeasible = result.feasibleCount === 0;

  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <p className="text-sm text-muted">Results revealed to everyone</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{result.decision.name}</h1>
        <p className="text-sm text-ink-2">
          {result.participants.map((p) => p.name).join(", ")} ·{" "}
          {result.participants.length} people
        </p>
        {updates.length > 0 ? (
          <ul className="space-y-0.5 text-xs text-muted" aria-label="Recent activity">
            {updates.map((p) => (
              <li key={p.id}>
                {p.name}’s response was updated {timeAgo(p.updatedAfterRevealAt!)}.
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      {result.outcome ? <OutcomeCard result={result} /> : null}

      {/* 1 — best viable options */}
      <section aria-labelledby="s1">
        <div id="s1">
          <SectionTitle
            step="1"
            title="What are our best viable options?"
            hint={
              noFeasible
                ? undefined
                : result.feasibleCount < 3
                  ? `Only ${result.feasibleCount} option${result.feasibleCount === 1 ? "" : "s"} work${result.feasibleCount === 1 ? "s" : ""} for everyone as submitted.`
                  : "The top options that work for everyone’s hard limits, ranked by fixed rules."
            }
          />
        </div>
        {noFeasible ? (
          <Card className="space-y-2 border-conflict/40">
            <p className="font-semibold">
              No option currently works for everyone without changing at least one hard constraint.
            </p>
            <p className="text-sm text-ink-2">
              Hard constraints are maximum budgets and “Never” destination types. Below are the
              smallest changes that would unlock additional options. Voting opens once at least one
              option works for everyone.
            </p>
          </Card>
        ) : (
          <div className={cx("grid gap-3", result.top.length > 1 && "md:grid-cols-2", result.top.length > 2 && "lg:grid-cols-3")}>
            {result.top.map((t) => (
              <OptionCardView
                key={t.optionId}
                card={result.options[t.optionId]}
                decisionId={result.decision.id}
                rank={t.rank}
                counts={t.counts}
                allStrong={t.allStrong}
                isRecommendation={t.optionId === result.recommendationOptionId}
                separatedBy={t.separatedFromPreviousBy}
              />
            ))}
          </div>
        )}
      </section>

      {/* 2 — per-person matrix */}
      {!noFeasible ? (
        <section aria-labelledby="s2">
          <div id="s2" className="flex items-end justify-between gap-3">
            <SectionTitle step="2" title="How does each option work for each person?" />
            <Button variant="ghost" className="mb-3 shrink-0" onClick={() => setShowDetail((v) => !v)} aria-expanded={showDetail}>
              {showDetail ? "Hide details" : "Show details"}
            </Button>
          </div>
          <FitMatrix result={result} showDetail={showDetail} />
          <p className="mt-2 text-xs text-muted">
            Budget is shown only as within budget / stretch — never anyone’s actual numbers.
          </p>
        </section>
      ) : null}

      {/* 3 — compromises */}
      {!noFeasible ? (
        <section aria-labelledby="s3">
          <div id="s3">
            <SectionTitle step="3" title="What compromises does each option require?" />
          </div>
          <Explanations result={result} ai={ai} />
        </section>
      ) : null}

      {/* 4 — what's preventing agreement (only when relevant) */}
      {result.sensitivity.shown ? (
        <section aria-labelledby="s4">
          <div id="s4">
            <SectionTitle
              step={noFeasible ? "2" : "4"}
              title={noFeasible ? "Here are the smallest changes that would unlock additional options" : "What is preventing unanimous agreement?"}
              hint="Each suggestion changes one thing for one person. Nobody is named, and no budget numbers are shown to the group."
            />
          </div>
          <Sensitivity result={result} />
        </section>
      ) : null}

      {/* vote */}
      {!result.outcome ? (
        <section aria-labelledby="s5">
          <div id="s5">
            <SectionTitle step="Your call" title="Final vote" />
          </div>
          <VotePanel result={result} onVoted={() => reload(true)} />
        </section>
      ) : null}

      {!decided ? (
        <section>
          <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-ink-2">
              Changed your mind? You can update your response until the final decision. The group
              sees that you updated it, not what changed.
            </p>
            <Button variant="secondary" onClick={startEditing}>
              Edit my response
            </Button>
          </Card>
        </section>
      ) : null}
    </div>
  );
}

function VotePanel({ result, onVoted }: { result: SanitizedResult; onVoted: () => void }) {
  const [choice, setChoice] = useState<string | null>(result.voting.myVoteOptionId);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!result.voting.open) {
    return (
      <Notice title="Voting is not open yet">
        Voting opens once at least one option works for everyone. Anyone can edit their own response
        to change what’s possible.
      </Notice>
    );
  }

  const mine = result.voting.myVoteOptionId;

  async function cast() {
    if (!choice) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const r = await api.vote(result.decision.id, choice);
      setMessage(r.decided ? "Everyone has voted — here’s the result." : null);
      onVoted();
    } catch (err) {
      const code = err instanceof AppError ? err.code : "unknown";
      setError(
        code === "not_a_top_option" || code === "hard_excluded"
          ? "The results changed since you loaded them. Refresh and vote again."
          : code === "voting_closed"
            ? "Voting has closed."
            : "Couldn't record your vote. Try again.",
      );
      onVoted();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4">
      <p className="text-sm text-ink-2">
        Everyone votes privately. Nobody sees how many people have voted or how anyone voted until
        the last vote is in. You can change your vote until then.
      </p>
      <fieldset className="space-y-2">
        <legend className="sr-only">Choose one option</legend>
        {result.top.map((t) => {
          const card = result.options[t.optionId];
          return (
            <label
              key={t.optionId}
              className={cx(
                "flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-3",
                choice === t.optionId ? "border-accent bg-accent-soft" : "border-line hover:bg-surface-2",
              )}
            >
              <input
                type="radio"
                name="vote"
                value={t.optionId}
                checked={choice === t.optionId}
                onChange={() => setChoice(t.optionId)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              <span className="font-medium">{card.name}</span>
              {mine === t.optionId ? <span className="ml-auto text-xs text-muted">your current vote</span> : null}
            </label>
          );
        })}
      </fieldset>
      {mine ? (
        <Notice tone="accent">
          Your vote is recorded. The result appears for everyone when the last person votes.
        </Notice>
      ) : null}
      {message ? <Notice tone="accent">{message}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Button onClick={cast} busy={busy} disabled={!choice || choice === mine} className="w-full sm:w-auto">
        {mine ? "Change my vote" : "Cast my vote"}
      </Button>
    </Card>
  );
}
