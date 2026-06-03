"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type Contract = {
  id: string;
  label: string;
  type: string;
  strike: number;
  premium: number;
  underlying: string;
  spot: number;
};

type Position = {
  contract_id: string;
  label: string;
  quantity: number;
  entry: number;
  current: number;
  pnl: number;
};

type Portfolio = {
  cash: number;
  closed_pnl: number;
  unrealised_pnl: number;
  total_pnl: number;
  equity: number;
  positions: Position[];
};

type NewsItem = {
  sim_time: number;
  real_time: string;
  category: string;
  headline: string;
  impact_hint: string;
};

const BACKEND_WS = process.env.NEXT_PUBLIC_BACKEND_WS_URL || "ws://127.0.0.1:8000/ws";

const fmt = (x: number, dp = 2) =>
  Number(x).toLocaleString("en-GB", { minimumFractionDigits: dp, maximumFractionDigits: dp });
const fmtMoney = (x: number) => (x < 0 ? "-£" : "£") + fmt(Math.abs(x));
const fmtPx = (x: number) => {
  const abs = Math.abs(x);
  if (abs < 10) return fmt(x, 4);
  if (abs < 1000) return fmt(x, 2);
  return fmt(x, 1);
};
const shortTicker = (t: string) =>
  t.replace("=X", "").replace("=F", "").replace(".L", "").replace(".AS", "").replace(".DE", "");

