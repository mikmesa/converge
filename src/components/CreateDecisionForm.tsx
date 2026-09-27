"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, AppError } from "@/lib/client/api";
import { SessionUnavailableError } from "@/lib/client/supabase";
import {
  MAX_DECISION_NAME_LENGTH,
  MAX_NAME_LENGTH,
  MAX_PARTICIPANTS,
  MIN_PARTICIPANTS,
} from "@/lib/domain/taxonomy";
import { Button, Card, cx, Field, inputClass, Notice } from "./ui";

const SIZES = Array.from({ length: MAX_PARTICIPANTS - MIN_PARTICIPANTS + 1 }, (_, i) => i + MIN_PARTICIPANTS);

export function CreateDecisionForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [yourName, setYourName] = useState("");
  const [size, setSize] = useState<number | null>(null);
  const [year, setYear] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const nameError = touched && !name.trim() ? "Give the decision a name." : null;
  const yourNameError = touched && !yourName.trim() ? "Add your name so the group knows who you are." : null;
  const sizeError = touched && size === null ? "Choose how many people will take part." : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (!name.trim() || !yourName.trim() || size === null) return;
    setBusy(true);
    try {
      const id = await api.createDecision({
        name: name.trim(),
        limit: size,
        organizerName: yourName.trim(),
        travelYear: year ? Number(year) : null,
      });
      router.push(`/d/${id}?created=1`);
    } catch (err) {
      setBusy(false);
      if (err instanceof SessionUnavailableError) {
        setError("We couldn't start a private session in this browser. Check that cookies and site storage are allowed, then try again.");
      } else if (err instanceof AppError && err.code === "network") {
        setError("We couldn't reach the server. Check your connection and try again.");
      } else {
        setError("Something went wrong creating the decision. Please try again.");
      }
    }
  }

  return (
    <Card className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Start a trip decision</h2>
        <p className="mt-1 text-sm text-muted">
          You’ll get one link to share. You answer the same private form as everyone else.
        </p>
      </div>
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <Field label="What are you deciding?" htmlFor="decision-name" error={nameError}>
          <input
            id="decision-name"
            className={inputClass}
            placeholder="e.g. December long weekend"
            maxLength={MAX_DECISION_NAME_LENGTH}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">How many people, including you?</legend>
          <p className="text-xs text-muted">Results reveal once this many people have answered. You can raise it later, not lower it.</p>
          <div className="grid grid-cols-6 gap-2" role="radiogroup" aria-label="Group size">
            {SIZES.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={size === n}
                onClick={() => setSize(n)}
                className={cx(
                  "min-h-11 rounded-lg border text-sm font-medium",
                  size === n ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface hover:bg-surface-2",
                )}
              >
                {n}
              </button>
            ))}
          </div>
          {sizeError ? <p className="text-xs text-danger" role="alert">{sizeError}</p> : null}
        </fieldset>

        <Field label="Your name" hint="Shown to the group after results reveal." htmlFor="your-name" error={yourNameError}>
          <input
            id="your-name"
            className={inputClass}
            autoComplete="given-name"
            maxLength={MAX_NAME_LENGTH}
            value={yourName}
            onChange={(e) => setYourName(e.target.value)}
          />
        </Field>

        <Field label="Travel year (optional)" hint="Only used to start the date pickers in the right year." htmlFor="year">
          <select id="year" className={inputClass} value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">No preference</option>
            <option value="2026">2026</option>
            <option value="2027">2027</option>
          </select>
        </Field>

        {error ? <Notice tone="danger">{error}</Notice> : null}

        <Button type="submit" busy={busy} className="w-full">
          Create decision
        </Button>
      </form>
    </Card>
  );
}
