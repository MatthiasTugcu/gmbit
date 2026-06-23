import Link from "next/link";
import { GmbitLogo } from "@/components/logo";
import { Wordmark } from "@/components/wordmark";

export const metadata = {
  title: "Under the hood — gmbit",
};

export default function MethodologyPage() {
  return (
    <div className="app-root relative z-[1] h-screen overflow-y-auto">
      <header className="flex items-center justify-between px-7 py-4">
        <Link href="/" className="flex items-center gap-2">
          <GmbitLogo size={26} />
          <Wordmark className="text-[14px] font-semibold tracking-tight" />
        </Link>
        <Link
          href="/features"
          className="text-[13px] font-medium text-text-2 transition-colors hover:text-text"
        >
          How it works →
        </Link>
      </header>

      <main className="mx-auto w-full max-w-[760px] px-6 py-10">
        <h1 className="text-[32px] font-extrabold tracking-tight text-text">Under the hood</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-text-2">
          The plain-language feedback on the analysis screen is the visible tip of a fairly
          opinionated little pipeline: a chess engine, a couple of hand-fitted curves, and a
          measurement loop that keeps the numbers honest against a reference we trust. Here is
          how all of it actually works — and a few things we tried that didn&apos;t pan out.
        </p>

        {/* ── Engine ───────────────────────────────────────────────── */}
        <section className="mt-10">
          <h2 className="text-[18px] font-bold tracking-tight text-text">
            The engine runs on your machine
          </h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-text-2">
            gmbit ships <b className="text-text">Stockfish</b> compiled to WebAssembly. It runs
            entirely in your browser — your games are never uploaded. We use Stockfish&apos;s{" "}
            <b className="text-text">NNUE</b> neural-network evaluation (the 6.8&nbsp;MB
            &ldquo;lite&rdquo; net), search every position to <b className="text-text">depth 20</b>,
            and ask for the top <b className="text-text">two lines</b> (MultiPV&nbsp;2) so we can
            see not just the best move but how far ahead of the second-best it was. Positions are
            farmed out to a <b className="text-text">pool of four Web Workers</b>, which is what
            makes a full game analyse in seconds rather than minutes.
          </p>
          <p className="mt-3 text-[13.5px] leading-relaxed text-text-2">
            Each search returns a score in centipawns (hundredths of a pawn) or, when a forced
            checkmate exists, a mate distance. Everything downstream is built on top of those
            two numbers.
          </p>
        </section>

        {/* ── Win% ─────────────────────────────────────────────────── */}
        <section className="mt-10">
          <h2 className="text-[18px] font-bold tracking-tight text-text">
            From centipawns to winning chances
          </h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-text-2">
            A raw eval like <span className="font-mono text-text">+1.4</span> doesn&apos;t mean
            much on its own — being a pawn up matters enormously in a sharp middlegame and barely
            at all in a dead-drawn endgame. So we convert every eval into a{" "}
            <b className="text-text">win probability</b> with a logistic curve, the standard
            S-shape that squashes scores into a 0–100% range and flattens out once a position is
            already winning or lost.
          </p>
          <p className="mt-3 text-[13.5px] leading-relaxed text-text-2">
            We actually use <b className="text-text">two</b> versions of that curve, deliberately
            kept apart — grading a move and scoring accuracy are different jobs that used to share
            one constant. The move classifications run on the <b className="text-text">steeper</b>{" "}
            curve, whose thresholds line up with chess.com&apos;s expected-points bands. The
            accuracy score reads win% off a separate, <b className="text-text">gentler</b> curve
            (a shade gentler even than the well-known Lichess fit) and then leans on a steep
            per-move mapping to decide what each slip costs. Pulling the two apart is what let us
            recalibrate accuracy in mid-2026 without moving a single move label — and both are
            constants we fit against real data (below).
          </p>
        </section>

        {/* ── Classification ───────────────────────────────────────── */}
        <section className="mt-10">
          <h2 className="text-[18px] font-bold tracking-tight text-text">Grading each move</h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-text-2">
            Every move is graded by its <b className="text-text">win-probability loss</b>: how
            much winning chance you gave up versus playing the engine&apos;s best move. The loss
            falls into bands — a tiny slip is an <i className="text-text">inaccuracy</i>, a
            bigger one a <i className="text-text">mistake</i>, a game-changer a{" "}
            <i className="text-text">blunder</i> — with the cutoffs lined up against chess.com&apos;s
            published expected-points bands.
          </p>
          <p className="mt-3 text-[13.5px] leading-relaxed text-text-2">
            The flattering labels are deliberately strict. <b className="text-text">Best</b> means
            you matched (or equalled) the top engine line. <b className="text-text">Great</b> is
            reserved for a genuinely critical, non-forced find — the <i>only</i> move that holds a
            losing line level or converts an equal one, in a position that&apos;s still
            contested — which is why forced recaptures and already-decided positions don&apos;t
            qualify however &ldquo;only&rdquo; the move was. <b className="text-text">Brilliant</b>{" "}
            additionally requires a sound sacrifice. Getting <i>Great</i> to stop over-firing
            (it was once flagging ~7% of all moves, including every recapture; now ~0.6%) was a
            calibration exercise of its own.
          </p>
        </section>

        {/* ── Accuracy ─────────────────────────────────────────────── */}
        <section className="mt-10">
          <h2 className="text-[18px] font-bold tracking-tight text-text">
            Turning a game into one accuracy number
          </h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-text-2">
            Each move gets a 0–100 accuracy from its win-probability loss, and a game&apos;s
            accuracy is a <b className="text-text">power mean</b> of those — a generalised average
            tuned to sit between the geometric and arithmetic mean (the shipped exponent is about{" "}
            <span className="font-mono text-text">0.305</span>). Like the harmonic mean we used to
            ship, it leans toward your worst moves — one game-losing blunder <i>should</i> weigh
            more than a dozen routine ones — but calibration found a milder exponent tracks
            chess.com better, because the per-move curve already makes bad moves bite. To stop a
            single near-zero move from collapsing the whole score below what a human reviewer would
            give, per-move accuracies are floored (around <span className="font-mono text-text">9</span>)
            before they&apos;re combined.
          </p>
          <p className="mt-3 text-[13.5px] leading-relaxed text-text-2">
            Two classes of move are excluded entirely. <b className="text-text">Book moves</b>{" "}
            (known opening theory) aren&apos;t your decisions, so they don&apos;t count. And once
            a game is <b className="text-text">already decided</b> — a hopeless position being
            slowly ground down, or a winning one being shuffled home — moves in that phase are
            dropped too. Otherwise you&apos;d bank free perfect-accuracy moves for shuffling in a
            won position, or get punished for being slowly mated. The result is an accuracy that
            reflects the part of the game that was still a contest.
          </p>
        </section>

        {/* ── Calibration ──────────────────────────────────────────── */}
        <section className="mt-10">
          <h2 className="text-[18px] font-bold tracking-tight text-text">
            How we calibrated it — and what &ldquo;MAE&rdquo; means
          </h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-text-2">
            None of the constants above — the curve steepness, the accuracy floor, the
            decided-position cutoffs — were guessed. We fit them against a reference we trust:
            chess.com&apos;s own reported accuracy for the same games. The metric we minimise is{" "}
            <b className="text-text">mean absolute error</b> (
            <a
              href="https://en.wikipedia.org/wiki/Mean_absolute_error"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline decoration-line underline-offset-2 transition-colors hover:decoration-accent"
            >
              MAE
            </a>
            ) — the average gap, in accuracy points, between gmbit&apos;s number and chess.com&apos;s
            across hundreds of games. An MAE of 3.5 means we land, on average, within about 3–4
            points of chess.com&apos;s figure.
          </p>
          <p className="mt-3 text-[13.5px] leading-relaxed text-text-2">
            The current numbers come from a <b className="text-text">mid-2026 refit</b>: six
            constants — the two curves, the power-mean exponent and its floor — fit{" "}
            <i>jointly</i> against chess.com&apos;s reported accuracy on{" "}
            <b className="text-text">240 of our own analysed games</b> spanning roughly{" "}
            <b className="text-text">1200–1700</b>. We minimise pooled MAE on a stratified ~75%
            training split and check the held-out quarter the fit never saw. The refit roughly{" "}
            <b className="text-text">halved pooled MAE — from ~6.3 to ~3.5</b> — and improved every
            rating band. It also held up <i>out of distribution</i>: constants fit only on
            ~1500-rated games still cut the error on the 1200 set from{" "}
            <b className="text-text">5.78 to 3.72</b>, a sign we fit the model and not the noise.
            The fit is validated up to ~1700; we haven&apos;t yet checked higher.
          </p>
          <div className="mt-4 overflow-hidden rounded-md border border-line bg-bg-1">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-text-2">
                  <th className="px-3 py-2 font-semibold">Split</th>
                  <th className="px-3 py-2 font-semibold">Games</th>
                  <th className="px-3 py-2 font-semibold">Purpose</th>
                </tr>
              </thead>
              <tbody className="text-text-2">
                <tr className="border-b border-line">
                  <td className="px-3 py-2 text-text">Train</td>
                  <td className="px-3 py-2">~180</td>
                  <td className="px-3 py-2">Stratified ~75% — joint fit of the curves + power mean</td>
                </tr>
                <tr className="border-b border-line">
                  <td className="px-3 py-2 text-text">Holdout</td>
                  <td className="px-3 py-2">~60</td>
                  <td className="px-3 py-2">Held-out quarter — overfitting check</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 text-text">Cross-band</td>
                  <td className="px-3 py-2">—</td>
                  <td className="px-3 py-2">Fit on ~1500 only, applied to 1200 (5.78 → 3.72)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Negative result ──────────────────────────────────────── */}
        <section className="mt-10">
          <h2 className="text-[18px] font-bold tracking-tight text-text">
            What didn&apos;t work: a stronger engine
          </h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-text-2">
            The obvious way to make analysis &ldquo;better&rdquo; is a stronger engine, so we
            tested it directly: the same games, the same accuracy maths, the same depth — swapping
            only Stockfish&apos;s 6.8&nbsp;MB lite net for the full <b className="text-text">108&nbsp;MB</b>{" "}
            net. It made the numbers <i className="text-text">worse</i>: MAE rose from{" "}
            <b className="text-text">5.78 to 6.28</b>, in every rating band, even after re-fitting
            the constants specifically to it.
          </p>
          <p className="mt-3 text-[13.5px] leading-relaxed text-text-2">
            The reason is instructive. The full net is genuinely stronger — it finds more
            refutations and judges more moves as losing — which pushes computed accuracy{" "}
            <i>down and away</i> from chess.com&apos;s labels. Chess.com&apos;s accuracy model is
            tuned around a bounded engine, so a <i>harsher</i> engine isn&apos;t a closer one. The
            residual error — now ~3.5 points after the recalibration — isn&apos;t an
            engine-strength gap we can close by searching harder; it&apos;s model-mismatch noise
            between two reasonable definitions of &ldquo;accuracy.&rdquo; That single experiment
            took deeper search and bigger nets off
            our roadmap and kept gmbit fast and light — which, running in your browser, matters
            more anyway.
          </p>
        </section>

        <div className="mt-12 border-t border-line pt-6">
          <Link
            href="/"
            className="text-[13px] font-medium text-text-2 transition-colors hover:text-text"
          >
            ← Back to home
          </Link>
        </div>
      </main>
    </div>
  );
}
