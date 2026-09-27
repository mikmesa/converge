"use client";

import Link from "next/link";
import { COST_LABEL, DATE_FACTOR_LABEL, TYPE_FACTOR_LABEL } from "@/lib/domain/copy";
import { activityLabel, listJoin } from "@/lib/client/format";
import { Card, TierBadge } from "../ui";
import { OptionCardView } from "./ResultParts";
import { useResults } from "./ResultsView";
import { LoadingState, NetworkErrorState, NotFoundState } from "./States";

/** Option detail / comparison view (screen 8). */
export function OptionDetail({ decisionId, optionId }: { decisionId: string; optionId: string }) {
  const { result, error, reload } = useResults(decisionId);
  if (error === "not_revealed") {
    return (
      <div className="mx-auto max-w-lg">
        <Card className="space-y-2">
          <h1 className="text-xl font-semibold">Results aren’t out yet</h1>
          <p className="text-sm text-ink-2">Destinations are only shown once everyone has answered.</p>
          <Link className="text-sm font-medium text-accent underline" href={`/d/${decisionId}`}>
            Back to the decision
          </Link>
        </Card>
      </div>
    );
  }
  if (error === "not_a_participant" || error === "not_found") return <NotFoundState />;
  if (error && !result) return <NetworkErrorState onRetry={() => reload()} />;
  if (!result) return <LoadingState />;

  const top = result.top.find((t) => t.optionId === optionId);
  const card = result.options[optionId];
  if (!top || !card) return <NotFoundState />;
  const row = result.matrix[optionId];

  return (
    <div className="space-y-6">
      <Link href={`/d/${decisionId}`} className="text-sm font-medium text-accent">
        ← Back to results
      </Link>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <OptionCardView
          card={card}
          decisionId={decisionId}
          rank={top.rank}
          counts={top.counts}
          allStrong={top.allStrong}
          isRecommendation={optionId === result.recommendationOptionId}
          separatedBy={top.separatedFromPreviousBy}
        />
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">How {card.name} fits each person</h2>
          <ul className="space-y-2">
            {result.participants.map((p) => {
              const c = row[p.id];
              return (
                <li key={p.id}>
                  <Card className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">
                        {p.name}
                        {p.isViewer ? <span className="ml-1 text-xs font-normal text-muted">(you)</span> : null}
                      </p>
                      <TierBadge tier={c.tier} />
                    </div>
                    <ul className="flex flex-wrap gap-1.5 text-xs">
                      <li className="rounded-full bg-surface-2 px-2 py-0.5">{COST_LABEL[c.cost]}</li>
                      <li className="rounded-full bg-surface-2 px-2 py-0.5">{TYPE_FACTOR_LABEL[c.type]}</li>
                      <li className="rounded-full bg-surface-2 px-2 py-0.5">{DATE_FACTOR_LABEL[c.dates]}</li>
                    </ul>
                    {c.wantedActivitiesHere.length || c.avoidedActivitiesHere.length ? (
                      <p className="text-xs text-muted">
                        {c.wantedActivitiesHere.length ? `Would enjoy: ${listJoin(c.wantedActivitiesHere.map(activityLabel))}. ` : ""}
                        {c.avoidedActivitiesHere.length ? `Would rather skip: ${listJoin(c.avoidedActivitiesHere.map(activityLabel))}. ` : ""}
                        (Context only — not part of the ranking.)
                      </p>
                    ) : null}
                  </Card>
                </li>
              );
            })}
          </ul>
          <Card>
            <p className="text-sm font-medium">Activities here</p>
            <p className="mt-1 text-sm text-ink-2">{listJoin(card.activities.map(activityLabel))}</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
