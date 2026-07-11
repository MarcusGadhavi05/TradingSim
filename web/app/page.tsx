import Link from "next/link";

// Decorative, indicative levels for the footer tape (pre-session flavor only)
const TAPE: [string, string, number][] = [
  ["BARC", "297.85", 0.42], ["AZN", "11,752.0", -0.31], ["SPY", "573.20", 0.18],
  ["NVDA", "115.42", 1.24], ["ASML", "681.30", -0.87], ["SAP", "254.90", 0.55],
  ["GBPUSD", "1.2932", 0.09], ["EURUSD", "1.0841", -0.12], ["JPY", "149.75", 0.21],
  ["IGLT", "84.12", -0.05], ["BZ", "71.05", -1.02], ["GC", "2,915.4", 0.64],
];

// Faint two-way quote ladder behind the sell-side half
const LADDER: [string, string][] = [
  ["114.85", "115.05"], ["114.90", "115.10"], ["114.95", "115.15"],
  ["115.00", "115.20"], ["115.05", "115.25"], ["115.10", "115.30"],
  ["115.15", "115.35"], ["115.20", "115.40"], ["115.25", "115.45"],
  ["115.30", "115.50"], ["115.35", "115.55"], ["115.40", "115.60"],
];

const GAIN = "#16C784";
const LOSS = "#F6465D";

