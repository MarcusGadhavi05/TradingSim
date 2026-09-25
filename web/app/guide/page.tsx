import Link from "next/link";
import Logo from "../../components/Logo";

const TOC: [string, string][] = [
  ["overview", "Overview"],
  ["instruments", "Instruments & the tape"],
  ["options", "How options work"],
  ["futures", "How futures work"],
  ["greeks", "The Greeks"],
  ["clients", "Clients & order flow"],
  ["strategy", "How to do well"],
];

const INSTRUMENTS: [string, string, string][] = [
  ["BARC.L / AZN.L / SPY / NVDA / ASML.AS / SAP.DE", "Equity", "£100 / lot"],
  ["GBPUSD / EURUSD / USDJPY", "FX", "£10,000 / lot"],
  ["IGLT.L (UK Gilts ETF)", "Rates", "£100 / lot"],
  ["Brent Crude (BZ) / Gold (GC)", "Commodity", "£100 / lot"],
];

const GREEKS: [string, string, string][] = [
  ["Delta", "Sensitivity to the underlying's price", "Per unit — standard convention"],
  ["Gamma", "How fast delta itself changes as spot moves", "Per 1% move in spot"],
  ["Vega", "Sensitivity to implied volatility", "Per 1 vol point (1% IV)"],
  ["Theta", "Value lost (or gained, if short) as a day passes", "Per calendar day"],
];

