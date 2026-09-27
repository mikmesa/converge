"use client";

import { useEffect, useState } from "react";
import { api, AppError, type DecisionPublic, type OwnResponse } from "@/lib/client/api";
import { formatDate } from "@/lib/client/format";
import { MAX_PARTICIPANTS } from "@/lib/domain/taxonomy";
import { Button, Card, Notice } from "../ui";
import { PreferenceForm } from "./PreferenceForm";
import { LoadingState, NetworkErrorState } from "./States";

export function SharePanel({ decisionId, prominent }: { decisionId: string; prominent?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- needs window
    setUrl(`${window.location.origin}/d/${decisionId}`);
  }, [decisionId]);

  async function copy() {
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
        await navigator.share({ title: "Converge", text: "Help us decide — answer privately here:", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* user cancelled share */
    }
  }

  return (
    <Card className={prominent ? "border-accent/40 bg-accent-soft" : undefined}>
      <p className="text-sm font-medium">{prominent ? "Share this link with the group" : "Invite link"}</p>
      <p className="mt-1 text-xs text-muted">Everyone uses the same link. There’s nothing to sign up for.</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          readOnly
          value={url}
          aria-label="Invite link"
          className="min-h-11 w-full min-w-0 flex-1 truncate rounded-lg border border-line bg-surface px-3 text-sm"
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button type="button" variant="secondary" onClick={copy}>
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
    </Card>
  );
}

function LimitControl({ decision, onChanged }: { decision: DecisionPublic; onChanged: () => void }) {
  const current = decision.participant_limit ?? MAX_PARTICIPANTS;
  const [value, setValue] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (current >= MAX_PARTICIPANTS) {
    return <p className="text-xs text-muted">Group size: {current} (the maximum).</p>;
  }
  const choices = Array.from({ length: MAX_PARTICIPANTS - current }, (_, i) => current + i + 1);

  async function save() {
    if (value === null) return;
    setBusy(true);
    setMessage(null);
    try {
      await api.setLimit(decision.id, value);
      setMessage(`Group size is now ${value}. Results reveal once ${value} people have answered.`);
      setValue(null);
      onChanged();
    } catch (err) {
      const code = err instanceof AppError ? err.code : "unknown";
      setMessage(code === "decision_not_collecting" ? "Results are already out, so the group size is fixed." : "Couldn't change the group size. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-2">
      <p className="text-sm font-medium">Group size: {current}</p>
      <p className="text-xs text-muted">
        Expecting more people? You can raise it (up to {MAX_PARTICIPANTS}) until results reveal. It
        can’t be lowered.
      </p>
      <div className="flex gap-2">
        <select
          aria-label="New group size"
          className="min-h-11 rounded-lg border border-line bg-surface px-3 text-sm"
          value={value ?? ""}
          onChange={(e) => setValue(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Raise to…</option>
          {choices.map((n) => (
            <option key={n} value={n}>
              {n} people
            </option>
          ))}
        </select>
        <Button type="button" variant="secondary" disabled={value === null} busy={busy} onClick={save}>
          Save
        </Button>
      </div>
      {message ? <p className="text-xs text-ink-2" role="status">{message}</p> : null}
    </Card>
  );
}

export function CollectingView({
  decision,
  justCreated,
  onChanged,
}: {
  decision: DecisionPublic;
  justCreated: boolean;
  onChanged: () => void;
}) {
  const member = decision.member!;
  const [history, setHistory] = useState<OwnResponse[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .myResponses(member.participant_id)
      .then((h) => !cancelled && setHistory(h))
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, [member.participant_id]);

  if (loadError) return <NetworkErrorState onRetry={() => window.location.reload()} />;
  if (history === null) return <LoadingState />;

  const latest = history[0] ?? null;
  const showForm = !latest || editing;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <p className="text-sm text-muted">{member.is_organizer ? "You’re organizing" : `Hi ${member.name}`}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{decision.name}</h1>
      </div>

      {member.is_organizer ? <SharePanel decisionId={decision.id} prominent={justCreated || !latest} /> : null}

      {showForm ? (
        <PreferenceForm
          initial={latest}
          travelYear={decision.travel_year}
          draftKey={`${decision.id}:${member.participant_id}`}
          onCancel={latest ? () => setEditing(false) : undefined}
          onSubmit={async (payload) => {
            const r = await api.submit(decision.id, payload);
            const h = await api.myResponses(member.participant_id);
            setHistory(h);
            setEditing(false);
            setJustSubmitted(true);
            if (r.status !== "collecting") onChanged();
          }}
        />
      ) : (
        <div className="space-y-4">
          <Card className="space-y-3 text-center">
            <p aria-hidden className="text-3xl">🔒</p>
            <h2 className="text-lg font-semibold">
              {justSubmitted ? "Saved. Your response is private until everyone submits." : "Your response is private until everyone submits."}
            </h2>
            <p className="text-sm text-ink-2">
              Results appear here for the whole group at the same moment. Converge deliberately
              doesn’t show who has answered or how many — so nobody is nudged or rushed.
            </p>
            <p className="text-xs text-muted">
              Last saved {formatDate(latest!.submitted_at.slice(0, 10))}. This page updates on its
              own. Come back in this same browser — it’s how Converge knows it’s you.
            </p>
            <div className="pt-1">
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Edit my response
              </Button>
            </div>
          </Card>
          {!member.is_organizer ? <SharePanel decisionId={decision.id} /> : null}
          {member.is_organizer ? <LimitControl decision={decision} onChanged={onChanged} /> : null}
          {history.length > 1 ? (
            <Notice>
              You’ve saved {history.length} versions of your response. Only the latest counts; earlier
              versions are kept privately and never shown to anyone.
            </Notice>
          ) : null}
        </div>
      )}
    </div>
  );
}
