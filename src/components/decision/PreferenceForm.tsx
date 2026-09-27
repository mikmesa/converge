"use client";

import { useEffect, useState } from "react";
import { AppError, type OwnResponse, type ResponsePayload } from "@/lib/client/api";
import { clearDraft, loadDraft, saveDraft } from "@/lib/client/draft";
import { formatINR } from "@/lib/client/format";
import { checkBudgets, parseRupees } from "@/lib/domain/budget";
import { isValidISODate } from "@/lib/engine/dates";
import {
  ACTIVITIES,
  ACTIVITY_LABELS,
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

interface FormDraft {
  ranges: Range[];
  ideal: string;
  max: string;
  types: Record<OptionType, TypeChoice>;
  activities: Partial<Record<Activity, ActivityChoice>>;
  notes: string;
}

function draftFrom(r: OwnResponse | null): FormDraft {
  return {
    ranges: r?.preferred_date_ranges ?? [],
    ideal: r?.ideal_budget?.toString() ?? "",
    max: r?.max_budget?.toString() ?? "",
    types: initialTypes(r),
    activities: initialActivities(r),
    notes: r?.notes ?? "",
  };
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
  const budget = checkBudgets(ideal, max);
  if (!budget.ok) errors.budget = budget.error;
  if (notes.length > MAX_NOTES_LENGTH) errors.notes = `Keep notes under ${MAX_NOTES_LENGTH} characters.`;
  return errors;
}

export function PreferenceForm({
  initial,
  travelYear,
  afterReveal,
  draftKey,
  onSubmit,
  onCancel,
}: {
  initial: OwnResponse | null;
  travelYear: number | null;
  /** Where unsubmitted answers are kept on this device (per decision + participant). */
  draftKey: string;
  afterReveal?: boolean;
  onSubmit: (payload: ResponsePayload) => Promise<void>;
  onCancel?: () => void;
}) {
  // A draft saved on this device (e.g. before a refresh) wins over the last
  // submitted response, so half-finished edits aren't lost.
  const [baseline] = useState(() => JSON.stringify(draftFrom(initial)));
  const [draft] = useState(() => {
    const d = loadDraft<FormDraft>(draftKey);
    return d && JSON.stringify(d) !== baseline ? d : null;
  });
  const [ranges, setRanges] = useState<Range[]>(draft?.ranges ?? initial?.preferred_date_ranges ?? []);
  const [ideal, setIdeal] = useState(draft?.ideal ?? initial?.ideal_budget?.toString() ?? "");
  const [max, setMax] = useState(draft?.max ?? initial?.max_budget?.toString() ?? "");
  const [types, setTypes] = useState(() => draft?.types ?? initialTypes(initial));
  const [activities, setActivities] = useState(() => draft?.activities ?? initialActivities(initial));
  const [notes, setNotes] = useState(draft?.notes ?? initial?.notes ?? "");
  const [restored, setRestored] = useState(draft !== null);

  useEffect(() => {
    const current: FormDraft = { ranges, ideal, max, types, activities, notes };
    // Only keep a draft when something actually differs from what's saved.
    if (JSON.stringify(current) === baseline) clearDraft(draftKey);
    else saveDraft<FormDraft>(draftKey, current);
  }, [draftKey, baseline, ranges, ideal, max, types, activities, notes]);

  function discardDraft() {
    clearDraft(draftKey);
    setRanges(initial?.preferred_date_ranges ?? []);
    setIdeal(initial?.ideal_budget?.toString() ?? "");
    setMax(initial?.max_budget?.toString() ?? "");
    setTypes(initialTypes(initial));
    setActivities(initialActivities(initial));
    setNotes(initial?.notes ?? "");
    setRestored(false);
  }
  const [errors, setErrors] = useState<FormErrors>({});
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const idealParsed = parseRupees(ideal);
  const maxParsed = parseRupees(max);

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
      ideal_budget: parseRupees(ideal),
      max_budget: parseRupees(max),
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
      clearDraft(draftKey);
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
      {restored ? (
        <Notice tone="neutral" title="We kept your unsaved answers">
          <span>These haven’t been submitted yet. </span>
          <button type="button" className="font-medium text-accent underline" onClick={discardDraft}>
            Discard them
          </button>
        </Notice>
      ) : null}
      {travelYear ? (
        <p className="text-sm text-muted">The organizer is planning for {travelYear}.</p>
      ) : null}
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
                className={cx(inputClass, "pl-7")}
                value={ideal}
                onChange={(e) => {
                  setIdeal(e.target.value);
                  setErrors((er) => ({ ...er, budget: undefined }));
                }}
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
                className={cx(inputClass, "pl-7")}
                value={max}
                onChange={(e) => {
                  setMax(e.target.value);
                  setErrors((er) => ({ ...er, budget: undefined }));
                }}
                placeholder="22000"
                aria-label="Maximum budget per person in rupees"
              />
            </div>
          </label>
        </div>
        {idealParsed !== null && maxParsed !== null && !errors.budget ? (
          <p className="text-xs text-muted" aria-live="polite">
            Saved as {formatINR(idealParsed)} ideal · {formatINR(maxParsed)} maximum
          </p>
        ) : null}
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
                  <label
                    key={c.value}
                    className={cx(
                      "relative flex min-h-10 cursor-pointer items-center justify-center rounded-md px-1 text-center text-xs font-medium has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-[var(--focus)] sm:text-sm",
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
                    {/* Native radio: arrow keys move within the group, Tab moves between groups. */}
                    <input
                      type="radio"
                      name={`type-${t}`}
                      value={c.value}
                      checked={types[t] === c.value}
                      onChange={() => setTypes((prev) => ({ ...prev, [t]: c.value }))}
                      className="absolute inset-0 cursor-pointer opacity-0"
                    />
                    {c.label}
                  </label>
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
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              clearDraft(draftKey);
              onCancel();
            }}
          >
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
