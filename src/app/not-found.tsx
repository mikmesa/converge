import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-line bg-surface p-5">
      <h1 className="text-xl font-semibold tracking-tight">This page doesn’t exist</h1>
      <p className="mt-2 text-sm text-ink-2">If someone sent you a decision link, ask them to share it again.</p>
      <Link href="/" className="mt-4 inline-block text-sm font-medium text-accent underline">
        Start a new decision
      </Link>
    </div>
  );
}
