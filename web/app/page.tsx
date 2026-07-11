import Link from "next/link";

// --- Icons ---

const TwoWayIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 8h10" /><path d="m14 5 3 3-3 3" />
    <path d="M17 16H7" /><path d="m10 13-3 3 3 3" />
  </svg>
);

const PortfolioIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="m7 15 3-3 2.5 2.5L17 10" />
  </svg>
);

const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const ArrowIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14" /><path d="m13 6 6 6-6 6" />
  </svg>
);

// --- Page ---

export default function Landing() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-tremor-background-muted text-tremor-content-emphasis font-sans flex flex-col select-none">

      {/* Background: fine grid, faded out radially + champagne glow behind the hero */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(28,37,54,0.55) 1px, transparent 1px), linear-gradient(90deg, rgba(28,37,54,0.55) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse 90% 75% at 50% 38%, black 30%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 90% 75% at 50% 38%, black 30%, transparent 100%)",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 55% 42% at 50% 30%, rgba(201,169,106,0.09), transparent 70%)" }}
      />

      {/* ── HEADER ── */}
      <header className="relative h-16 flex items-center justify-between px-8 shrink-0 border-b border-tremor-border/70">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rotate-45 rounded-[4px] border border-tremor-brand/60 bg-tremor-brand/10 flex items-center justify-center shadow-[0_0_18px_rgba(201,169,106,0.22)]">
            <div className="w-2 h-2 -rotate-45 rounded-full bg-tremor-brand"></div>
          </div>
          <div className="flex flex-col">
            <span className="text-[14px] font-bold tracking-[0.28em] text-tremor-content-strong leading-none">DERIVATIVES&nbsp;DESK</span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-tremor-content-subtle mt-1">Multi-Asset Simulation</span>
          </div>
        </div>
        <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-tremor-content-subtle border border-tremor-border rounded-full px-3 py-1.5 bg-tremor-background/60">
          Historical Replay {"·"} Mar {"–"} May 2025
        </span>
      </header>

      {/* ── HERO + CARDS ── */}
      <div className="relative flex-1 flex flex-col items-center justify-center px-6 py-12 gap-10">

        <div className="flex flex-col items-center text-center gap-4 animate-rise">
          <span className="text-[11px] uppercase tracking-[0.35em] font-bold text-tremor-brand">
            Multi-Asset Derivatives Simulation
          </span>
          <h1 className="text-[44px] md:text-[56px] font-bold tracking-tight text-tremor-content-strong leading-[1.05]">
            Two sides of the market.
            <br />
            <span className="text-tremor-content">Pick yours.</span>
          </h1>
          <p className="max-w-xl text-[15px] leading-relaxed text-tremor-content">
            Trade a live historical replay across equities, FX, rates and commodities
            {" — "}with {"£"}100,000 of starting capital and a desk full of clients.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full max-w-[960px]">

          {/* SELL SIDE — live, wired to the sim */}
          <Link
            href="/sell-side"
            className="group relative flex flex-col gap-5 rounded-xl border border-tremor-border bg-tremor-background/80 p-7 overflow-hidden transition-all duration-300 hover:border-tremor-brand/50 hover:-translate-y-1 hover:shadow-[0_18px_60px_-18px_rgba(201,169,106,0.35)] animate-rise cursor-pointer"
            style={{ animationDelay: "120ms" }}
          >
            {/* top accent line */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-tremor-brand/70 to-transparent opacity-60 group-hover:opacity-100 transition-opacity" />

            <div className="flex items-center justify-between">
              <div className="w-11 h-11 rounded-lg border border-tremor-brand/40 bg-tremor-brand/10 text-tremor-brand flex items-center justify-center">
                <TwoWayIcon />
              </div>
              <span className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.15em] font-bold text-gain bg-gain/10 border border-gain/25 rounded-full px-2.5 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-gain animate-pulse-dot" />
                Live
              </span>
            </div>

            <div>
              <h2 className="text-[26px] font-bold tracking-tight text-tremor-content-strong leading-none">Sell Side</h2>
              <p className="text-[11px] uppercase tracking-[0.18em] font-bold text-tremor-brand/90 mt-2">Market Maker {"·"} Dealer Desk</p>
            </div>

            <p className="text-[13px] leading-relaxed text-tremor-content">
              Run the derivatives desk. Stream two-way prices, negotiate client RFQs,
              and manage the book while the tape moves against you.
            </p>

            <ul className="flex flex-col gap-2.5">
              {[
                "Quote & negotiate live client RFQs",
                "Options & futures on 12 instruments",
                "Real-time P&L, risk and news replay",
              ].map((f) => (
                <li key={f} className="flex items-center gap-2.5 text-[12px] text-tremor-content-emphasis">
                  <span className="text-tremor-brand"><CheckIcon /></span>
                  {f}
                </li>
              ))}
            </ul>

            <span className="mt-auto inline-flex items-center justify-center gap-2 h-11 rounded-md bg-tremor-brand text-tremor-brand-inverted text-[12px] font-bold uppercase tracking-[0.12em] shadow-[0_0_24px_rgba(201,169,106,0.25)] transition-all group-hover:bg-tremor-brand-emphasis group-hover:gap-3">
              Enter the Desk
              <ArrowIcon />
            </span>
          </Link>

          {/* BUY SIDE — in development, intentionally inert */}
          <div
            className="relative flex flex-col gap-5 rounded-xl border border-tremor-border/70 bg-tremor-background/40 p-7 overflow-hidden animate-rise"
            style={{ animationDelay: "220ms" }}
          >
            <div className="flex items-center justify-between">
              <div className="w-11 h-11 rounded-lg border border-tremor-border bg-tremor-background-subtle/60 text-tremor-content-subtle flex items-center justify-center">
                <PortfolioIcon />
              </div>
              <span className="text-[10px] uppercase tracking-[0.15em] font-bold text-tremor-content-subtle bg-tremor-background-subtle/60 border border-tremor-border rounded-full px-2.5 py-1">
                In Development
              </span>
            </div>

            <div>
              <h2 className="text-[26px] font-bold tracking-tight text-tremor-content-emphasis/80 leading-none">Buy Side</h2>
              <p className="text-[11px] uppercase tracking-[0.18em] font-bold text-tremor-content-subtle mt-2">Portfolio Manager {"·"} Institutional Client</p>
            </div>

            <p className="text-[13px] leading-relaxed text-tremor-content-subtle">
              Sit on the other side of the phone. Work orders through dealers, fight
              for the best price, and build a portfolio against the macro tape.
            </p>

            <ul className="flex flex-col gap-2.5">
              {[
                "Request markets from competing dealers",
                "Build & manage a multi-asset portfolio",
                "Performance benchmarked vs. the tape",
              ].map((f) => (
                <li key={f} className="flex items-center gap-2.5 text-[12px] text-tremor-content-subtle">
                  <span className="opacity-50"><CheckIcon /></span>
                  {f}
                </li>
              ))}
            </ul>

            <span className="mt-auto inline-flex items-center justify-center h-11 rounded-md border border-tremor-border bg-tremor-background-subtle/40 text-tremor-content-subtle text-[12px] font-bold uppercase tracking-[0.12em] cursor-not-allowed">
              Coming Soon
            </span>
          </div>
        </div>
      </div>

      {/* ── FOOTER STRIP ── */}
      <footer className="relative h-12 shrink-0 border-t border-tremor-border/70 flex items-center justify-center gap-3 px-6 text-[10px] uppercase tracking-[0.18em] font-bold text-tremor-content-subtle animate-rise" style={{ animationDelay: "320ms" }}>
        <span>{"£"}100,000 Starting Capital</span>
        <span className="text-tremor-border">|</span>
        <span>12 Instruments</span>
        <span className="text-tremor-border">|</span>
        <span>Equities {"·"} FX {"·"} Rates {"·"} Commodities</span>
        <span className="text-tremor-border">|</span>
        <span>60-Minute Sessions</span>
      </footer>
    </main>
  );
}
