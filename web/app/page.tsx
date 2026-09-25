import Link from "next/link";
import Logo from "../components/Logo";

const TAPE: [string, string, number][] = [
  ["BARC", "297.85", 0.42], ["AZN", "11,752.0", -0.31], ["SPY", "573.20", 0.18],
  ["NVDA", "115.42", 1.24], ["ASML", "681.30", -0.87], ["SAP", "254.90", 0.55],
  ["GBPUSD", "1.2932", 0.09], ["EURUSD", "1.0841", -0.12], ["JPY", "149.75", 0.21],
  ["IGLT", "84.12", -0.05], ["BZ", "71.05", -1.02], ["GC", "2,915.4", 0.64],
];

const STEPS: [string, string, string][] = [
  ["01", "READ THE TAPE", "Prices and headlines replay in real time, tick by tick, from an actual historical window. Spot the moves before your clients do."],
  ["02", "QUOTE THE CLIENTS", "RFQs land on the desk from twelve distinct institutions. Show a two-way price and win the trade at your level, not theirs."],
  ["03", "HEDGE THE BOOK", "Lay risk off on the exchange with options and futures before the market runs away from your position."],
];

const STATS: [string, string][] = [
  ["Starting capital", "£10,000,000"],
  ["Session length", "60:00"],
  ["Instruments", "12"],
  ["Historical tape", "Mar–May 2025"],
];

