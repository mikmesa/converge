import type { ButtonHTMLAttributes, ReactNode } from "react";
import { TIER_LABEL } from "@/lib/domain/copy";
import type { Tier } from "@/lib/engine/types";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  busy?: boolean;
};

export function Button({ variant = "primary", busy, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cx(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-accent text-accent-ink hover:opacity-90",
        variant === "secondary" && "border border-line bg-surface text-ink hover:bg-surface-2",
        variant === "ghost" && "text-accent underline-offset-4 hover:underline",
        className,
      )}
    >
      {busy ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2">
      <span
        aria-hidden
        className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
      />
      {label ? <span>{label}</span> : <span className="sr-only">Loading</span>}
    </span>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("rounded-xl border border-line bg-surface p-4 sm:p-5", className)}>{children}</div>
  );
}

export function Notice({
  tone = "neutral",
  title,
  children,
}: {
  tone?: "neutral" | "danger" | "accent";
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cx(
        "rounded-lg border px-4 py-3 text-sm",
        tone === "neutral" && "border-line bg-surface-2 text-ink-2",
        tone === "danger" && "border-conflict/40 bg-conflict-bg text-conflict",
        tone === "accent" && "border-accent/30 bg-accent-soft text-ink",
      )}
    >
      {title ? <p className="font-medium">{title}</p> : null}
      {children ? <div className={title ? "mt-1" : undefined}>{children}</div> : null}
    </div>
  );
}

const TIER_STYLE: Record<Tier, string> = {
  strong: "bg-strong-bg text-strong",
  compromise: "bg-compromise-bg text-compromise",
  conflict: "bg-conflict-bg text-conflict",
  insufficient: "bg-insufficient-bg text-insufficient",
};

const TIER_GLYPH: Record<Tier, string> = {
  strong: "●",
  compromise: "◐",
  conflict: "○",
  insufficient: "–",
};

export function TierBadge({ tier, compact }: { tier: Tier; compact?: boolean }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium",
        TIER_STYLE[tier],
      )}
    >
      <span aria-hidden>{TIER_GLYPH[tier]}</span>
      {compact && tier === "insufficient" ? "Not enough input" : TIER_LABEL[tier]}
    </span>
  );
}

export function TierCounts({
  counts,
}: {
  counts: { strong: number; compromise: number; conflict: number; insufficient: number };
}) {
  const rows: [Tier, number, string][] = [
    ["strong", counts.strong, "Strong Fit"],
    ["compromise", counts.compromise, "Acceptable Compromise"],
    ["conflict", counts.conflict, "Conflict"],
  ];
  if (counts.insufficient > 0) rows.push(["insufficient", counts.insufficient, "Insufficient Input"]);
  return (
    <ul className="space-y-1 text-sm" aria-label="Fit across the group">
      {rows.map(([tier, n, label]) => (
        <li key={tier} className="flex items-center gap-2">
          <span className={cx("inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-semibold", TIER_STYLE[tier])}>
            {n}
          </span>
          <span className={n === 0 ? "text-muted" : undefined}>{label}</span>
        </li>
      ))}
    </ul>
  );
}

export function SectionHeading({ step, title, hint }: { step?: string; title: string; hint?: string }) {
  return (
    <div className="mb-3">
      {step ? <p className="text-xs font-semibold uppercase tracking-wide text-muted">{step}</p> : null}
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {hint ? <p className="mt-1 text-sm text-muted">{hint}</p> : null}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      {children}
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const inputClass =
  "block w-full min-h-11 rounded-lg border border-line bg-surface px-3 text-base text-ink placeholder:text-muted focus:border-accent focus:outline-none";
