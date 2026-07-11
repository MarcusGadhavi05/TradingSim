import Link from "next/link";
import { Fraunces } from "next/font/google";

const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
});

/*
 * Landing — "morning paper" editorial take.
 * Palette validated with the dataviz six-checks against paper #F9EFE2:
 * claret #992E24 · gain #0E7C41 (CVD ΔE 15.1, contrast >= 3:1).
 */
const PAPER = "#F9EFE2";
const INK = "#28241C";
const INK_SOFT = "#6B6152";
const RULE = "#D9C8B2";
const CLARET = "#992E24";
const GAIN = "#0E7C41";

const SERIF = { fontFamily: "var(--font-fraunces), Georgia, serif" };

// SVG fractal-noise paper grain, tiled
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.055'/%3E%3C/svg%3E\")";

// Indicative levels for the printed tape (decorative, pre-session)
const TAPE: [string, string, number][] = [
  ["BARC", "297.85", 0.42], ["AZN", "11,752.0", -0.31], ["SPY", "573.20", 0.18],
  ["NVDA", "115.42", 1.24], ["ASML", "681.30", -0.87], ["SAP", "254.90", 0.55],
  ["GBPUSD", "1.2932", 0.09], ["EURUSD", "1.0841", -0.12], ["JPY", "149.75", 0.21],
  ["IGLT", "84.12", -0.05], ["BZ", "71.05", -1.02], ["GC", "2,915.4", 0.64],
];

