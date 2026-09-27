"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, AppError, type DecisionPublic } from "@/lib/client/api";
import { SessionUnavailableError } from "@/lib/client/supabase";
import { JoinForm } from "./JoinForm";
import { CollectingView } from "./CollectingView";
import { ResultsView } from "./ResultsView";
import {
  ClosedState,
  LoadingState,
  NetworkErrorState,
  NotFoundState,
  RosterFullState,
  SessionUnavailableState,
} from "./States";

type View =
  | { kind: "loading" }
  | { kind: "not_found" }
  | { kind: "network" }
  | { kind: "session" }
  | { kind: "ready"; pub: DecisionPublic };

/**
 * Top-level state machine for a decision link.
 *
 *   not a member ── collecting & room ──▶ join form
 *                ├─ collecting & full ─▶ roster full
 *                └─ revealed/decided ──▶ closed
 *   member ─────── collecting ─────────▶ private form / waiting
 *                └─ revealed/decided ──▶ results / vote / outcome
 */
export function DecisionApp({ id, justCreated }: { id: string; justCreated: boolean }) {
  const [view, setView] = useState<View>({ kind: "loading" });
  const statusRef = useRef<string | null>(null);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setView({ kind: "loading" });
      try {
        const pub = await api.getDecision(id);
        if (!pub) {
          setView({ kind: "not_found" });
          return;
        }
        statusRef.current = pub.status;
        setView({ kind: "ready", pub });
      } catch (err) {
        if (quiet) return; // background refresh failures stay silent
        if (err instanceof SessionUnavailableError) setView({ kind: "session" });
        else if (err instanceof AppError && err.code === "network") setView({ kind: "network" });
        else setView({ kind: "network" });
      }
    },
    [id],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    load();
  }, [load]);

  // While collecting, poll ONLY the decision status. It reveals nothing about
  // who has answered — just whether results are out.
  const pub = view.kind === "ready" ? view.pub : null;
  const collectingMember = pub?.status === "collecting" && pub.member !== null;
  useEffect(() => {
    if (!collectingMember) return;
    const t = setInterval(() => load(true), 8000);
    return () => clearInterval(t);
  }, [collectingMember, load]);

  switch (view.kind) {
    case "loading":
      return <LoadingState />;
    case "not_found":
      return <NotFoundState />;
    case "network":
      return <NetworkErrorState onRetry={() => load()} />;
    case "session":
      return <SessionUnavailableState onRetry={() => load()} />;
  }

  const p = view.pub;
  if (!p.member) {
    if (p.status !== "collecting") return <ClosedState name={p.name} />;
    if (p.is_full) return <RosterFullState name={p.name} />;
    return <JoinForm decision={p} onJoined={() => load(true)} onChanged={() => load(true)} />;
  }
  if (p.status === "collecting") {
    return <CollectingView decision={p} justCreated={justCreated} onChanged={() => load(true)} />;
  }
  return <ResultsView decision={p} />;
}
