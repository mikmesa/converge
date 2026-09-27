"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Button, Card, Spinner } from "../ui";

function StateCard({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mx-auto max-w-lg">
      <Card className="space-y-3">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {children ? <div className="space-y-2 text-sm text-ink-2">{children}</div> : null}
        {action ? <div className="pt-2">{action}</div> : null}
      </Card>
    </div>
  );
}

export function InvalidDecision() {
  return (
    <StateCard
      title="This link doesn't look right"
      action={<Link className="text-sm font-medium text-accent underline" href="/">Start a new decision</Link>}
    >
      <p>The decision link seems incomplete or mistyped. Ask whoever shared it to send it again.</p>
    </StateCard>
  );
}

export function NotFoundState() {
  return (
    <StateCard
      title="We couldn't find this decision"
      action={<Link className="text-sm font-medium text-accent underline" href="/">Start a new decision</Link>}
    >
      <p>It may have been mistyped. Ask whoever shared the link to send it again.</p>
    </StateCard>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex justify-center py-16 text-muted">
      <Spinner label={label} />
    </div>
  );
}

export function NetworkErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <StateCard title="We couldn't reach Converge" action={<Button onClick={onRetry}>Try again</Button>}>
      <p>Check your connection. Nothing you entered has been lost on our side.</p>
    </StateCard>
  );
}

export function SessionUnavailableState({ onRetry }: { onRetry: () => void }) {
  return (
    <StateCard title="This browser blocked a private session" action={<Button onClick={onRetry}>Try again</Button>}>
      <p>
        Converge keeps you signed in invisibly using this browser’s storage — there’s no account.
        Private browsing or blocked site data can prevent that.
      </p>
      <p>Allow site data for this page, or open the link in a regular browser window.</p>
    </StateCard>
  );
}

export function RosterFullState({ name }: { name: string }) {
  return (
    <StateCard title="This decision's roster is already full">
      <p>
        <strong>{name}</strong> already has everyone it was set up for. If you should be part of it,
        ask the organizer to raise the group size, then open the link again.
      </p>
      <LostSessionNote />
    </StateCard>
  );
}

export function ClosedState({ name }: { name: string }) {
  return (
    <StateCard title="This decision is closed to new people">
      <p>
        <strong>{name}</strong> has already revealed its results to the group, so the roster is
        frozen.
      </p>
      <LostSessionNote />
    </StateCard>
  );
}

function LostSessionNote() {
  return (
    <p className="text-xs text-muted">
      Were you already part of it? Converge remembers you only on the device and browser you first
      used. If this browser’s data was cleared, that private session can’t be restored — this is a
      known limitation of this version.
    </p>
  );
}
