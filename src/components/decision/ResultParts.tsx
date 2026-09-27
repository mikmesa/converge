"use client";

import Link from "next/link";
import {
  COST_LABEL,
  DATE_FACTOR_LABEL,
  outcomeText,
  privateLeverText,
  publicLeverText,
  RANKING_RULE_LABEL,
  TYPE_FACTOR_LABEL,
} from "@/lib/domain/copy";
import { buildExplanationInput, templateExplanation } from "@/lib/domain/explanation";
import type { MatrixCell, OptionCard, SanitizedResult } from "@/lib/domain/result-types";
import { activityLabel, formatINR, formatRange, listJoin, typeLabel } from "@/lib/client/format";
import { Card, cx, SectionHeading, TierBadge, TierCounts } from "../ui";

export function OptionCardView({
  card,
  decisionId,
  rank,
  counts,
  allStrong,
  isRecommendation,
  separatedBy,
  infeasible,
}: {
  card: OptionCard;
  decisionId: string;
  rank?: number;
  counts?: SanitizedResult["top"][number]["counts"];
  allStrong?: boolean;
  isRecommendation?: boolean;
  separatedBy?: SanitizedResult["top"][number]["separatedFromPreviousBy"];
  infeasible?: { maxBudgetExclusions: number; dealbreakerExclusions: number };
}) {
  return (
    <Card className={cx("flex h-full flex-col gap-3", infeasible && "border-dashed bg-surface-2")}>
      {infeasible ? (
        <p className="self-start rounded-full border border-conflict/40 bg-conflict-bg px-2.5 py-0.5 text-xs font-semibold text-conflict">
          Infeasible as submitted
        </p>
      ) : rank ? (
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          #{rank}
          {isRecommendation ? " · best fit by the rules" : ""}
          {allStrong ? " · strong fit for everyone" : ""}
        </p>
      ) : null}
      <div>
        <h3 className="text-xl font-semibold tracking-tight">{card.name}</h3>
        <p className="text-sm text-muted">
          {typeLabel(card.type)}
          {card.tags.length ? ` · ${card.tags.join(" · ")}` : ""}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted">Estimated cost</dt>
        <dd className="text-right font-medium">
          {formatINR(card.costPerPerson)}
          <span className="font-normal text-muted">/person</span>
        </dd>
        {card.typicalDurationDays ? (
          <>
            <dt className="text-muted">Typical trip</dt>
            <dd className="text-right">{card.typicalDurationDays} days</dd>
          </>
        ) : null}
      </dl>
      <div className="text-sm">
        <p className="text-muted">Season</p>
        <ul>
          {card.availabilityWindows.map((w) => (
            <li key={w.start}>{formatRange(w)}</li>
          ))}
        </ul>
      </div>
      <p className="text-sm text-ink-2">{card.description}</p>
      {counts ? <TierCounts counts={counts} /> : null}
      {infeasible ? (
        <p className="text-sm text-conflict">
          {listJoin(
            [
              infeasible.maxBudgetExclusions > 0
                ? `over the maximum budget of ${infeasible.maxBudgetExclusions === 1 ? "1 participant" : `${infeasible.maxBudgetExclusions} participants`}`
                : "",
              infeasible.dealbreakerExclusions > 0
                ? `a dealbreaker type for ${infeasible.dealbreakerExclusions === 1 ? "1 participant" : `${infeasible.dealbreakerExclusions} participants`}`
                : "",
            ].filter(Boolean),
          ).replace(/^./, (c) => c.toUpperCase())}
          .
        </p>
      ) : null}
      {separatedBy ? <p className="text-xs text-muted">{RANKING_RULE_LABEL[separatedBy]}</p> : null}
      <p className="mt-auto text-xs text-muted">
        Estimate for the trip itself (mid-range stay, food, local transport), excluding travel to get
        there. Not live pricing.
      </p>
      {!infeasible ? (
        <Link href={`/d/${decisionId}/options/${card.id}`} className="text-sm font-medium text-accent underline-offset-4 hover:underline">
          See how it fits each person →
        </Link>
      ) : null}
    </Card>
  );
}

function CellDetail({ cell }: { cell: MatrixCell }) {
  return (
    <span className="mt-1 block space-y-0.5 text-[11px] leading-tight text-muted">
      <span className="block">{COST_LABEL[cell.cost]}</span>
      <span className="block">{TYPE_FACTOR_LABEL[cell.type]}</span>
      <span className="block">{DATE_FACTOR_LABEL[cell.dates]}</span>
    </span>
  );
}