export default function Landing() {
  return (
    <main className="fixed inset-0 flex flex-col bg-tremor-background-muted text-tremor-content-emphasis font-sans select-none overflow-hidden">

      {/* ── HEADER ── */}
      <header className="h-14 flex items-center justify-between px-6 shrink-0 border-b border-tremor-border/70 bg-tremor-background/40">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rotate-45 rounded-[3px] border border-tremor-brand/60 bg-tremor-brand/10 flex items-center justify-center">
            <div className="w-1.5 h-1.5 -rotate-45 rounded-full bg-tremor-brand"></div>
          </div>
          <span className="text-[13px] font-bold tracking-[0.28em] text-tremor-content-strong">DERIVATIVES&nbsp;DESK</span>
        </div>
        <span className="font-mono text-[11px] tracking-[0.08em] text-tremor-content-subtle tabular-nums">
          SESSION: MAR{"–"}MAY 2025 REPLAY <span className="mx-2 text-tremor-border">/</span> CAPITAL: {"£"}100,000.00 <span className="mx-2 text-tremor-border">/</span> 60-MIN
        </span>
      </header>

      {/* ── THE SPLIT ── */}
      <div className="relative flex-1 grid grid-cols-2 min-h-0">

        {/* SELL SIDE — the whole half is the door */}
        <Link href="/sell-side" className="group relative flex flex-col items-center justify-center gap-7 overflow-hidden cursor-pointer">
          {/* hover wash */}
          <div
            className="absolute inset-0 opacity-40 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
            style={{ background: "radial-gradient(ellipse 70% 60% at 50% 55%, rgba(201,169,106,0.10), transparent 70%)" }}
          />
          {/* quote-ladder motif */}
          <div className="absolute inset-y-0 left-8 flex flex-col justify-center gap-2.5 font-mono text-[11px] tracking-wider text-tremor-content opacity-[0.10] group-hover:opacity-[0.16] transition-opacity duration-500 pointer-events-none tabular-nums">
            {LADDER.map(([b, a], i) => (
              <div key={i} className="flex gap-6">
                <span>{b}</span><span className="text-tremor-border">/</span><span>{a}</span>
              </div>
            ))}
          </div>

          <div className="relative flex items-center gap-3 animate-rise" style={{ animationDelay: "80ms" }}>
            <span className="font-mono text-[12px] tracking-[0.3em] text-tremor-brand">01 / MARKET MAKER</span>
            <span className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.2em] text-gain">
              <span className="w-1.5 h-1.5 rounded-full bg-gain animate-pulse-dot" />LIVE
            </span>
          </div>

          <h2 className="relative text-[104px] leading-[0.92] font-bold tracking-[-0.03em] text-tremor-content-strong text-center animate-rise transition-transform duration-500 group-hover:scale-[1.02]" style={{ animationDelay: "160ms" }}>
            SELL<br />SIDE
          </h2>

          <p className="relative max-w-[360px] text-center text-[13px] leading-relaxed text-tremor-content animate-rise" style={{ animationDelay: "240ms" }}>
            Run the dealer desk. Stream two-way prices, negotiate client RFQs,
            and manage the book while the tape moves against you.
          </p>

          <span className="relative font-mono text-[13px] tracking-[0.18em] text-tremor-brand border border-tremor-brand/40 rounded-md px-5 py-2.5 bg-tremor-brand/[0.06] transition-all duration-300 group-hover:bg-tremor-brand group-hover:text-tremor-brand-inverted group-hover:shadow-[0_0_32px_rgba(201,169,106,0.35)] animate-rise" style={{ animationDelay: "320ms" }}>
            [ ENTER THE DESK <span className="inline-block transition-transform duration-300 group-hover:translate-x-1">{"→"}</span> ]
          </span>
        </Link>

        {/* BUY SIDE — dimmed, stamped, inert */}
        <div className="relative flex flex-col items-center justify-center gap-7 overflow-hidden cursor-not-allowed">
          {/* sparkline motif */}
          <svg
            className="absolute inset-x-8 bottom-10 h-40 opacity-[0.08] pointer-events-none"
            viewBox="0 0 400 100" preserveAspectRatio="none" fill="none"
          >
            <path d="M0 78 L28 70 L52 74 L80 58 L108 64 L136 44 L164 52 L192 36 L220 46 L248 28 L276 38 L304 20 L332 30 L360 12 L400 18" stroke="#94A0B8" strokeWidth="1.5" />
          </svg>

          <span className="relative font-mono text-[12px] tracking-[0.3em] text-tremor-content-subtle animate-rise" style={{ animationDelay: "80ms" }}>
            02 / PORTFOLIO MANAGER
          </span>

          <div className="relative animate-rise" style={{ animationDelay: "160ms" }}>
            <h2
              className="text-[104px] leading-[0.92] font-bold tracking-[-0.03em] text-center text-transparent"
              style={{ WebkitTextStroke: "1.5px #2a3650" }}
            >
              BUY<br />SIDE
            </h2>
            {/* rubber stamp */}
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-[8deg] font-mono text-[13px] tracking-[0.3em] text-tremor-content-subtle border-2 border-tremor-content-subtle/50 rounded px-4 py-1.5 bg-tremor-background-muted/80 whitespace-nowrap">
              IN DEVELOPMENT
            </span>
          </div>

          <p className="relative max-w-[360px] text-center text-[13px] leading-relaxed text-tremor-content-subtle animate-rise" style={{ animationDelay: "240ms" }}>
            Sit on the other side of the phone. Work orders through dealers,
            fight for the best price, and build the portfolio.
          </p>

          <span className="relative font-mono text-[13px] tracking-[0.18em] text-tremor-content-subtle/70 border border-tremor-border rounded-md px-5 py-2.5 animate-rise" style={{ animationDelay: "320ms" }}>
            [ COMING SOON ]
          </span>
        </div>

        {/* center divider + medallion */}
        <div className="absolute inset-y-0 left-1/2 w-px bg-gradient-to-b from-transparent via-tremor-border to-transparent pointer-events-none" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-tremor-background-muted border border-tremor-border flex items-center justify-center pointer-events-none">
          <div className="w-8 h-8 rotate-45 rounded-[4px] border border-tremor-brand/60 bg-tremor-brand/10 flex items-center justify-center shadow-[0_0_18px_rgba(201,169,106,0.25)]">
            <div className="w-2 h-2 -rotate-45 rounded-full bg-tremor-brand"></div>
          </div>
        </div>
      </div>

      {/* ── FOOTER TAPE ── */}
      <footer className="h-10 shrink-0 border-t border-tremor-border/70 flex items-center overflow-hidden bg-tremor-background/40">
        <div className="animate-marquee whitespace-nowrap">
          {[1, 2].map((iter) => (
            <div key={iter} className="flex shrink-0">
              {TAPE.map(([tkr, px, pct]) => (
                <div key={tkr + iter} className="flex items-center gap-2 px-5 h-10 border-r border-tremor-border/40">
                  <span className="font-bold text-[11px] tracking-wide text-tremor-content">{tkr}</span>
                  <span className="font-mono text-[11px] text-tremor-content-emphasis tabular-nums">{px}</span>
                  <span className="font-mono text-[10px] tabular-nums" style={{ color: pct >= 0 ? GAIN : LOSS }}>
                    {pct >= 0 ? "▴" : "▾"} {Math.abs(pct).toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </footer>
    </main>
  );
}
