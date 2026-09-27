"use client";

import { useState } from "react";
import { api, AppError, type DecisionPublic } from "@/lib/client/api";
import { MAX_NAME_LENGTH } from "@/lib/domain/taxonomy";
import { Button, Card, Field, inputClass, Notice } from "../ui";

export function JoinForm({
  decision,
  onJoined,
  onChanged,
}: {
  decision: DecisionPublic;
  onJoined: () => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Add your name so the group knows who you are.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.join(decision.id, name.trim());
      onJoined();
    } catch (err) {
      setBusy(false);
      const code = err instanceof AppError ? err.code : "unknown";
      if (code === "roster_full" || code === "decision_closed") onChanged();
      else if (code === "network") setError("We couldn't reach the server. Try again.");
      else setError("Something went wrong. Please try again.");
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div>
        <p className="text-sm text-muted">You’ve been invited to</p>
        <h1 className="text-2xl font-semibold tracking-tight">{decision.name}</h1>
      </div>
      <Card className="space-y-4">
        <p className="text-sm text-ink-2">
          You’ll answer a short private form. Nobody — including the organizer — sees your answers
          or whether you’ve answered until everyone has. Then the results reveal to the whole group
          at once.
        </p>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Your name" hint="Shown to the group after results reveal. No account needed." htmlFor="join-name">
            <input
              id="join-name"
              className={inputClass}
              autoComplete="given-name"
              maxLength={MAX_NAME_LENGTH}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <Button type="submit" busy={busy} className="w-full">
            Continue
          </Button>
        </form>
      </Card>
    </div>
  );
}