export default function Guide() {
  return (
    <main className="min-h-screen bg-tremor-background-muted text-tremor-content-emphasis font-sans">

      {/* ── NAV ── */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-6 md:px-10 h-16 border-b border-tremor-border/70 bg-tremor-background-muted/80 backdrop-blur-md">
        <Link href="/" className="hover:opacity-80 transition-opacity">
          <Logo size="sm" />
        </Link>
        <nav className="hidden sm:flex items-center gap-8 font-mono text-[11px] tracking-[0.14em] text-tremor-content-subtle">
          <Link href="/#how-it-works" className="hover:text-tremor-content-emphasis transition-colors">HOW IT WORKS</Link>
          <Link href="/#product" className="hover:text-tremor-content-emphasis transition-colors">PRODUCT</Link>
          <span className="text-tremor-brand">GUIDE</span>
        </nav>
        <Link
          href="/select-side"
          className="font-mono text-[11px] tracking-[0.16em] text-tremor-brand border border-tremor-brand/40 rounded-md px-4 py-2 bg-tremor-brand/[0.06] transition-all duration-300 hover:bg-tremor-brand hover:text-tremor-brand-inverted"
        >
          [ ENTER {"→"} ]
        </Link>
      </header>

      {/* ── PAGE HEADER ── */}
      <div className="px-6 md:px-10 pt-16 pb-10 border-b border-tremor-border/70 text-center">
        <span className="font-mono text-[12px] tracking-[0.3em] text-tremor-brand">TRADER'S GUIDE</span>
        <h1 className="mt-4 text-[34px] md:text-[46px] font-bold tracking-tight text-tremor-content-strong">
          How the desk actually works.
        </h1>
        <p className="mt-4 max-w-[560px] mx-auto text-[14px] leading-relaxed text-tremor-content">
          The mechanics behind the session, the pricing, and the Greeks {"—"}
          so nothing on the desk is a surprise once the clock starts.
        </p>
      </div>

      {/* ── BODY: sidebar + content ── */}
      <div className="px-6 md:px-10 py-14 max-w-[1180px] mx-auto flex gap-16">

        {/* sidebar TOC */}
        <aside className="hidden lg:block w-[220px] shrink-0">
          <div className="sticky top-24 flex flex-col gap-3">
            {TOC.map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className="font-mono text-[11px] tracking-[0.1em] text-tremor-content-subtle hover:text-tremor-brand transition-colors"
              >
                {label}
              </a>
            ))}
          </div>
        </aside>

        {/* content */}
        <div className="flex-1 min-w-0 max-w-[720px] flex flex-col gap-20">

          {/* OVERVIEW */}
          <section id="overview" className="flex flex-col gap-4">
            <h2 className="text-[26px] font-bold tracking-tight text-tremor-content-strong">Overview</h2>
            <p className="text-[14px] leading-relaxed text-tremor-content">
              Each session drops you onto a sell-side derivatives desk with{" "}
              <span className="text-tremor-content-emphasis font-semibold">£10,000,000</span> of starting capital and{" "}
              <span className="text-tremor-content-emphasis font-semibold">60 minutes</span> on the clock. Twelve
              instruments trade against a real historical tape replayed from{" "}
              <span className="text-tremor-content-emphasis font-semibold">March {"–"} May 2025</span> {"—"} the session
              always starts from the beginning of that window and compresses roughly the first two calendar days of it
              into your hour, so prices move continuously and realistically rather than jumping between daily closes.
            </p>
            <p className="text-[14px] leading-relaxed text-tremor-content">
              Institutional clients send you RFQs (Requests for Quote) over the client desk chat. You show a two-way
              price; they trade on it, push back, or walk away. Between client flow, you can also deal directly {"—"}
              buying or selling any option or future on the sheet to build a view or hedge whatever the client flow
              has left you with. Your cash, positions and portfolio Greeks all update live as you trade, and your
              final P&L at the end of the hour is the score.
            </p>
          </section>

          {/* INSTRUMENTS */}
          <section id="instruments" className="flex flex-col gap-4">
            <h2 className="text-[26px] font-bold tracking-tight text-tremor-content-strong">Instruments & the tape</h2>
            <p className="text-[14px] leading-relaxed text-tremor-content">
              Twelve underlyings span four asset classes, each with its own starting volatility and its own contract
              size {"—"} an FX lot represents far more notional than an equity lot, so a "100-lot" order means very
              different things depending what you're trading.
            </p>
            <div className="rounded-lg border border-tremor-border overflow-hidden">
              <div className="grid grid-cols-3 bg-tremor-background/60 px-5 py-2.5 text-[10px] uppercase tracking-[0.14em] font-bold text-tremor-content-subtle">
                <span>Instruments</span><span>Asset class</span><span>Contract size</span>
              </div>
              <div className="divide-y divide-tremor-border">
                {INSTRUMENTS.map(([names, cls, size]) => (
                  <div key={names} className="grid grid-cols-3 px-5 py-3.5 text-[13px] text-tremor-content">
                    <span className="pr-4">{names}</span>
                    <span className="text-tremor-content-emphasis">{cls}</span>
                    <span className="font-mono tabular-nums">{size}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* OPTIONS */}
          <section id="options" className="flex flex-col gap-4">
            <h2 className="text-[26px] font-bold tracking-tight text-tremor-content-strong">How options work</h2>
            <p className="text-[14px] leading-relaxed text-tremor-content">
              Every instrument quotes four option contracts: an <span className="text-tremor-content-emphasis">ATM Call</span>{" "}
              and <span className="text-tremor-content-emphasis">ATM Put</span> struck just either side of spot, plus an{" "}
              <span className="text-tremor-content-emphasis">OTM Call</span> and{" "}
              <span className="text-tremor-content-emphasis">OTM Put</span> struck further out. The OTM strikes are
              placed by volatility, not a flat percentage {"—"} about 1.5 standard deviations away given each
              instrument's own implied vol and time to expiry, so a quiet FX pair and a wild single stock both get a
              genuinely out-of-the-money strike instead of one that's either unreachable or barely OTM.
            </p>
            <p className="text-[14px] leading-relaxed text-tremor-content">
              Every contract is priced with real Black-Scholes math against a fixed 30-calendar-day tenor set at the
              start of the session. As the session clock runs, time to expiry actually ticks down and theta bleeds
              value in real time {"—"} though because an hour on the desk only burns through about two of those thirty
              days, you'll see steady decay rather than a last-minute cliff. Positions are marked to market
              continuously; nothing in a normal session runs all the way to expiry or settlement. Buying an option
              spends cash immediately (premium × quantity × contract size); selling one brings cash in immediately,
              with the position marked against you or for you as the tape moves.
            </p>
            <p className="text-[14px] leading-relaxed text-tremor-content">
              Around the desk you'll only ever see the four contracts called by their proper names {"—"}{" "}
              <span className="text-tremor-content-emphasis">ATM Call</span>,{" "}
              <span className="text-tremor-content-emphasis">ATM Put</span>,{" "}
              <span className="text-tremor-content-emphasis">OTM Call</span>,{" "}
              <span className="text-tremor-content-emphasis">OTM Put</span> {"—"} which is standard terminology on any
              London (or any other) options desk. Under the hood the four are tagged{" "}
              <span className="font-mono text-tremor-content-emphasis">bullish</span>,{" "}
              <span className="font-mono text-tremor-content-emphasis">bearish</span>,{" "}
              <span className="font-mono text-tremor-content-emphasis">lottery</span> and{" "}
              <span className="font-mono text-tremor-content-emphasis">hedge</span> respectively {"—"} internal
              shorthand only, not street terminology, so don't repeat those to a client:
            </p>
            <div className="rounded-lg border border-tremor-border overflow-hidden">
              <div className="grid grid-cols-[110px_130px_1fr] bg-tremor-background/60 px-5 py-2.5 text-[10px] uppercase tracking-[0.14em] font-bold text-tremor-content-subtle">
                <span>Internal tag</span><span>Standard name</span><span>What it is</span>
              </div>
              <div className="divide-y divide-tremor-border">
                {[
                  ["bullish", "ATM Call", "Near-the-money call, struck just above spot"],
                  ["bearish", "ATM Put", "Near-the-money put, struck just below spot"],
                  ["lottery", "OTM Call", "Deep out-of-the-money call — cheap, convex, big payoff if it rips"],
                  ["hedge", "OTM Put", "Deep out-of-the-money put — cheap downside protection"],
                ].map(([tag, name, desc]) => (
                  <div key={tag} className="grid grid-cols-[110px_130px_1fr] px-5 py-3.5 text-[13px] text-tremor-content">
                    <span className="font-mono text-tremor-content-subtle">{tag}</span>
                    <span className="font-bold text-tremor-brand">{name}</span>
                    <span className="pr-4">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* FUTURES */}
          <section id="futures" className="flex flex-col gap-4">
            <h2 className="text-[26px] font-bold tracking-tight text-tremor-content-strong">How futures work</h2>
            <p className="text-[14px] leading-relaxed text-tremor-content">
              Each instrument also has a 1-month future: pure linear exposure, delta of exactly 1, no gamma, no vega,
              no theta. Opening a futures position costs no premium and spends no cash up front {"—"} only the
              realised profit or loss from closing it (or from the price moving while you hold it) hits your cash
              balance. That makes futures the cheapest, fastest way to add or remove directional exposure, and the
              standard tool for neutralising the delta an options book leaves you with, without touching its gamma or
              vega profile.
            </p>
          </section>

          {/* GREEKS */}
          <section id="greeks" className="flex flex-col gap-4">
            <h2 className="text-[26px] font-bold tracking-tight text-tremor-content-strong">The Greeks</h2>
            <p className="text-[14px] leading-relaxed text-tremor-content">
              The options chain shows per-contract Greeks before you trade; the Live Portfolio panel's Greeks tab
              shows your <span className="text-tremor-content-emphasis">net book</span> {"—"} every position's Greek,
              scaled by quantity and contract size, summed into one number per Greek. Net delta reads like an
              equivalent number of shares/lots of spot exposure; net vega and theta read as real pound figures.
            </p>
            <div className="rounded-lg border border-tremor-border overflow-hidden">
              <div className="grid grid-cols-[110px_1fr_220px] bg-tremor-background/60 px-5 py-2.5 text-[10px] uppercase tracking-[0.14em] font-bold text-tremor-content-subtle">
                <span>Greek</span><span>Measures</span><span>Units used here</span>
              </div>
              <div className="divide-y divide-tremor-border">
                {GREEKS.map(([name, measures, units]) => (
                  <div key={name} className="grid grid-cols-[110px_1fr_220px] px-5 py-3.5 text-[13px] text-tremor-content">
                    <span className="font-bold text-tremor-brand">{name}</span>
                    <span className="pr-4">{measures}</span>
                    <span className="font-mono text-[12px] text-tremor-content-emphasis">{units}</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-[14px] leading-relaxed text-tremor-content">
              Futures always show 1.0 delta and zero everywhere else {"—"} they're the cleanest tool for adjusting net
              delta without moving your gamma, vega or theta at all.
            </p>
          </section>

          {/* CLIENTS */}
          <section id="clients" className="flex flex-col gap-4">
            <h2 className="text-[26px] font-bold tracking-tight text-tremor-content-strong">Clients & order flow</h2>
            <p className="text-[14px] leading-relaxed text-tremor-content">
              Twelve institutional counterparties sit on the client desk, covering the full spread of a real dealer's
              book: macro and systematic hedge funds, a rival options market maker, a long-only asset manager, a
              pension fund, a family office, a corporate treasury hedging real exposure, a pension risk transfer
              insurer, and a sovereign wealth fund. Each has its own voice, urgency and typical ticket size {"—"} sized
              as underlying notional against your {"£"}10,000,000 book, not a fixed lot count, so the same pound
              amount converts to very different lot counts depending what's being quoted. Smaller accounts deal in
              tickets from roughly {"£"}50,000 up to {"£"}800,000; four larger accounts (Kinross, Solstice, Colossus,
              Obsidian) run from {"£"}300,000 up to {"£"}5,000,000 a ticket. Bigger tickets move more P&L per basis
              point of price improvement, in either direction.
            </p>
            <p className="text-[14px] leading-relaxed text-tremor-content">
              No single trade {"—"} a client fill, a direct order, or a hedge {"—"} can exceed{" "}
              <span className="text-tremor-content-emphasis font-semibold">20,000 lots</span>, and any option purchase
              is still capped by the cash you actually have available.
            </p>
          </section>

          {/* STRATEGY */}
          <section id="strategy" className="flex flex-col gap-4">
            <h2 className="text-[26px] font-bold tracking-tight text-tremor-content-strong">How to do well</h2>
            <ul className="flex flex-col gap-3 text-[14px] leading-relaxed text-tremor-content list-disc pl-5">
              <li>Read the tape before you quote {"—"} the market is already telling you where flow is likely headed.</li>
              <li>Quote wide when you're unsure and tighten for flow you actually want; the spread is your compensation for the risk you're taking on.</li>
              <li>Watch net delta, gamma, vega and theta in the Greeks tab, not just your P&L {"—"} it's easy to build up directional risk by accident, one client fill at a time.</li>
              <li>Use futures to flatten delta cheaply and instantly, and save options for shaping the gamma and vega exposure futures can't touch.</li>
              <li>Theta bleed is real but slow in a single session {"—"} it matters more for what you pay or collect in premium than as a reason to panic-close a position.</li>
              <li>The biggest client tickets carry the biggest reward and the biggest risk of a mispriced quote {"—"} know your Greeks before you show a two-way price on size.</li>
            </ul>
          </section>

        </div>
      </div>

      {/* ── FOOTER ── */}
      <footer className="px-6 md:px-10 py-10 border-t border-tremor-border/70 flex flex-col sm:flex-row items-center justify-between gap-6">
        <Link href="/" className="hover:opacity-80 transition-opacity">
          <Logo size="sm" />
        </Link>
        <Link
          href="/select-side"
          className="font-mono text-[12px] tracking-[0.16em] text-tremor-brand border border-tremor-brand/40 rounded-md px-5 py-2.5 bg-tremor-brand/[0.06] transition-all duration-300 hover:bg-tremor-brand hover:text-tremor-brand-inverted"
        >
          [ ENTER THE PLATFORM {"→"} ]
        </Link>
        <span className="font-mono text-[10px] tracking-[0.1em] text-tremor-content-subtle">
          © 2026 MAG Trading Simulations
        </span>
      </footer>
    </main>
  );
}
