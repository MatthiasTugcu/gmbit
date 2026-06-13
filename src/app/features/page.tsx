import Link from "next/link";
import type { MoveClass } from "@/types/analysis";
import { CLS } from "@/lib/classification";
import { GmbitLogo } from "@/components/logo";
import { TryExampleButton } from "./try-example-button";

export const metadata = {
  title: "How it works — gmbit",
};

const CLASS_ORDER: MoveClass[] = [
  "brilliant",
  "great",
  "best",
  "excellent",
  "good",
  "book",
  "inaccuracy",
  "mistake",
  "miss",
  "blunder",
];

export default function FeaturesPage() {
  return (
    <div className="app-root relative z-[1] min-h-screen overflow-y-auto">
      <header className="flex items-center justify-between px-7 py-4">
        <Link href="/" className="flex items-center gap-2">
          <GmbitLogo size={26} />
          <span className="text-[14px] font-semibold tracking-tight text-text">gmbit</span>
        </Link>
        <Link
          href="/"
          className="text-[13px] font-medium text-text-2 transition-colors hover:text-text"
        >
          ← Back to home
        </Link>
      </header>

      <main className="mx-auto w-full max-w-[760px] px-6 py-10">
        <h1 className="text-[32px] font-extrabold tracking-tight text-text">How gmbit works</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-text-2">
          Paste a PGN or pull your games from chess.com or Lichess. gmbit runs Stockfish
          locally in your browser, evaluates every position, and turns the numbers into
          plain-language feedback. Nothing is uploaded — the analysis happens on your machine.
        </p>

        <section className="mt-10">
          <h2 className="text-[18px] font-bold tracking-tight text-text">Move classifications</h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-text-2">
            Each move is graded by how much it changed your winning chances, from a brilliant
            sacrifice to an outright blunder.
          </p>
          <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {CLASS_ORDER.map((cls) => (
              <li
                key={cls}
                className="flex items-center gap-3 rounded-md border border-line bg-bg-1 px-3 py-2"
              >
                <span
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-[13px] font-bold"
                  style={{ background: `var(--c-${cls})`, color: CLS[cls].ink ?? "white" }}
                >
                  {CLS[cls].icon ? (
                    <span className="h-4 w-4">{CLS[cls].icon}</span>
                  ) : (
                    CLS[cls].sym
                  )}
                </span>
                <span className="text-[13.5px] font-medium text-text">{CLS[cls].label}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="text-[18px] font-bold tracking-tight text-text">Accuracy</h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-text-2">
            Each side gets an accuracy percentage derived from how much win probability was
            lost across all their moves — opening-book and already-lost positions are excluded
            so a single rough patch doesn&apos;t unfairly sink the score.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-[18px] font-bold tracking-tight text-text">Engine evaluation</h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-text-2">
            The eval bar and graph show Stockfish&apos;s assessment of each position in pawns
            (or forced-mate distance). The graph lets you jump straight to the moments where
            the evaluation swung. Choose <b className="text-text">Fast</b> analysis for a quick
            single pass, or <b className="text-text">In-depth</b> for a deeper two-pass review.
          </p>
        </section>

        <div className="mt-10">
          <TryExampleButton />
        </div>
      </main>
    </div>
  );
}