export default function Home() {
  const wsRef = useRef<WebSocket | null>(null);
  const [running, setRunning] = useState(false);
  const [simDuration, setSimDuration] = useState(1200);
  const [simTime, setSimTime] = useState(0);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [history, setHistory] = useState<Record<string, { t: number; px: number }[]>>({});
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [selectedUnderlying, setSelectedUnderlying] = useState<string | null>(null);
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const [tradeQty, setTradeQty] = useState(1);
  const [realDate, setRealDate] = useState<string>("");

  const startSim = useCallback(() => {
    setRunning(true);
    setNews([]);
    const ws = new WebSocket(BACKEND_WS);
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "init") {
        setSimDuration(msg.sim_duration_sec);
        setContracts(msg.contracts);
        const tickers = Array.from(new Set(msg.contracts.map((c: Contract) => c.underlying))) as string[];
        setSelectedUnderlying((prev) => prev || tickers[0]);
      } else if (msg.type === "tick") {
        setSimTime(msg.sim_time);
        setPrices(msg.prices);
        setHistory(msg.history);
        setContracts(msg.menu);
        setPortfolio(msg.portfolio);
        setRealDate(msg.real_time.slice(0, 10));
      } else if (msg.type === "news") {
        setNews((prev) => [msg, ...prev]);
      } else if (msg.type === "sim_complete") {
        setRunning(false);
      }
    };
    ws.onclose = () => setRunning(false);
  }, []);

  const placeOrder = useCallback(
    (direction: 1 | -1) => {
      if (!wsRef.current || wsRef.current.readyState !== 1 || !selectedContractId) return;
      const qty = direction * Math.max(1, tradeQty);
      wsRef.current.send(
        JSON.stringify({ type: "order", contract_id: selectedContractId, quantity: qty })
      );
    },
    [selectedContractId, tradeQty]
  );

  const tickers = Array.from(new Set(contracts.map((c) => c.underlying)));
  const selectedContracts = contracts.filter((c) => c.underlying === selectedUnderlying);
  const orderMap = ["bullish", "bearish", "lottery", "hedge"];
  const subtitles: Record<string, string> = {
    bullish: "Call · Conviction",
    bearish: "Put · Conviction",
    lottery: "Call · Upside",
    hedge: "Put · Downside",
  };
  const typeLabel: Record<string, string> = {
    bullish: "Bullish",
    bearish: "Bearish",
    lottery: "Lottery",
    hedge: "Hedge",
  };

  const remaining = Math.max(0, simDuration - simTime);
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(Math.floor(remaining % 60)).padStart(2, "0");

  const selectedHist = (selectedUnderlying && history[selectedUnderlying]) || [];

  return (
    <main className="h-screen flex flex-col bg-[#0b0d12] text-[#e8ecf3] font-sans text-[12px]">
      {/* TOP BAR */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#1f242e]">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[#4d8eff] shadow-[0_0_8px_#4d8eff]"></div>
          <h1 className="text-[12px] font-bold tracking-wider uppercase">Multi-Asset Derivatives Sim</h1>
          <span className="text-[#4f5662] text-[11px] ml-3">March – May 2025 · £100,000 starting</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[18px] font-semibold tabular-nums">{mm}:{ss}</span>
          <button
            onClick={startSim}
            disabled={running}
            className="bg-[#4d8eff] hover:brightness-110 disabled:bg-[#1f242e] disabled:text-[#4f5662] disabled:cursor-not-allowed text-white px-3 py-1.5 rounded text-[11px] font-semibold"
          >
            {running ? "Running…" : "Start Sim"}
          </button>
        </div>
      </div>

      {/* MARKET TAPE */}
      <div className="flex border-b border-[#1f242e] overflow-x-auto bg-[#12151c]">
        {tickers.length === 0 && (
          <div className="text-[#4f5662] p-2 text-[11px]">Click Start Sim to load market.</div>
        )}
        {tickers.map((t) => {
          const px = prices[t] ?? 0;
          const hist = history[t] || [];
          const first = hist.length ? hist[0].px : px;
          const pct = first > 0 ? (px / first - 1) * 100 : 0;
          const isSel = t === selectedUnderlying;
          return (
            <div
              key={t}
              onClick={() => { setSelectedUnderlying(t); setSelectedContractId(null); }}
              className={`relative px-4 py-2.5 border-r border-[#1f242e] cursor-pointer min-w-[130px] hover:bg-white/[0.02] ${isSel ? "bg-[#4d8eff]/5" : ""}`}
            >
              {isSel && <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#4d8eff] shadow-[0_0_8px_#4d8eff]"></div>}
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#4f5662]">{shortTicker(t)}</div>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="font-mono text-[13px] font-semibold">{fmtPx(px)}</span>
                <span className="text-[#4f5662] text-[8px]">•</span>
                <span className={`font-mono text-[11px] font-medium ${pct >= 0 ? "text-[#2ecc71]" : "text-[#e63946]"}`}>
                  {(pct >= 0 ? "+" : "") + pct.toFixed(2)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* MAIN GRID: chart + news */}
      <div className="flex-1 grid grid-cols-[1fr_340px] gap-px bg-[#1f242e] min-h-0">
        {/* CHART */}
        <div className="bg-[#12151c] flex flex-col min-h-0 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#1f242e] flex items-baseline gap-3 text-[10px] uppercase tracking-wider text-[#4f5662] font-semibold">
            <span className="text-[16px] font-semibold text-[#e8ecf3] normal-case tracking-normal">{selectedUnderlying ? shortTicker(selectedUnderlying) : "—"}</span>
          </div>
          <div className="flex-1 relative">
            {realDate && (
              <div className="absolute top-3 right-4 bg-[#1f242e] text-[#7a8290] px-2.5 py-0.5 rounded-full text-[10px] font-medium z-10 font-mono">{realDate}</div>
            )}
            <Chart hist={selectedHist} />
          </div>
        </div>

        {/* NEWS */}
        <div className="bg-[#12151c] flex flex-col min-h-0 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#1f242e] text-[10px] uppercase tracking-wider text-[#4f5662] font-semibold">Market News</div>
          <div className="flex-1 overflow-auto p-3 space-y-2">
            {news.length === 0 && <div className="text-center text-[#4f5662] text-[11px] p-4">Headlines will appear as the sim progresses.</div>}
            {news.map((n, i) => (
              <div key={i} className="relative bg-white/[0.02] border border-[#1f242e] rounded p-2 pl-3">
                <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${
                  n.category === "macro" ? "bg-[#d29922]" :
                  n.category === "uk" ? "bg-[#58a6ff]" :
                  n.category === "us" ? "bg-[#e63946]" : "bg-[#a371f7]"
                }`}></div>
                <div className="text-[10px] text-[#4f5662] font-mono">{n.real_time.slice(0, 10)}</div>
                <div className="text-[12px] font-medium mt-0.5">{n.headline}</div>
                <div className="text-[10px] text-[#7a8290] italic mt-1">{n.impact_hint}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* BOTTOM: order bar */}
      <div className="grid grid-cols-[2fr_1fr_1.4fr] gap-px bg-[#1f242e] h-[220px] border-t border-[#1f242e]">
        {/* Contracts */}
        <div className="bg-[#12151c] p-3 overflow-y-auto">
          <h3 className="text-[10px] uppercase tracking-wider text-[#4f5662] font-semibold mb-2">
            Contracts <span className="text-[#4d8eff] ml-2 font-mono">{selectedUnderlying && shortTicker(selectedUnderlying)}</span>
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {orderMap.map((kind) => {
              const c = selectedContracts.find((x) => x.id.endsWith("_" + kind));
              if (!c) return null;
              const isSel = c.id === selectedContractId;
              return (
                <div
                  key={kind}
                  onClick={() => setSelectedContractId(c.id)}
                  className={`bg-white/[0.02] border rounded-md p-3 cursor-pointer flex flex-col transition-all ${isSel ? "border-[#4d8eff] border-2 bg-[#4d8eff]/5" : "border-[#1f242e] hover:border-[#4f5662]"}`}
                >
                  <div className="text-[9px] uppercase tracking-wide text-[#4f5662] font-semibold mb-0.5">{subtitles[kind]}</div>
                  <div className="text-[13px] font-semibold">{typeLabel[kind]}</div>
                  <div className="text-[10px] text-[#7a8290] mt-0.5 font-mono">Strike {fmtPx(c.strike)}</div>
                  <div className="text-[22px] font-semibold mt-auto text-right font-mono">{fmtPx(c.premium)}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Trade */}
        <div className="bg-[#12151c] p-3 overflow-y-auto">
          <h3 className="text-[10px] uppercase tracking-wider text-[#4f5662] font-semibold mb-2">Trade</h3>
          <div className="flex border border-[#1f242e] rounded overflow-hidden mb-3">
            <input
              type="number"
              value={tradeQty}
              onChange={(e) => setTradeQty(Math.max(1, parseInt(e.target.value) || 1))}
              min={1}
              className="bg-[#12151c] text-white px-3 py-1.5 w-20 outline-none font-mono text-[14px]"
            />
            <div className="flex flex-1 bg-[#1f242e] gap-px">
              {[1, 5, 10, 25].map((q) => (
                <button
                  key={q}
                  onClick={() => setTradeQty(q)}
                  className={`flex-1 px-2 text-[11px] font-medium ${tradeQty === q ? "bg-[#4d8eff] text-white" : "bg-[#12151c] text-[#7a8290] hover:bg-[#1f242e]"}`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => placeOrder(1)}
              disabled={!selectedContractId}
              className="py-3 rounded font-bold text-[13px] uppercase tracking-wide bg-gradient-to-b from-[#34d399] to-[#10b981] disabled:from-[#1f242e] disabled:to-[#1f242e] disabled:text-[#4f5662] disabled:cursor-not-allowed hover:brightness-110 transition"
            >
              Buy
            </button>
            <button
              onClick={() => placeOrder(-1)}
              disabled={!selectedContractId}
              className="py-3 rounded font-bold text-[13px] uppercase tracking-wide bg-gradient-to-b from-[#f87171] to-[#ef4444] disabled:from-[#1f242e] disabled:to-[#1f242e] disabled:text-[#4f5662] disabled:cursor-not-allowed hover:brightness-110 transition"
            >
              Sell
            </button>
          </div>
        </div>

        {/* Portfolio */}
        <div className="bg-[#12151c] p-3 overflow-y-auto">
          <h3 className="text-[10px] uppercase tracking-wider text-[#4f5662] font-semibold mb-2">Portfolio</h3>
          <div className="mb-3">
            <div className={`text-[28px] font-bold font-mono inline-block pb-0.5 border-b-2 ${portfolio && portfolio.total_pnl >= 0 ? "border-[#2ecc71] text-[#2ecc71]" : "border-[#e63946] text-[#e63946]"}`}>
              {fmtMoney(portfolio?.total_pnl ?? 0)}
            </div>
          </div>
          <div className="flex justify-between text-[11px] mb-1">
            <span className="text-[#4f5662]">Cash</span>
            <span className="text-[#7a8290] font-mono font-medium">{fmtMoney(portfolio?.cash ?? 100000)}</span>
          </div>
          <div className="flex justify-between text-[11px] mb-1">
            <span className="text-[#4f5662]">Equity</span>
            <span className="text-[#7a8290] font-mono font-medium">{fmtMoney(portfolio?.equity ?? 100000)}</span>
          </div>
          <div className="mt-3 border border-[#1f242e] rounded overflow-hidden">
            {portfolio && portfolio.positions.length > 0 ? portfolio.positions.map((p, i) => (
              <div key={i} className={`grid grid-cols-[1fr_40px_80px] px-2 py-1.5 text-[11px] items-center ${i % 2 === 1 ? "bg-white/[0.02]" : ""}`}>
                <div className="text-white font-medium">{p.label.replace(/ \(.*\)/, "")}</div>
                <div className="text-right text-[#4f5662] font-mono">{p.quantity}</div>
                <div className={`text-right font-mono font-semibold ${p.pnl >= 0 ? "text-[#2ecc71]" : "text-[#e63946]"}`}>{fmtMoney(p.pnl)}</div>
              </div>
            )) : (
              <div className="text-center text-[#4f5662] text-[11px] py-4">No positions.</div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function Chart({ hist }: { hist: { t: number; px: number }[] }) {
  if (hist.length < 2) return null;
  const W = 800, H = 320;
  const xs = hist.map((d) => d.t);
  const ys = hist.map((d) => d.px);
  const xmin = xs[0], xmax = xs[xs.length - 1];
  const ymin = Math.min(...ys), ymax = Math.max(...ys);
  const yrange = ymax - ymin || 0.01;
  const ypad = yrange * 0.15;
  const scaleX = (t: number) => ((t - xmin) / Math.max(1e-9, xmax - xmin)) * (W - 80) + 10;
  const scaleY = (p: number) => H - 20 - ((p - (ymin - ypad)) / (yrange + 2 * ypad)) * (H - 40);
  const path = hist.map((d, i) => `${i === 0 ? "M" : "L"}${scaleX(d.t).toFixed(2)},${scaleY(d.px).toFixed(2)}`).join("");
  const last = ys[ys.length - 1];
  const first = ys[0];
  const up = last >= first;
  const colour = up ? "#2ecc71" : "#e63946";
  const lastX = scaleX(xmax), lastY = scaleY(last);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full">
      {[ymin, (ymin + ymax) / 2, ymax].map((v, i) => {
        const y = scaleY(v);
        return <line key={i} x1={0} x2={W} y1={y} y2={y} stroke="#1f242e" strokeWidth={1} opacity={0.3} />;
      })}
      <path d={path} fill="none" stroke={colour} strokeWidth={1.5} />
      <g transform={`translate(${lastX + 5}, ${lastY - 10})`}>
        <rect width={55} height={20} rx={4} fill={colour} />
        <text x={27.5} y={14} fill="white" fontSize={10} fontFamily="monospace" fontWeight={600} textAnchor="middle">{fmtPx(last)}</text>
      </g>
    </svg>
  );
}