export function FitMatrix({ result, showDetail }: { result: SanitizedResult; showDetail: boolean }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[28rem] border-separate border-spacing-0 text-sm">
        <caption className="sr-only">How each option fits each person</caption>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-10 bg-bg py-2 pr-3 text-left font-medium text-muted">
              Person
            </th>
            {result.top.map((t) => (
              <th key={t.optionId} scope="col" className="px-2 py-2 text-left font-semibold">
                {result.options[t.optionId].name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.participants.map((p) => (
            <tr key={p.id}>
              <th scope="row" className="sticky left-0 z-10 border-t border-line bg-bg py-2 pr-3 text-left font-medium">
                {p.name}
                {p.isViewer ? <span className="ml-1 text-xs font-normal text-muted">(you)</span> : null}
              </th>
              {result.top.map((t) => {
                const cell = result.matrix[t.optionId][p.id];
                return (
                  <td key={t.optionId} className="border-t border-line px-2 py-2 align-top">
                    <TierBadge tier={cell.tier} compact />
                    {showDetail ? <CellDetail cell={cell} /> : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Explanations({
  result,
  ai,
}: {
  result: SanitizedResult;
  ai: { status: "loading" | "ok" | "unavailable"; explanations: Record<string, string> };
}) {
  const input = buildExplanationInput(result);
  return (
    <div className="space-y-3">
      {input.options.map((o) => (
        <Card key={o.option_id} className="space-y-2">
          <h3 className="font-semibold">{o.option}</h3>
          {ai.status === "ok" && ai.explanations[o.option_id] ? (
            <p className="text-sm">{ai.explanations[o.option_id]}</p>
          ) : null}
          <p className={cx("text-sm", ai.status === "ok" && ai.explanations[o.option_id] ? "text-muted" : "text-ink-2")}>
            {ai.status === "ok" && ai.explanations[o.option_id] ? <span className="font-medium">From the rules: </span> : null}
            {templateExplanation(o)}
          </p>
          <ActivityContext participants={o.participants} />
        </Card>
      ))}
      <p className="text-xs text-muted" role="status">
        {ai.status === "loading"
          ? "Writing a plain-English summary…"
          : ai.status === "unavailable"
            ? "Explanation unavailable right now. The facts above come straight from the rules."
            : "Summaries are written by AI from the categorical results only. The AI doesn't rank, score or see anyone's budget."}
      </p>
    </div>
  );
}

function ActivityContext({
  participants,
}: {
  participants: { name: string; wanted_activities_available: string[]; avoided_activities_present: string[] }[];
}) {
  const wants = participants.filter((p) => p.wanted_activities_available.length > 0);
  const avoids = participants.filter((p) => p.avoided_activities_present.length > 0);
  if (!wants.length && !avoids.length) return null;
  return (
    <div className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-2">
      <p className="font-medium text-muted">Context only — activities don’t affect the ranking</p>
      <ul className="mt-1 space-y-0.5">
        {wants.map((p) => (
          <li key={`w-${p.name}`}>
            {p.name} would enjoy: {listJoin(p.wanted_activities_available.map(activityLabel))}
          </li>
        ))}
        {avoids.map((p) => (
          <li key={`a-${p.name}`}>
            {p.name} would rather skip: {listJoin(p.avoided_activities_present.map(activityLabel))}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Sensitivity({ result }: { result: SanitizedResult }) {
  const s = result.sensitivity;
  const fmt = { inr: formatINR, range: formatRange };
  return (
    <div className="space-y-3">
      {s.noUsefulRelaxation ? (
        <Card>
          <p className="text-sm text-ink-2">
            No single change by one person would unlock another option or improve anyone’s fit.
            Reaching agreement would need more than one person to adjust.
          </p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {s.levers.map((l, i) => (
            <li key={i}>
              <Card className="flex items-start gap-3">
                <span aria-hidden className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
                  {i + 1}
                </span>
                <div className="space-y-1">
                  <p className="text-sm">{publicLeverText(l, result.options)}</p>
                  <p className="flex flex-wrap gap-2 text-xs">
                    {l.large ? (
                      <span className="rounded-full bg-compromise-bg px-2 py-0.5 font-medium text-compromise">Large change</span>
                    ) : null}
                    {l.isViewers ? (
                      <span className="rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent">This one is about you — only you can see that</span>
                    ) : null}
                  </p>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {result.myLevers.length > 0 ? (
        <Card className="space-y-2 border-accent/40">
          <p className="text-sm font-semibold">Just for you</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
            {result.myLevers.map((l, i) => (
              <li key={i}>{privateLeverText(l, result.options, fmt)}</li>
            ))}
          </ul>
          <p className="text-xs text-muted">
            Only you see these details. Changing your answers is always your call.
          </p>
        </Card>
      ) : null}

      {s.infeasible.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {s.infeasible.map((i) => (
            <OptionCardView
              key={i.optionId}
              card={result.options[i.optionId]}
              decisionId={result.decision.id}
              infeasible={i}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function OutcomeCard({ result }: { result: SanitizedResult }) {
  const o = result.outcome!;
  const lines = outcomeText(o, result.options);
  const rec = result.recommendationOptionId ? result.options[result.recommendationOptionId] : null;
  const chosen = o.optionId ? result.options[o.optionId] : null;
  return (
    <Card className={cx("space-y-3", o.outcome === "selected" ? "border-accent/50 bg-accent-soft" : "")}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Final group decision</p>
      <h2 className="text-2xl font-semibold tracking-tight">
        {o.outcome === "selected" && chosen ? chosen.name : "No decision"}
      </h2>
      {lines.map((l) => (
        <p key={l} className="text-sm text-ink-2">
          {l}
        </p>
      ))}
      <ul className="space-y-1 text-sm" aria-label="Final vote tally">
        {Object.entries(o.tally)
          .sort((a, b) => b[1] - a[1])
          .map(([id, n]) => (
            <li key={id} className="flex justify-between border-t border-line pt-1">
              <span>{result.options[id]?.name ?? "Option"}</span>
              <span className="font-medium">
                {n} vote{n === 1 ? "" : "s"}
              </span>
            </li>
          ))}
      </ul>
      {rec ? (
        <p className="text-xs text-muted">
          Engine recommendation (best fit by the rules): {rec.name}. The group’s vote is the
          decision — choosing differently doesn’t mean either was wrong.
        </p>
      ) : null}
    </Card>
  );
}

export function SectionTitle(props: { step: string; title: string; hint?: string }) {
  return <SectionHeading {...props} />;
}
