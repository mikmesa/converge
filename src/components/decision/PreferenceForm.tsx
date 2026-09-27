"use client";

import { useState } from "react";
import { AppError, type OwnResponse, type ResponsePayload } from "@/lib/client/api";
import { isValidISODate } from "@/lib/engine/dates";
import {
  ACTIVITIES,
  ACTIVITY_LABELS,
  MAX_BUDGET_VALUE,
  MAX_DATE_RANGES,
  MAX_NOTES_LENGTH,
  OPTION_TYPE_HINTS,
  OPTION_TYPE_LABELS,
  OPTION_TYPES,
  type Activity,
  type OptionType,
} from "@/lib/domain/taxonomy";
import { Button, Card, cx, inputClass, Notice } from "../ui";

type TypeChoice = "prefer" | "fine" | "avoid" | "never";
type ActivityChoice = "want" | "avoid" | undefined;

const TYPE_CHOICES: { value: TypeChoice; label: string }[] = [
  { value: "prefer", label: "Prefer" },
  { value: "fine", label: "Fine" },
  { value: "avoid", label: "Rather not" },
  { value: "never", label: "Never" },
];

interface Range {
  start: string;
  end: string;
}

function initialTypes(r: OwnResponse | null): Record<OptionType, TypeChoice> {
  const out = {} as Record<OptionType, TypeChoice>;
  for (const t of OPTION_TYPES) {
    out[t] = r?.preferred_types.includes(t)
      ? "prefer"
      : r?.dealbreaker_types.includes(t)
        ? "never"
        : r?.avoided_types.includes(t)
          ? "avoid"
          : "fine";
  }
  return out;
}

function initialActivities(r: OwnResponse | null): Partial<Record<Activity, ActivityChoice>> {
  const out: Partial<Record<Activity, ActivityChoice>> = {};
  for (const a of r?.wanted_activities ?? []) out[a as Activity] = "want";
  for (const a of r?.avoided_activities ?? []) out[a as Activity] = "avoid";
  return out;
}

export interface FormErrors {
  dates?: string;
  budget?: string;
  notes?: string;
}

/** Pure validation mirroring the database CHECK constraints. */
export function validateForm(ranges: Range[], ideal: string, max: string, notes: string): FormErrors {
  const errors: FormErrors = {};
  for (const r of ranges) {
    if (!r.start || !r.end) {
      errors.dates = "Fill in both dates for each range, or remove it.";
      break;
    }
    if (!isValidISODate(r.start) || !isValidISODate(r.end)) {
      errors.dates = "One of the dates isn't valid.";
      break;
    }
    if (r.start > r.end) {
      errors.dates = "Each range must end on or after the day it starts.";
      break;
    }
  }
  const hasIdeal = ideal.trim() !== "";
  const hasMax = max.trim() !== "";
  if (hasIdeal !== hasMax) {
    errors.budget = "Add both an ideal and a maximum budget, or leave both empty.";
  } else if (hasIdeal) {
    const i = Number(ideal);
    const m = Number(max);
    if (!Number.isInteger(i) || !Number.isInteger(m) || i <= 0 || m <= 0) {
      errors.budget = "Budgets must be whole rupee amounts above zero.";
    } else if (m > MAX_BUDGET_VALUE) {
      errors.budget = "That maximum is higher than this tool supports.";
    } else if (i > m) {
      errors.budget = "Your ideal budget can't be higher than your maximum.";
    }
  }
  if (notes.length > MAX_NOTES_LENGTH) errors.notes = `Keep notes under ${MAX_NOTES_LENGTH} characters.`;
  return errors;
}