export default function Landing() {
  return (
    <main className="min-h-screen bg-tremor-background-muted text-tremor-content-emphasis font-sans">

      {/* ── NAV ── */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-6 md:px-10 h-16 border-b border-tremor-border/70 bg-tremor-background-muted/80 backdrop-blur-md">
        <Logo size="sm" />
        <nav className="hidden sm:flex items-center gap-8 font-mono text-[11px] tracking-[0.14em] text-tremor-content-subtle">
          <a href="#how-it-works" className="hover:text-tremor-content-emphasis transition-colors">HOW IT WORKS</a>
          <a href="#product" className="hover:text-tremor-content-emphasis transition-colors">PRODUCT</a>
          <Link href="/guide" className="hover:text-tremor-content-emphasis transition-colors">GUIDE</Link>
        </nav>
        <Link
          href="/select-side"
          className="font-mono text-[11px] tracking-[0.16em] text-tremor-brand border border-tremor-brand/40 rounded-md px-4 py-2 bg-tremor-brand/[0.06] transition-all duration-300 hover:bg-tremor-brand hover:text-tremor-brand-inverted"
        >
          [ ENTER {"→"} ]
        </Link>
      </header>

      {/* ── HERO ── */}
      <section className="relative flex flex-col items-center justify-center text-center px-6 pt-28 pb-24 md:pt-36 md:pb-32 overflow-hidden">
        <svg
          className="absolute inset-0 w-full h-full opacity-[0.05] pointer-events-none"
          viewBox="0 0 400 100" preserveAspectRatio="none" fill="none"
        >
          <path d="M0 78 L28 70 L52 74 L80 58 L108 64 L136 44 L164 52 L192 36 L220 46 L248 28 L276 38 L304 20 L332 30 L360 12 L400 18" stroke="#D4B374" strokeWidth="0.6" />
        </svg>

        <span className="relative font-mono text-[12px] tracking-[0.3em] text-tremor-brand animate-rise">
          MULTI-ASSET DERIVATIVES SIMULATION
        </span>

        <h1
          className="relative max-w-[820px] mt-6 text-[42px] md:text-[64px] leading-[1.05] font-bold tracking-tight text-tremor-content-strong animate-rise"
          style={{ animationDelay: "100ms" }}
        >
          Run a real trading desk.
          <br />
          Without the real risk.
        </h1>

        <p
          className="relative max-w-[560px] mt-6 text-[15px] leading-relaxed text-tremor-content animate-rise"
          style={{ animationDelay: "180ms" }}
        >
          Stream two-way prices, negotiate live client RFQs, and manage a
          multi-asset book while a real historical tape replays against you {"—"}
          or work the other side of the phone as a portfolio manager.
        </p>

        <div className="relative flex items-center gap-6 mt-10 animate-rise" style={{ animationDelay: "260ms" }}>
          <Link
            href="/select-side"
            className="group font-mono text-[13px] tracking-[0.18em] text-tremor-brand border border-tremor-brand/40 rounded-md px-6 py-3 bg-tremor-brand/[0.06] transition-all duration-300 hover:bg-tremor-brand hover:text-tremor-brand-inverted hover:shadow-[0_0_32px_rgba(212,179,116,0.4)]"
          >
            [ ENTER THE PLATFORM <span className="inline-block transition-transform duration-300 group-hover:translate-x-1">{"→"}</span> ]
          </Link>
          <a
            href="#how-it-works"
            className="font-mono text-[12px] tracking-[0.16em] text-tremor-content-subtle hover:text-tremor-content-emphasis transition-colors"
          >
            HOW IT WORKS {"↓"}
          </a>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" className="px-6 md:px-10 py-20 md:py-28 border-t border-tremor-border/70 bg-tremor-background/30">
        <div className="max-w-[1080px] mx-auto flex flex-col items-center text-center">
          <span className="font-mono text-[12px] tracking-[0.3em] text-tremor-brand">HOW IT WORKS</span>
          <h2 className="mt-4 text-[32px] md:text-[40px] font-bold tracking-tight text-tremor-content-strong">
            Sixty minutes at the desk.
          </h2>
          <p className="mt-4 max-w-[520px] text-[14px] leading-relaxed text-tremor-content">
            Every session runs the same three phases, whichever seat you take.
          </p>

          <div className="mt-14 grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-tremor-border rounded-lg border border-tremor-border bg-tremor-background/60 w-full text-left">
            {STEPS.map(([n, title, desc]) => (
              <div key={n} className="px-7 py-7 flex flex-col gap-2.5">
                <div className="flex items-baseline gap-2.5">
                  <span className="font-mono text-[12px] text-tremor-brand">{n}</span>
                  <span className="text-[12px] font-bold uppercase tracking-[0.16em] text-tremor-content-emphasis">{title}</span>
                </div>
                <p className="text-[13px] leading-relaxed text-tremor-content">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRODUCT: TWO SEATS ── */}
      <section id="product" className="px-6 md:px-10 py-20 md:py-28 border-t border-tremor-border/70">
        <div className="max-w-[1080px] mx-auto flex flex-col items-center text-center">
          <span className="font-mono text-[12px] tracking-[0.3em] text-tremor-brand">CHOOSE YOUR SEAT</span>
          <h2 className="mt-4 text-[32px] md:text-[40px] font-bold tracking-tight text-tremor-content-strong">
            Two sides of every trade.
          </h2>

          <div className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-6 w-full text-left">
            {/* Sell side */}
            <div className="relative rounded-lg border border-tremor-brand/30 bg-tremor-brand/[0.04] p-8 flex flex-col gap-4 overflow-hidden">
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: "radial-gradient(ellipse 60% 60% at 20% 0%, rgba(212,179,116,0.10), transparent 70%)" }}
              />
              <div className="relative flex items-center gap-3">
                <span className="font-mono text-[11px] tracking-[0.25em] text-tremor-brand">01 / MARKET MAKER</span>
                <span className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.2em] text-gain">
                  <span className="w-1.5 h-1.5 rounded-full bg-gain animate-pulse-dot" />LIVE
                </span>
              </div>
              <h3 className="relative text-[30px] font-bold tracking-tight text-tremor-content-strong">Sell Side</h3>
              <p className="relative text-[13px] leading-relaxed text-tremor-content">
                Run the dealer desk. Stream two-way prices, negotiate client RFQs,
                and manage the book while the tape moves against you.
              </p>
            </div>

            {/* Buy side */}
            <div className="relative rounded-lg border border-tremor-border bg-tremor-background/40 p-8 flex flex-col gap-4 overflow-hidden">
              <span className="font-mono text-[11px] tracking-[0.25em] text-tremor-content-subtle">02 / PORTFOLIO MANAGER</span>
              <div className="flex items-center gap-3">
                <h3 className="text-[30px] font-bold tracking-tight text-tremor-content-subtle">Buy Side</h3>
                <span className="font-mono text-[9px] tracking-[0.2em] text-tremor-content-subtle border border-tremor-border rounded px-2 py-1">
                  IN DEVELOPMENT
                </span>
              </div>
              <p className="text-[13px] leading-relaxed text-tremor-content-subtle">
                Sit on the other side of the phone. Work orders through dealers,
                fight for the best price, and build the portfolio.
              </p>
            </div>
          </div>

          <Link
            href="/select-side"
            className="group font-mono text-[13px] tracking-[0.18em] text-tremor-brand border border-tremor-brand/40 rounded-md px-6 py-3 bg-tremor-brand/[0.06] transition-all duration-300 hover:bg-tremor-brand hover:text-tremor-brand-inverted hover:shadow-[0_0_32px_rgba(212,179,116,0.4)] mt-12"
          >
            [ CHOOSE YOUR SEAT <span className="inline-block transition-transform duration-300 group-hover:translate-x-1">{"→"}</span> ]
          </Link>
        </div>
      </section>

      {/* ── STATS ── */}
      <section className="px-6 md:px-10 py-16 border-t border-tremor-border/70 bg-tremor-background/30">
        <div className="max-w-[880px] mx-auto grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-tremor-border rounded-lg border border-tremor-border bg-tremor-background/60">
          {STATS.map(([k, v]) => (
            <div key={k} className="px-6 py-5 flex flex-col items-center gap-1.5 text-center">
              <span className="text-[9px] uppercase tracking-[0.2em] font-bold text-tremor-content-subtle">{k}</span>
              <span className="font-mono text-[16px] text-tremor-content-strong tabular-nums whitespace-nowrap">{v}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="px-6 md:px-10 py-24 border-t border-tremor-border/70 text-center">
        <h2 className="text-[28px] md:text-[36px] font-bold tracking-tight text-tremor-content-strong">
          The desk is waiting.
        </h2>
        <p className="mt-4 max-w-[440px] mx-auto text-[14px] leading-relaxed text-tremor-content">
          No signup, no risk. Just you, the tape, and the phones.
        </p>
        <Link
          href="/select-side"
          className="group inline-block font-mono text-[13px] tracking-[0.18em] text-tremor-brand border border-tremor-brand/40 rounded-md px-6 py-3 bg-tremor-brand/[0.06] transition-all duration-300 hover:bg-tremor-brand hover:text-tremor-brand-inverted hover:shadow-[0_0_32px_rgba(212,179,116,0.4)] mt-10"
        >
          [ ENTER THE PLATFORM <span className="inline-block transition-transform duration-300 group-hover:translate-x-1">{"→"}</span> ]
        </Link>
      </section>

      {/* ── FOOTER TAPE ── */}
      <div className="h-10 border-t border-tremor-border/70 flex items-center overflow-hidden bg-tremor-background/40">
        <div className="animate-marquee whitespace-nowrap">
          {[1, 2].map((iter) => (
            <div key={iter} className="flex shrink-0">
              {TAPE.map(([tkr, px, pct]) => (
                <div key={tkr + iter} className="flex items-center gap-2 px-5 h-10 border-r border-tremor-border/40">
                  <span className="font-bold text-[11px] tracking-wide text-tremor-content">{tkr}</span>
                  <span className="font-mono text-[11px] text-tremor-content-emphasis tabular-nums">{px}</span>
                  <span className="font-mono text-[10px] tabular-nums" style={{ color: pct >= 0 ? "#18D690" : "#FF4D64" }}>
                    {pct >= 0 ? "▴" : "▾"} {Math.abs(pct).toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ── FOOTER ── */}
      <footer className="px-6 md:px-10 py-10 border-t border-tremor-border/70 flex flex-col sm:flex-row items-center justify-between gap-6">
        <Logo size="sm" />
        <div className="flex items-center gap-8 font-mono text-[10px] tracking-[0.14em] text-tremor-content-subtle">
          <a href="#how-it-works" className="hover:text-tremor-content transition-colors">HOW IT WORKS</a>
          <a href="#product" className="hover:text-tremor-content transition-colors">PRODUCT</a>
          <Link href="/guide" className="hover:text-tremor-content transition-colors">GUIDE</Link>
        </div>
        <span className="font-mono text-[10px] tracking-[0.1em] text-tremor-content-subtle">
          © 2026 MAG Trading Simulations {"·"} For simulation purposes only
        </span>
      </footer>
    </main>
  );
}