export default function Landing() {
  return (
    <main
      className={`${fraunces.variable} fixed inset-0 flex flex-col overflow-hidden select-none`}
      style={{ background: PAPER, color: INK }}
    >
      {/* paper grain */}
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: GRAIN, mixBlendMode: "multiply" }} />

      {/* ── MASTHEAD ── */}
      <header className="shrink-0 px-10 pt-6 relative">
        <div className="grid grid-cols-3 items-end pb-3">
          <span className="font-mono text-[10px] tracking-[0.2em]" style={{ color: INK_SOFT }}>
            VOL. II {"·"} SIMULATED MARKETS
          </span>
          <h1 className="text-center text-[42px] leading-none font-semibold tracking-tight" style={SERIF}>
            The Derivatives Desk
          </h1>
          <span className="font-mono text-[10px] tracking-[0.2em] text-right" style={{ color: INK_SOFT }}>
            LONDON {"·"} MARCH{"–"}MAY 2025
          </span>
        </div>
        {/* double rule */}
        <div style={{ borderTop: `3px solid ${INK}` }} />
        <div className="mt-[3px]" style={{ borderTop: `1px solid ${INK}` }} />
        <div className="flex items-center justify-center gap-4 py-2 font-mono text-[10px] tracking-[0.22em]" style={{ color: INK_SOFT, borderBottom: `1px solid ${RULE}` }}>
          <span>A MULTI-ASSET TRADING SIMULATION</span>
          <span style={{ color: CLARET }}>{"◆"}</span>
          <span>{"£"}100,000 STARTING CAPITAL</span>
          <span style={{ color: CLARET }}>{"◆"}</span>
          <span>TWELVE INSTRUMENTS</span>
          <span style={{ color: CLARET }}>{"◆"}</span>
          <span>ONE-HOUR SESSIONS</span>
        </div>
      </header>

      {/* ── BODY: lead story + notice column ── */}
      <div className="relative flex-1 min-h-0 px-10 grid grid-cols-[7fr_5fr]">

        {/* LEAD — the sell side, open for business */}
        <Link href="/sell-side" className="group relative flex flex-col justify-center gap-7 pr-12 py-8 cursor-pointer">
          <div className="flex items-center gap-3 animate-rise" style={{ animationDelay: "60ms" }}>
            <span className="font-mono text-[11px] tracking-[0.28em] font-bold" style={{ color: CLARET }}>
              {"№"} 01 {"—"} THE SELL SIDE
            </span>
            <span className="font-mono text-[9px] tracking-[0.2em] px-2 py-0.5" style={{ color: PAPER, background: GAIN }}>
              OPEN
            </span>
          </div>

          <h2
            className="text-[86px] leading-[0.98] font-medium tracking-[-0.01em] animate-rise"
            style={{ ...SERIF, animationDelay: "140ms" }}
          >
            Make the{" "}
            <span className="relative inline-block">
              market.
              <span
                className="absolute left-0 -bottom-1 h-[3px] w-0 group-hover:w-full transition-all duration-500"
                style={{ background: CLARET }}
              />
            </span>
          </h2>

          <p
            className="max-w-[520px] text-[19px] leading-relaxed italic animate-rise"
            style={{ ...SERIF, color: INK_SOFT, animationDelay: "220ms" }}
          >
            Stream two-way prices, negotiate client RFQs, and carry the book
            through sixty minutes of spring 2025 {"—"} while the tape has other ideas.
          </p>

          <div className="flex items-center gap-5 animate-rise" style={{ animationDelay: "300ms" }}>
            <span className="inline-flex items-center gap-3 font-mono text-[12px] tracking-[0.18em] font-bold px-6 py-3 border-2 border-[#28241C] text-[#28241C] transition-colors duration-300 group-hover:bg-[#992E24] group-hover:border-[#992E24] group-hover:text-[#F9EFE2]">
              ENTER THE DESK
              <span className="inline-block transition-transform duration-300 group-hover:translate-x-1">{"→"}</span>
            </span>
            <span className="font-mono text-[10px] tracking-[0.14em]" style={{ color: INK_SOFT }}>
              NO REGISTRATION {"·"} PAPER MONEY ONLY
            </span>
          </div>
        </Link>

        {/* column rule */}
        <div className="absolute inset-y-8 left-[58.333%]" style={{ borderLeft: `1px solid ${RULE}` }} />

        {/* NOTICE — the buy side, classified-ad box */}
        <div className="relative flex flex-col justify-center gap-6 pl-12 py-8 cursor-not-allowed">
          <div
            className="relative flex flex-col gap-4 p-8 animate-rise"
            style={{ border: `1px solid ${INK}`, outline: `1px solid ${INK}`, outlineOffset: "3px", animationDelay: "260ms" }}
          >
            <span className="font-mono text-[11px] tracking-[0.28em] font-bold" style={{ color: INK_SOFT }}>
              {"№"} 02 {"—"} THE BUY SIDE
            </span>
            <h3 className="text-[38px] leading-[1.02] font-medium" style={SERIF}>
              Take the other side.
            </h3>
            <p className="text-[15px] leading-relaxed italic" style={{ ...SERIF, color: INK_SOFT }}>
              Work orders through dealers, fight for the best price, and build
              the portfolio. The portfolio manager{"'"}s chair is still being upholstered.
            </p>
            {/* stamp */}
            <span
              className="absolute -top-3 right-6 -rotate-6 font-mono text-[11px] tracking-[0.24em] font-bold px-3 py-1"
              style={{ color: CLARET, border: `2px solid ${CLARET}`, background: PAPER }}
            >
              IN DEVELOPMENT
            </span>
            <span className="font-mono text-[10px] tracking-[0.18em]" style={{ color: INK_SOFT }}>
              EXPECTED {"—"} A FUTURE EDITION
            </span>
          </div>

          {/* specs table */}
          <div className="animate-rise" style={{ animationDelay: "340ms" }}>
            {([
              ["Starting capital", "£100,000.00"],
              ["Instruments", "12 — equities · FX · rates · commodities"],
              ["Session length", "60 minutes"],
              ["Price source", "Historical replay, Mar–May 2025"],
            ] as const).map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between py-2 font-mono text-[11px]" style={{ borderBottom: `1px solid ${RULE}` }}>
                <span className="tracking-[0.14em] uppercase" style={{ color: INK_SOFT }}>{k}</span>
                <span className="tabular-nums">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── PRINTED TAPE ── */}
      <footer className="relative shrink-0">
        <div className="mx-10" style={{ borderTop: `1px solid ${INK}` }} />
        <div className="h-10 flex items-center overflow-hidden">
          <div className="animate-marquee whitespace-nowrap">
            {[1, 2].map((iter) => (
              <div key={iter} className="flex shrink-0 items-center">
                {TAPE.map(([tkr, px, pct]) => (
                  <span key={tkr + iter} className="inline-flex items-center gap-2 px-5 font-mono text-[11px] tabular-nums">
                    <span className="font-bold tracking-wide">{tkr}</span>
                    <span>{px}</span>
                    <span style={{ color: pct >= 0 ? GAIN : CLARET }}>
                      {pct >= 0 ? "▲" : "▼"}{Math.abs(pct).toFixed(2)}%
                    </span>
                    <span style={{ color: RULE }}>{"/"}</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="pb-2 text-center font-mono text-[9px] tracking-[0.24em]" style={{ color: INK_SOFT }}>
          PRICES INDICATIVE {"·"} PAPER TRADING ONLY {"·"} NO REAL MONEY CHANGES HANDS
        </div>
      </footer>
    </main>
  );
}
