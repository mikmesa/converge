import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Converge",
  description:
    "Blind, fair group decisions. Everyone answers privately, results reveal together, and the rules are deterministic.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#151514" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-bg text-ink">
        <header className="border-b border-line">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span aria-hidden className="inline-block h-3 w-3 rounded-full bg-accent" />
              Converge
            </Link>
            <span className="text-xs text-muted">Group decisions, made legible</span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-10">{children}</main>
        <footer className="border-t border-line">
          <div className="mx-auto max-w-5xl px-4 py-4 text-xs text-muted">
            No accounts. Answers are private until everyone submits. Rankings follow fixed,
            published rules — no scores, no AI ranking.
          </div>
        </footer>
      </body>
    </html>
  );
}
