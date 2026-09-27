import { CreateDecisionForm } from "@/components/CreateDecisionForm";

export default function Home() {
  return (
    <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
      <section className="space-y-5">
        <p className="text-sm font-medium text-accent">For groups of 3–8</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Stop going round in circles about where to go.
        </h1>
        <p className="text-ink-2">
          Everyone answers privately — dates, budget, the kinds of places they love or would rather
          skip. Nobody sees anything until the whole group has answered. Then the results reveal to
          everyone at once.
        </p>
        <ul className="space-y-3 text-sm text-ink-2">
          <li className="flex gap-3">
            <span aria-hidden className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent" />
            <span>
              <strong className="text-ink">Blind answers.</strong> No anchoring on whoever spoke first, no
              “waiting for…” pressure.
            </span>
          </li>
          <li className="flex gap-3">
            <span aria-hidden className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent" />
            <span>
              <strong className="text-ink">Honest results.</strong> You see who fits strongly, who’s
              compromising and where the real conflicts are — never a made-up score.
            </span>
          </li>
          <li className="flex gap-3">
            <span aria-hidden className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent" />
            <span>
              <strong className="text-ink">The smallest unlock.</strong> When nothing works for
              everyone, it shows which single change would open up an option.
            </span>
          </li>
          <li className="flex gap-3">
            <span aria-hidden className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent" />
            <span>
              <strong className="text-ink">Budgets stay private.</strong> Others only ever see “within
              budget” or “stretch”, never your numbers.
            </span>
          </li>
        </ul>
      </section>
      <section>
        <CreateDecisionForm />
      </section>
    </div>
  );
}