export function PreferenceForm({
  initial,
  travelYear,
  afterReveal,
  onSubmit,
  onCancel,
}: {
  initial: OwnResponse | null;
  travelYear: number | null;
  afterReveal?: boolean;
  onSubmit: (payload: ResponsePayload) => Promise<void>;
  onCancel?: () => void;
}) {
  const [ranges, setRanges] = useState<Range[]>(initial?.preferred_date_ranges ?? []);
  const [ideal, setIdeal] = useState(initial?.ideal_budget?.toString() ?? "");
  const [max, setMax] = useState(initial?.max_budget?.toString() ?? "");
  const [types, setTypes] = useState(() => initialTypes(initial));
  const [activities, setActivities] = useState(() => initialActivities(initial));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [errors, setErrors] = useState<FormErrors>({});
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const defaultMonth = travelYear && String(travelYear) > today.slice(0, 4) ? `${travelYear}-01-01` : today;

  function cycleActivity(a: Activity) {
    setActivities((prev) => {
      const cur = prev[a];
      const next: ActivityChoice = cur === undefined ? "want" : cur === "want" ? "avoid" : undefined;
      return { ...prev, [a]: next };
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = validateForm(ranges, ideal, max, notes);
    setErrors(v);
    setServerError(null);
    if (Object.keys(v).length > 0) return;
    const payload: ResponsePayload = {
      preferred_date_ranges: ranges.length > 0 ? ranges : null,
      ideal_budget: ideal.trim() ? Number(ideal) : null,
      max_budget: max.trim() ? Number(max) : null,
      preferred_types: OPTION_TYPES.filter((t) => types[t] === "prefer"),
      avoided_types: OPTION_TYPES.filter((t) => types[t] === "avoid"),
      dealbreaker_types: OPTION_TYPES.filter((t) => types[t] === "never"),
      wanted_activities: ACTIVITIES.filter((a) => activities[a] === "want"),
      avoided_activities: ACTIVITIES.filter((a) => activities[a] === "avoid"),
      notes: notes.trim() ? notes.trim() : null,
    };
    setBusy(true);
    try {
      await onSubmit(payload);
    } catch (err) {
      const code = err instanceof AppError ? err.code : "unknown";
      setServerError(
        code === "invalid_response"
          ? "Something in the form isn't valid. Check the dates and budgets."
          : code === "decision_frozen"
            ? "This decision is final, so responses can no longer change."
            : code === "network"
              ? "We couldn't reach the server. Your answers are still here — try again."
              : "Something went wrong saving your response. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {afterReveal ? (
        <Notice tone="accent" title="Editing after results are out">
          Your new answers replace your current ones in the results. Everyone will see that you
          updated your response (not what changed), and any votes already cast will be cleared so
          the group votes on the updated results.
        </Notice>
      ) : (
        <Notice tone="accent">
          Your answers are private. Nobody sees them — or whether you’ve answered — until everyone
          has. Leave anything blank that you don’t mind about; blanks are simply skipped.
        </Notice>
      )}

      <Card className="space-y-3">
        <div>
          <h2 className="font-semibold">When could you travel?</h2>
          <p className="text-sm text-muted">
            Add the dates you’d actually travel — the trip itself, not your whole free period. You
            can add up to {MAX_DATE_RANGES} options.
          </p>
        </div>
        {ranges.length === 0 ? <p className="text-sm text-muted">No dates added — dates won’t count for or against any option.</p> : null}
        <ul className="space-y-3">
          {ranges.map((r, i) => (
            <li key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2">
              <label className="min-w-0 text-xs text-muted">
                From
                <input
                  type="date"
                  className={cx(inputClass, "mt-1 min-w-0 px-2 text-sm")}
                  value={r.start}
                  min={today}
                  onChange={(e) => setRanges((rs) => rs.map((x, j) => (j === i ? { ...x, start: e.target.value, end: x.end || e.target.value } : x)))}
                  aria-label={`Date option ${i + 1} start`}
                />
              </label>
              <label className="min-w-0 text-xs text-muted">
                To
                <input
                  type="date"
                  className={cx(inputClass, "mt-1 min-w-0 px-2 text-sm")}
                  value={r.end}
                  min={r.start || today}
                  onChange={(e) => setRanges((rs) => rs.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))}
                  aria-label={`Date option ${i + 1} end`}
                />
              </label>
              <button
                type="button"
                className="min-h-11 rounded-lg px-2 text-sm text-muted hover:bg-surface-2"
                onClick={() => setRanges((rs) => rs.filter((_, j) => j !== i))}
                aria-label={`Remove date option ${i + 1}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        {ranges.length < MAX_DATE_RANGES ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => setRanges((rs) => [...rs, { start: "", end: "" }])}
            data-default-month={defaultMonth}
          >
            + Add dates
          </Button>
        ) : null}
        {errors.dates ? <p className="text-xs text-danger" role="alert">{errors.dates}</p> : null}
      </Card>

      <Card className="space-y-3">
        <div>
          <h2 className="font-semibold">Budget per person</h2>
          <p className="text-sm text-muted">
            For the trip itself, excluding getting there. Only you ever see these numbers — others see
            only “within budget” or “stretch”. Anything above your maximum is ruled out.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="font-medium">Ideal</span>
            <div className="relative mt-1">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">₹</span>
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                className={cx(inputClass, "pl-7")}
                value={ideal}
                onChange={(e) => setIdeal(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="15000"
                aria-label="Ideal budget per person in rupees"
              />
            </div>
          </label>
          <label className="text-sm">
            <span className="font-medium">Maximum</span>
            <div className="relative mt-1">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">₹</span>
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                className={cx(inputClass, "pl-7")}
                value={max}
                onChange={(e) => setMax(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="22000"
                aria-label="Maximum budget per person in rupees"
              />
            </div>
          </label>
        </div>
        {errors.budget ? <p className="text-xs text-danger" role="alert">{errors.budget}</p> : null}
      </Card>

      <Card className="space-y-3">
        <div>
          <h2 className="font-semibold">Kinds of places</h2>
          <p className="text-sm text-muted">
            Only <strong>Prefer</strong> counts as a match; <strong>Fine</strong> is neutral.{" "}
            <strong>Never</strong> rules that kind of place out for the whole group, so use it only
            for real dealbreakers.
          </p>
        </div>
        <ul className="divide-y divide-line">
          {OPTION_TYPES.map((t) => (
            <li key={t} className="py-3">
              <div className="mb-2">
                <p className="text-sm font-medium">{OPTION_TYPE_LABELS[t]}</p>
                <p className="text-xs text-muted">{OPTION_TYPE_HINTS[t]}</p>
              </div>
              <div className="grid grid-cols-4 gap-1 rounded-lg bg-surface-2 p-1" role="radiogroup" aria-label={OPTION_TYPE_LABELS[t]}>
                {TYPE_CHOICES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    role="radio"
                    aria-checked={types[t] === c.value}
                    onClick={() => setTypes((prev) => ({ ...prev, [t]: c.value }))}
                    className={cx(
                      "min-h-10 rounded-md px-1 text-xs font-medium sm:text-sm",
                      types[t] === c.value
                        ? c.value === "never"
                          ? "bg-conflict text-surface"
                          : c.value === "avoid"
                            ? "bg-compromise-bg text-compromise ring-1 ring-compromise/40"
                            : c.value === "prefer"
                              ? "bg-accent text-accent-ink"
                              : "bg-surface text-ink ring-1 ring-line"
                        : "text-muted hover:text-ink",
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="space-y-3">
        <div>
          <h2 className="font-semibold">Things to do</h2>
          <p className="text-sm text-muted">
            Tap once for <span className="font-medium text-strong">would love</span>, twice for{" "}
            <span className="font-medium text-compromise">rather skip</span>. These are shared as
            context in the results; they don’t change the ranking.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ACTIVITIES.map((a) => {
            const s = activities[a];
            return (
              <button
                key={a}
                type="button"
                onClick={() => cycleActivity(a)}
                aria-pressed={s !== undefined}
                aria-label={`${ACTIVITY_LABELS[a]}: ${s === "want" ? "would love" : s === "avoid" ? "rather skip" : "no preference"}`}
                className={cx(
                  "min-h-10 rounded-full border px-3 text-sm",
                  s === "want" && "border-strong/40 bg-strong-bg text-strong",
                  s === "avoid" && "border-compromise/40 bg-compromise-bg text-compromise line-through decoration-1",
                  s === undefined && "border-line bg-surface text-ink-2 hover:bg-surface-2",
                )}
              >
                {s === "want" ? "♥ " : s === "avoid" ? "✕ " : ""}
                {ACTIVITY_LABELS[a]}
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="space-y-2">
        <label htmlFor="notes" className="font-semibold">
          Anything else? <span className="font-normal text-muted">(optional)</span>
        </label>
        <p className="text-sm text-muted">Only you will see this. It never affects the results.</p>
        <textarea
          id="notes"
          rows={3}
          className={cx(inputClass, "py-2")}
          value={notes}
          maxLength={MAX_NOTES_LENGTH + 50}
          onChange={(e) => setNotes(e.target.value)}
        />
        {errors.notes ? <p className="text-xs text-danger" role="alert">{errors.notes}</p> : null}
      </Card>

      {serverError ? <Notice tone="danger">{serverError}</Notice> : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" busy={busy}>
          {initial ? "Save my updated response" : "Submit my private response"}
        </Button>
      </div>
    </form>
  );
}
