"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  Badge,
  Table,
  TableHead,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
  TabGroup,
  TabList,
  Tab,
  Button,
} from "@tremor/react";
import PriceChart from "../components/PriceChart";

// --- Types & Constants ---

type Contract = {
  id: string;
  label: string;
  subtitle: string;
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
  type?: string;
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

const CONTRACT_SIZE: Record<string, number> = {
  "BARC.L": 100, "AZN.L": 100, "SPY": 100, "NVDA": 100, "ASML.AS": 100, "SAP.DE": 100,
  "GBPUSD=X": 10000, "EURUSD=X": 10000, "JPY=X": 10000, "IGLT.L": 100, "BZ=F": 100, "GC=F": 100,
};

const ASSET_TYPE: Record<string, string> = {
  "BARC.L": "Equity", "AZN.L": "Equity", "SPY": "Equity", "NVDA": "Equity", "ASML.AS": "Equity", "SAP.DE": "Equity",
  "GBPUSD=X": "FX", "EURUSD=X": "FX", "JPY=X": "FX", "IGLT.L": "Rates", "BZ=F": "Commodity", "GC=F": "Commodity",
};

// Validated categorical set (dataviz six-checks, dark surface #0C111C, all-pairs CVD 21.3)
const ASSET_HEX: Record<string, string> = {
  "Equity":    "#3987E5",
  "Commodity": "#C98500",
  "FX":        "#12A5C4",
  "Rates":     "#D55181",
};

// Reserved P&L status colors — never used for series identity
const GAIN = "#16C784";
const LOSS = "#F6465D";

const NEWS_HEX: Record<string, string> = {
  "macro": "#C9A96A", "uk": "#3987E5", "us": "#E66767", "eu": "#9085E9",
};

const CATEGORY_MAP: Record<string, string> = {
  "macro": "MACRO", "uk": "UK", "us": "US", "eu": "EU",
};

const OPTION_NAMES: Record<string, { heading: string; sub: string }> = {
  "bullish": { heading: "ATM CALL", sub: "Near-the-money call" },
  "bearish": { heading: "ATM PUT", sub: "Near-the-money put" },
  "lottery": { heading: "OTM CALL", sub: "Out-of-the-money call" },
  "hedge":   { heading: "OTM PUT", sub: "Out-of-the-money put" },
};

const BACKEND_WS = process.env.NEXT_PUBLIC_BACKEND_WS_URL || "ws://127.0.0.1:8000/ws";
const BACKEND_HTTP = BACKEND_WS.replace(/^ws/, "http").replace(/\/ws$/, "");

// --- Icons ---
const XIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
);

// --- Helpers ---

const fmt = (x: number, dp = 2) =>
  Number(x).toLocaleString("en-GB", { minimumFractionDigits: dp, maximumFractionDigits: dp });
const fmtMoney = (x: number) => (x < 0 ? "-£" : "£") + fmt(Math.abs(x));
const fmtPx = (x: number) => {
  const abs = Math.abs(x);
  if (abs < 1) return fmt(x, 4);
  if (abs < 10) return fmt(x, 3);
  if (abs < 1000) return fmt(x, 2);
  return fmt(x, 1);
};
const shortTicker = (t: string) =>
  t.replace("=X", "").replace("=F", "").replace(".L", "").replace(".AS", "").replace(".DE", "");

// --- Components ---

export default function Home() {
  const wsRef = useRef<WebSocket | null>(null);
  const [running, setRunning] = useState(false);
  const [waking, setWaking] = useState(false);
  const [simDuration, setSimDuration] = useState(3600);
  const [simTime, setSimTime] = useState(0);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [history, setHistory] = useState<Record<string, { t: number; px: number }[]>>({});
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [selectedUnderlying, setSelectedUnderlying] = useState<string | null>(null);
  const [tradeQty, setTradeQty] = useState<number | "">("");
  const [exchangeTab, setExchangeTab] = useState<number>(0); // 0: Options, 1: Futures
  const [contractType, setContractType] = useState<string>("bullish");
  const [realDate, setRealDate] = useState<string>("");
  const [timeMap, setTimeMap] = useState<Record<number, string>>({});
  const [newsSearch, setNewsSearch] = useState("");
  const [assetSort, setAssetSort] = useState<{ col: string; dir: 1 | -1 }>({ col: "Ticker", dir: 1 });
  const [rfqs, setRfqs] = useState<any[]>([]);
  const [clientMsg, setClientMsg] = useState<string>("");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [clientRoster, setClientRoster] = useState<{ client_id: string; name: string; style: string }[]>([]);
  const [lastRead, setLastRead] = useState<Record<string, number>>({});
  const [quoteBids, setQuoteBids] = useState<Record<string, string>>({});
  const [quoteAsks, setQuoteAsks] = useState<Record<string, string>>({});
  const [quoteTickers, setQuoteTickers] = useState<Record<string, string>>({});
  const [quoteQtys, setQuoteQtys] = useState<Record<string, string>>({});
  const [threads, setThreads] = useState<Record<string, { sender: string; text: string; sim_time: number }[]>>({});
  const selectedUnderlyingRef = useRef<string | null>(null);
  const contractTypeRef = useRef<string>("bullish");
  const exchangeTabRef = useRef<number>(0);
  const tradeQtyRef = useRef<number | "">("");
  const activeRfqContractIdRef = useRef<string | null>(null);
  useEffect(() => { selectedUnderlyingRef.current = selectedUnderlying; }, [selectedUnderlying]);
  useEffect(() => { contractTypeRef.current = contractType; }, [contractType]);
  useEffect(() => { exchangeTabRef.current = exchangeTab; }, [exchangeTab]);
  useEffect(() => { tradeQtyRef.current = tradeQty; }, [tradeQty]);

  // Optimistic UI states
  const [closingPositions, setClosingPositions] = useState<Set<string>>(new Set());
  const [pulseBuy, setPulseBuy] = useState(false);
  const [pulseSell, setPulseSell] = useState(false);

  // Timeframe and chart toggle
  const [timeframe, setTimeframe] = useState<number | "all">(15);
  const [chartMode, setChartMode] = useState<"line" | "area">("line");
  const [selectedAssetTab, setSelectedAssetTab] = useState<string>("All");
  const [fit, setFit] = useState<{ scale: number; w: number; h: number } | null>(null);

  // Viewport fit: uniform scale sized so the canvas fills the screen exactly
  // (canvas = viewport / scale — no letterboxing on non-16:9 screens).
  // Design canvas: smaller than 1920×1080 so everything renders ~33% larger.
  useEffect(() => {
    const update = () => {
      const scale = Math.min(window.innerWidth / 1440, window.innerHeight / 810);
      setFit({
        scale,
        w: Math.ceil(window.innerWidth / scale),
        h: Math.ceil(window.innerHeight / scale),
      });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Warm-up on load
  useEffect(() => {
    const warmUp = async () => {
      try {
        setWaking(true);
        await fetch(BACKEND_HTTP);
      } catch (e) {
        console.error("Warm-up failed", e);
      } finally {
        setWaking(false);
      }
    };
    warmUp();
  }, []);

  const startSim = useCallback(() => {
    setRunning(true);
    setNews([]);
    setTimeMap({});
    let simDone = false;   // set on sim_complete — a finished sim must not auto-reconnect
    const connect = () => {
    const ws = new WebSocket(BACKEND_WS);
    wsRef.current = ws;
    ws.onopen = () => setRunning(true);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "init") {
        setSimDuration(msg.sim_duration_sec);
        setClientRoster(msg.clients || []);
        setContracts(msg.contracts);
        const tickers = Array.from(new Set(msg.contracts.map((c: Contract) => c.underlying))) as string[];
        if (!selectedUnderlying) setSelectedUnderlying(tickers[0]);
      } else if (msg.type === "tick") {
        setSimTime(msg.sim_time);
        setPrices(msg.prices);
        setHistory(msg.history);
        setContracts(msg.menu);
        setPortfolio(msg.portfolio);
        setRfqs(msg.rfqs || []);
        setThreads(msg.threads || {});
        // Use HH:MM format for the chart timeline
        const timeStr = msg.real_time.slice(11, 16); // "HH:MM"
        setRealDate(msg.real_time.slice(0, 10));
        setTimeMap(prev => ({ ...prev, [Math.floor(msg.sim_time)]: timeStr }));
        setClosingPositions(new Set());
        // Request a fresh size-adjusted quote for the selected contract every tick
        const suffix = exchangeTabRef.current === 1 ? "future" : contractTypeRef.current;
        const selId = activeRfqContractIdRef.current
          ?? (selectedUnderlyingRef.current ? `${selectedUnderlyingRef.current}_${suffix}` : null);
        if (selId && ws.readyState === 1) {
          ws.send(JSON.stringify({
            type: "quote_request",
            contract_id: selId,
            quantity: Math.max(1, Number(tradeQtyRef.current) || 1),
          }));
        }
      } else if (msg.type === "news") {
        setNews((prev) => [msg, ...prev]);
      } else if (msg.type === "quote") {
        console.log("QUOTE RECEIVED", msg);
        setQuote({ bid: msg.bid, ask: msg.ask });
      } else if (msg.type === "sim_complete") {
        simDone = true;
        setRunning(false);
      } else if (msg.type === "client_result") {
        setClientMsg(msg.message);
      }
    };
    ws.onclose = () => {
      setRunning(false);
      // Auto-reconnect on unexpected drops (e.g. backend restart), retrying until
      // the socket reopens. Stop if the sim finished or a newer socket took over.
      if (!simDone && wsRef.current === ws) setTimeout(connect, 1500);
    };
    };
    connect();
  }, [selectedUnderlying]);

  const placeOrder = useCallback(
    (direction: 1 | -1) => {
      if (!wsRef.current || wsRef.current.readyState !== 1 || !selectedUnderlying) return;
      const suffix = exchangeTab === 1 ? "future" : contractType;
      const contractId = `${selectedUnderlying}_${suffix}`;
      const qty = direction * Math.max(1, Number(tradeQty) || 1);

      if (direction === 1) {
        setPulseBuy(true);
        setTimeout(() => setPulseBuy(false), 200);
      } else {
        setPulseSell(true);
        setTimeout(() => setPulseSell(false), 200);
      }

      wsRef.current.send(
        JSON.stringify({ type: "order", contract_id: contractId, quantity: qty })
      );
    },
    [selectedUnderlying, exchangeTab, contractType, tradeQty]
  );

  const closePosition = useCallback((contract_id: string, quantity: number) => {
    if (!wsRef.current || wsRef.current.readyState !== 1) return;
    setClosingPositions(prev => new Set(prev).add(contract_id));
    wsRef.current.send(
      JSON.stringify({ type: "order", contract_id, quantity: -quantity })
    );
  }, []);

  const liquidateAll = useCallback(() => {
    if (!portfolio || !wsRef.current || wsRef.current.readyState !== 1) return;
    portfolio.positions.forEach(p => {
      closePosition(p.contract_id, p.quantity);
    });
  }, [portfolio, closePosition]);

  // Derived Stats
  const sharesOwned = useMemo(() => {
    return (portfolio?.positions || []).reduce((acc, p) => acc + Math.abs(p.quantity), 0);
  }, [portfolio]);

  const netExposure = useMemo(() => {
    return (portfolio?.positions || []).reduce((acc, p) => {
      const ticker = contracts.find(c => c.id === p.contract_id)?.underlying || "";
      const size = CONTRACT_SIZE[ticker] || 1;
      return acc + (p.quantity * size * p.current);
    }, 0);
  }, [portfolio, contracts]);

  const tickers = useMemo(() => Array.from(new Set(contracts.map((c) => c.underlying))), [contracts]);

  const sortedAssets = useMemo(() => {
    const list = tickers.map(t => {
      const px = prices[t] ?? 0;
      const hist = history[t] || [];
      const first = hist.length ? hist[0].px : px;
      const pct = first > 0 ? (px / first - 1) * 100 : 0;
      return { ticker: t, price: px, chg: pct, type: ASSET_TYPE[t] || "Equity" };
    });

    return list.sort((a, b) => {
      let valA: any = a.ticker, valB: any = b.ticker;
      if (assetSort.col === "Ref Price") { valA = a.price; valB = b.price; }
      else if (assetSort.col === "% Chg") { valA = a.chg; valB = b.chg; }
      else if (assetSort.col === "Type") { valA = a.type; valB = b.type; }

      if (valA < valB) return -assetSort.dir;
      if (valA > valB) return assetSort.dir;
      return 0;
    });
  }, [tickers, prices, history, assetSort]);

  const assetCategories = useMemo(() => {
    const types = Array.from(new Set(tickers.map(t => ASSET_TYPE[t] || "Equity"))).sort();
    return ["All", ...types];
  }, [tickers]);

  const filteredAssets = useMemo(() => {
    if (selectedAssetTab === "All") return sortedAssets;
    return sortedAssets.filter(a => a.type === selectedAssetTab);
  }, [sortedAssets, selectedAssetTab]);

  const getTabLabel = useCallback((cat: string) => {
    const labels: Record<string, string> = {
      All: "All",
      Equity: "Equities",
      Commodity: "Commodities",
      FX: "FX",
      Rates: "Rates",
    };
    return labels[cat] || cat;
  }, []);

  const filteredNews = useMemo(() => {
    const search = (newsSearch || "").trim().toLowerCase();
    if (!search) return news;
    return news.filter(n =>
      (n.headline || "").toLowerCase().includes(search) ||
      (n.category || "").toLowerCase().includes(search)
    );
  }, [news, newsSearch]);

  const selectedContract = useMemo(() => {
    const suffix = exchangeTab === 1 ? "future" : contractType;
    return contracts.find(c => c.underlying === selectedUnderlying && c.id.endsWith(`_${suffix}`));
  }, [contracts, selectedUnderlying, contractType, exchangeTab]);

  const [quote, setQuote] = useState<{ bid: number; ask: number }>({ bid: 0, ask: 0 });

  const bidAsk = quote;

  const remaining = Math.max(0, simDuration - simTime);
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(Math.floor(remaining % 60)).padStart(2, "0");

  const selectedHist = useMemo(() => {
    const raw = (selectedUnderlying && history[selectedUnderlying]) || [];
    if (timeframe === "all") return raw;
    const cutoff = simTime - timeframe;
    return raw.filter(d => d.t >= cutoff);
  }, [selectedUnderlying, history, simTime, timeframe]);

  const accentHex = ASSET_HEX[ASSET_TYPE[selectedUnderlying || ""] || "Equity"];

  // --- Client desk: persistent roster, unread-aware ---
  const latestRfqByClient = useMemo(() => {
    const m: Record<string, any> = {};
    for (const r of rfqs) m[r.client_id] = r;
    return m;
  }, [rfqs]);
  const deskRows = useMemo(() => clientRoster.map((c: any) => ({
    client_id: c.client_id, client_name: c.name, rfq: latestRfqByClient[c.client_id] || null,
  })), [clientRoster, latestRfqByClient]);
  useEffect(() => {
    const rfq = deskRows.find((r: any) => r.client_id === selectedClientId)?.rfq;
    activeRfqContractIdRef.current = rfq?.status === "open" ? rfq.contract_id : null;
  }, [deskRows, selectedClientId]);
  useEffect(() => {
    if (selectedClientId == null && deskRows.length) {
      const live = deskRows.find((r: any) => r.rfq?.status === "open");
      setSelectedClientId((live ?? deskRows[0]).client_id);
    }
  }, [deskRows, selectedClientId]);
  useEffect(() => {
    if (!selectedClientId) return;
    const len = (threads[selectedClientId] || []).length;
    setLastRead(prev => prev[selectedClientId] === len ? prev : { ...prev, [selectedClientId]: len });
  }, [selectedClientId, threads]);
  const isUnread = (cid: string) => {
    const t = threads[cid] || [];
    return t.length > (lastRead[cid] || 0) && t[t.length - 1]?.sender === "client";
  };
  const selectedRow = deskRows.find((r: any) => r.client_id === selectedClientId) || null;
  const statusLabel = (rfq: any) =>
    !rfq ? "no request"
    : rfq.status === "open" ? (rfq.time_left != null ? `${Math.ceil(rfq.time_left)}s` : "live")
    : rfq.status === "filled" ? "done"
    : rfq.status === "rejected" ? "passed"
    : rfq.status === "expired" ? "not interested"
    : rfq.status;
  const sendClientMsg = (rfqId: string, text: string) => {
    if (text && rfqId && wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify({ type: "client_message", rfq_id: rfqId, text }));
    }
  };
  const requestMarket = (clientId: string) => {
    if (wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify({ type: "request_market", client_id: clientId }));
    }
  };
  const sendClientQuote = (rfqId: string) => {
    const bid = parseFloat(quoteBids[rfqId] || "0");
    const ask = parseFloat(quoteAsks[rfqId] || "0");
    if (bid > 0 && ask > 0 && wsRef.current?.readyState === 1) {
      const rfq = rfqs.find((r: any) => r.rfq_id === rfqId);
      const realTkr = rfq ? shortTicker(String(rfq.contract_id).split("_")[0]) : "";
      const quoted_ticker = quoteTickers[rfqId] ?? realTkr;
      const quoted_qty = parseInt(quoteQtys[rfqId] || String(rfq?.quantity ?? 1), 10);
      wsRef.current.send(JSON.stringify({
        type: "client_quote", rfq_id: rfqId, bid, ask, quoted_ticker, quoted_qty,
      }));
    }
  };
  const sendUnsolicitedQuote = (clientId: string) => {
    const key = `unsol_${clientId}`;
    const ticker = (quoteTickers[key] ?? "").trim();
    const qty = parseInt(quoteQtys[key] || "", 10);
    const bid = parseFloat(quoteBids[key] || "0");
    const ask = parseFloat(quoteAsks[key] || "0");
    if (!ticker || !Number.isFinite(qty) || qty <= 0 || !(bid > 0) || !(ask > 0)) return;
    if (wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify({
        type: "unsolicited_quote", client_id: clientId, ticker, qty, bid, ask,
      }));
    }
  };

  return (
    <div className="fixed inset-0 bg-tremor-background-muted overflow-hidden">
    <main
      className="flex flex-col bg-tremor-background-muted text-tremor-content-emphasis font-sans text-[13px] select-none overflow-hidden"
      style={{
        width: fit ? `${fit.w}px` : '100%',
        height: fit ? `${fit.h}px` : '100%',
        transformOrigin: 'top left',
        transform: `scale(${fit?.scale ?? 1})`,
        visibility: fit === null ? 'hidden' : 'visible',
      }}
    >

      {/* ── TOP BAR: identity · session date · clock · start ── */}
      <header className="h-14 flex items-center justify-between px-5 shrink-0 border-b border-tremor-border bg-gradient-to-b from-tremor-background to-tremor-background-muted">
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rotate-45 rounded-[4px] border border-tremor-brand/60 bg-tremor-brand/10 flex items-center justify-center shadow-[0_0_18px_rgba(201,169,106,0.22)]">
              <div className="w-2 h-2 -rotate-45 rounded-full bg-tremor-brand"></div>
            </div>
            <div className="flex flex-col">
              <span className="text-[14px] font-bold tracking-[0.28em] text-tremor-content-strong leading-none">DERIVATIVES&nbsp;DESK</span>
              <span className="text-[10px] uppercase tracking-[0.18em] text-tremor-content-subtle mt-1">Multi-Asset Simulation</span>
            </div>
          </div>
          <div className="w-px h-8 bg-tremor-border"></div>
          <span className="text-[11px] text-tremor-content-subtle whitespace-nowrap">
            March – May 2025 <span className="mx-1 text-tremor-border">|</span> {"£"}100,000 starting capital
          </span>
          {waking && (
            <span className="text-[10px] uppercase tracking-wider font-bold text-tremor-brand/80 bg-tremor-brand/10 border border-tremor-brand/20 rounded-full px-2.5 py-1 animate-pulse-dot">
              Waking backend{"…"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-5">
          {realDate && (
            <div className="flex items-center gap-2 px-3 h-9 rounded-md border border-tremor-border bg-tremor-background-subtle/60">
              <span className="text-[9px] uppercase tracking-[0.15em] font-bold text-tremor-content-subtle">Session</span>
              <span className="font-mono text-[12px] text-tremor-content-emphasis tabular-nums">{realDate}</span>
            </div>
          )}
          <div className="flex items-center gap-2.5">
            <div className={`w-2 h-2 rounded-full ${running ? "bg-tremor-brand shadow-[0_0_10px_rgba(201,169,106,0.8)] animate-pulse-dot" : "bg-tremor-content-subtle/30"}`}></div>
            <span className="font-mono text-[22px] font-semibold tabular-nums tracking-tight text-tremor-content-strong">{mm}:{ss}</span>
          </div>
          <button
            onClick={startSim}
            disabled={running}
            className={`h-9 px-4 rounded-md text-[12px] font-bold uppercase tracking-[0.1em] transition-all ${
              running
                ? "bg-tremor-background-emphasis text-tremor-content-subtle cursor-default"
                : "bg-tremor-brand text-tremor-brand-inverted hover:bg-tremor-brand-emphasis shadow-[0_0_20px_rgba(201,169,106,0.25)] cursor-pointer"
            }`}
          >
            {running ? "In Progress" : "Start Sim"}
          </button>
        </div>
      </header>

      {/* ── MARKET TAPE ── */}
      <div className="h-10 border-b border-tremor-border flex items-center overflow-hidden shrink-0 bg-tremor-background-muted">
        {tickers.length === 0 && (
          <span className="px-5 text-[11px] uppercase tracking-[0.2em] text-tremor-content-subtle/70">
            Market tape {"—"} press Start Sim to begin the replay
          </span>
        )}
        <div className="animate-marquee whitespace-nowrap">
          {[1, 2].map(iter => (
            <div key={iter} className="flex shrink-0">
              {tickers.map(t => {
                const px = prices[t] ?? 0;
                const hist = history[t] || [];
                const first = hist.length ? hist[0].px : px;
                const pct = first > 0 ? (px / first - 1) * 100 : 0;
                const isSel = t === selectedUnderlying;
                return (
                  <div
                    key={t + iter}
                    onClick={() => setSelectedUnderlying(t)}
                    className={`flex items-center gap-2 px-4 h-10 cursor-pointer transition-colors border-r border-tremor-border/60 ${isSel ? "bg-tremor-brand/[0.08] shadow-[inset_0_-2px_0_0_#C9A96A]" : "hover:bg-white/[0.03]"}`}
                  >
                    <span className={`font-bold text-[11px] tracking-wide ${isSel ? "text-tremor-brand" : "text-tremor-content"}`}>{shortTicker(t)}</span>
                    <span className="font-mono text-[12px] text-tremor-content-emphasis tabular-nums">{fmtPx(px)}</span>
                    <span className="font-mono text-[11px] tabular-nums" style={{ color: pct >= 0 ? GAIN : LOSS }}>
                      {pct >= 0 ? "▴" : "▾"} {Math.abs(pct).toFixed(2)}%
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ── KPI STRIP ── */}
      <div className="h-[70px] shrink-0 px-2 pt-2">
        <div className="h-full grid grid-cols-6 divide-x divide-tremor-border rounded-lg border border-tremor-border bg-tremor-background">
          <Stat label="Total P&L" value={fmtMoney(portfolio?.total_pnl ?? 0)} delta={portfolio?.total_pnl} emphasis />
          <Stat label="Realised P&L" value={fmtMoney(portfolio?.closed_pnl ?? 0)} delta={portfolio?.closed_pnl} />
          <Stat label="Unrealised P&L" value={fmtMoney(portfolio?.unrealised_pnl ?? 0)} delta={portfolio?.unrealised_pnl} />
          <Stat label="Available Cash" value={fmtMoney(portfolio?.cash ?? 100000)} />
          <Stat label="Net Exposure" value={fmtMoney(netExposure)} />
          <Stat label="Contracts Held" value={fmt(sharesOwned, 0)} />
        </div>
      </div>

      {/* ── MAIN GRID: watchlist+news · chart+blotter · execution+clients ── */}
      <div className="flex-1 min-h-0 p-2 grid grid-cols-[24fr_32fr_44fr] gap-2">

        {/* LEFT RAIL */}
        <div className="flex flex-col gap-2 min-h-0 min-w-0">

          {/* WATCHLIST */}
          <Panel title="Watchlist" className="flex-[11]" headerExtra={
            <TabGroup
              index={assetCategories.indexOf(selectedAssetTab)}
              onIndexChange={(i) => setSelectedAssetTab(assetCategories[i])}
            >
              <TabList variant="line" className="p-0.5">
                {assetCategories.map(cat => (
                  <Tab key={cat} className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                    {getTabLabel(cat)}
                  </Tab>
                ))}
              </TabList>
            </TabGroup>
          }>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <Table>
                <TableHead className="sticky top-0 bg-tremor-background z-10">
                  <TableRow className="border-b border-tremor-border">
                    {["Ticker", "Ref Price", "% Chg", "Type"].map(col => (
                      <TableHeaderCell
                        key={col}
                        onClick={() => setAssetSort({ col, dir: assetSort.col === col ? (assetSort.dir === 1 ? -1 : 1) : 1 })}
                        className="px-3 py-2 text-[10px] uppercase tracking-wider font-bold text-tremor-content-subtle cursor-pointer hover:text-tremor-content transition-colors"
                      >
                        <span className="inline-flex items-center gap-1">
                          {col}
                          <span className={`text-[9px] ${assetSort.col === col ? "text-tremor-brand opacity-100" : "opacity-30"}`}>
                            {assetSort.col === col ? (assetSort.dir === 1 ? "▴" : "▾") : "↕"}
                          </span>
                        </span>
                      </TableHeaderCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredAssets.map(a => (
                    <TableRow
                      key={a.ticker}
                      onClick={() => setSelectedUnderlying(a.ticker)}
                      className={`border-b border-tremor-border/40 cursor-pointer transition-colors ${selectedUnderlying === a.ticker ? "bg-tremor-brand/[0.07]" : "hover:bg-white/[0.03]"}`}
                    >
                      <TableCell className="px-3 py-2 relative text-[12px] font-semibold text-tremor-content-emphasis">
                        {selectedUnderlying === a.ticker && <div className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r bg-tremor-brand"></div>}
                        {shortTicker(a.ticker)}
                      </TableCell>
                      <TableCell className="px-3 py-2 font-mono text-[12px] text-tremor-content tabular-nums">{fmtPx(a.price)}</TableCell>
                      <TableCell className="px-3 py-2">
                        <span className="font-mono text-[11px] font-semibold tabular-nums" style={{ color: a.chg >= 0 ? GAIN : LOSS }}>
                          {a.chg >= 0 ? "▴" : "▾"} {Math.abs(a.chg).toFixed(2)}%
                        </span>
                      </TableCell>
                      <TableCell className="px-3 py-2">
                        <ClassChip type={a.type} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Panel>

          {/* NEWS */}
          <Panel title="Market Intelligence" className="flex-[8]" headerExtra={
            <input
              type="text"
              placeholder="Search news…"
              value={newsSearch}
              onChange={e => setNewsSearch(e.target.value)}
              className="bg-tremor-background-muted border border-tremor-border rounded-md h-7 px-2 text-[11px] w-44 outline-none placeholder:text-tremor-content-subtle/70 focus:border-tremor-brand/50 transition-colors"
            />
          }>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {filteredNews.length === 0 ? (
                <div className="p-8 text-center text-[12px] text-tremor-content-subtle italic">
                  {news.length === 0 ? "Headlines will appear as the session progresses." : "No news matching filters."}
                </div>
              ) : (
                filteredNews.map((n, i) => {
                  const hex = NEWS_HEX[n.category] || "#94A0B8";
                  return (
                    <div key={i} className="relative px-3 py-2 border-b border-tremor-border/40 animate-fade-in hover:bg-white/[0.02] group/head">
                      <div className="absolute left-0 top-2 bottom-2 w-[2px] rounded-r" style={{ backgroundColor: hex }}></div>
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-px rounded"
                          style={{ color: hex, backgroundColor: hex + "1A" }}
                        >
                          {CATEGORY_MAP[n.category] || n.category.toUpperCase()}
                        </span>
                        <span className="font-mono text-[10px] text-tremor-content-subtle tabular-nums">{n.real_time.slice(0, 16).replace("T", " ")}</span>
                      </div>
                      <div className="text-[12px] leading-snug font-medium text-tremor-content-emphasis">{n.headline}</div>
                      <div className="invisible group-hover/head:visible absolute top-full left-3 z-50 bg-tremor-background-emphasis text-tremor-content-emphasis text-[11px] leading-snug p-2 rounded-md shadow-xl border border-tremor-brand/25 max-w-xs -mt-1">
                        {n.impact_hint}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Panel>
        </div>

        {/* CENTER: CHART + BLOTTER */}
        <div className="flex flex-col gap-2 min-h-0 min-w-0">

          {/* CHART */}
          <Panel title="Price Action" className="flex-[11]" headerExtra={
            <div className="flex items-center gap-3">
              <TabGroup index={([3, 15, 30, 60, "all"] as const).indexOf(timeframe as any)} onIndexChange={(i) => setTimeframe([3, 15, 30, 60, "all"][i] as any)}>
                <TabList variant="line" className="p-0.5">
                  {([3, 15, 30, 60, "all"] as const).map(m => (
                    <Tab key={m} className="px-2 py-0.5 text-[10px] font-bold uppercase">{m === "all" ? "All" : `${m}m`}</Tab>
                  ))}
                </TabList>
              </TabGroup>
              <div className="w-px h-4 bg-tremor-border"></div>
              <TabGroup index={chartMode === "line" ? 0 : 1} onIndexChange={(i) => setChartMode(i === 0 ? "line" : "area")}>
                <TabList variant="line" className="p-0.5">
                  <Tab className="px-2 py-0.5 text-[10px] font-bold uppercase">Line</Tab>
                  <Tab className="px-2 py-0.5 text-[10px] font-bold uppercase">Area</Tab>
                </TabList>
              </TabGroup>
            </div>
          }>
            {/* Instrument strip above the plot */}
            <div className="flex items-baseline gap-3 px-4 pt-2.5 pb-1 shrink-0">
              <span className="text-[19px] font-bold tracking-tight text-tremor-content-strong leading-none">
                {selectedUnderlying ? shortTicker(selectedUnderlying) : "—"}
              </span>
              {selectedUnderlying && <ClassChip type={ASSET_TYPE[selectedUnderlying] || "Equity"} />}
              {selectedUnderlying && prices[selectedUnderlying] != null && (
                <span className="font-mono text-[17px] text-tremor-content-emphasis tabular-nums">{fmtPx(prices[selectedUnderlying])}</span>
              )}
              {(() => {
                const hist = (selectedUnderlying && history[selectedUnderlying]) || [];
                if (hist.length < 2) return null;
                const pct = (hist[hist.length - 1].px / hist[0].px - 1) * 100;
                return (
                  <span className="font-mono text-[13px] font-semibold tabular-nums" style={{ color: pct >= 0 ? GAIN : LOSS }}>
                    {pct >= 0 ? "▴" : "▾"} {Math.abs(pct).toFixed(2)}%
                  </span>
                );
              })()}
              <span className="ml-auto font-mono text-[10px] text-tremor-content-subtle tabular-nums">{realDate}</span>
            </div>
            <div className="flex-1 relative overflow-hidden min-h-[80px]">
              <PriceChart
                hist={selectedHist}
                mode={chartMode}
                timeMap={timeMap}
                ticker={selectedUnderlying || "Price"}
                color={accentHex}
              />
            </div>
          </Panel>

          {/* POSITIONS BLOTTER */}
          <Panel title="Live Portfolio" className="flex-[8]" headerExtra={
            <button
              onClick={liquidateAll}
              className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md text-loss/90 hover:text-loss hover:bg-loss/10 border border-transparent hover:border-loss/20 transition-colors cursor-pointer"
            >
              Liquidate All
            </button>
          }>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <Table>
                <TableHead className="sticky top-0 bg-tremor-background z-10">
                  <TableRow className="border-b border-tremor-border">
                    <TableHeaderCell className="px-3 py-2 text-[10px] uppercase tracking-wider font-bold text-tremor-content-subtle">Security</TableHeaderCell>
                    <TableHeaderCell className="px-2 py-2 text-[10px] uppercase tracking-wider font-bold text-tremor-content-subtle text-right">Net Pos</TableHeaderCell>
                    <TableHeaderCell className="px-2 py-2 text-[10px] uppercase tracking-wider font-bold text-tremor-content-subtle text-right">Avg Price</TableHeaderCell>
                    <TableHeaderCell className="px-2 py-2 text-[10px] uppercase tracking-wider font-bold text-tremor-content-subtle text-right">Pos Value</TableHeaderCell>
                    <TableHeaderCell className="px-2 py-2 text-[10px] uppercase tracking-wider font-bold text-tremor-content-subtle text-right">U P&L</TableHeaderCell>
                    <TableHeaderCell className="px-2 py-2 text-[10px] uppercase tracking-wider font-bold text-tremor-content-subtle text-right">Close</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {!portfolio || portfolio.positions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-tremor-content-subtle text-[12px] italic">
                        No open positions {"—"} fills will appear here.
                      </TableCell>
                    </TableRow>
                  ) : (
                    portfolio.positions.map(p => {
                      const isClosing = closingPositions.has(p.contract_id);
                      const ticker = contracts.find(c => c.id === p.contract_id)?.underlying || "";
                      const size = CONTRACT_SIZE[ticker] || 1;
                      const posValue = Math.abs(p.quantity * size * p.current);
                      const isPositive = p.pnl >= 0;
                      return (
                        <TableRow key={p.contract_id} className={`border-b border-tremor-border/40 hover:bg-white/[0.03] transition-colors ${isClosing ? "opacity-40 grayscale pointer-events-none" : ""}`}>
                          <TableCell className="px-3 py-2 font-semibold text-[12px] text-tremor-content-emphasis">{p.label.split(" (")[0]}</TableCell>
                          <TableCell className="px-2 py-2 text-right">
                            <span className="font-mono font-semibold text-[12px] tabular-nums" style={{ color: p.quantity >= 0 ? GAIN : LOSS }}>{p.quantity}</span>
                          </TableCell>
                          <TableCell className="px-2 py-2 text-right font-mono text-[12px] text-tremor-content tabular-nums">{fmtPx(p.entry)}</TableCell>
                          <TableCell className="px-2 py-2 text-right font-mono text-[12px] text-tremor-content tabular-nums">{fmtMoney(posValue)}</TableCell>
                          <TableCell className="px-2 py-2 text-right">
                            <span className="font-mono font-semibold text-[12px] tabular-nums" style={{ color: isPositive ? GAIN : LOSS }}>{fmtMoney(p.pnl)}</span>
                          </TableCell>
                          <TableCell className="px-2 py-2 text-right">
                            <button
                              onClick={() => closePosition(p.contract_id, p.quantity)}
                              className="inline-flex items-center justify-center w-7 h-7 rounded-md text-tremor-content-subtle hover:text-loss hover:bg-loss/15 transition-colors cursor-pointer"
                            >
                              <XIcon />
                            </button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </Panel>
        </div>

        {/* RIGHT RAIL: EXECUTION + CLIENT DESK */}
        <div className="flex flex-col gap-2 min-h-0 min-w-0">

          {/* EXECUTION */}
          <Panel title="Execution" className="flex-[8]" headerExtra={
            <TabGroup index={exchangeTab} onIndexChange={setExchangeTab}>
              <TabList variant="solid" className="p-0.5">
                <Tab className="text-[10px] font-bold uppercase tracking-wider py-0.5 px-3">Options</Tab>
                <Tab className="text-[10px] font-bold uppercase tracking-wider py-0.5 px-3">Futures</Tab>
              </TabList>
            </TabGroup>
          }>
            <div className="flex-1 p-2.5 flex flex-col min-h-0">
              <div className="flex items-center gap-2.5 mb-1 shrink-0 animate-fade-in">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: accentHex }}></span>
                <span className="text-[18px] font-bold tracking-tight text-tremor-content-strong leading-none whitespace-nowrap">
                  {selectedUnderlying ? shortTicker(selectedUnderlying) : "Select Asset"}
                </span>
                <ClassChip type={ASSET_TYPE[selectedUnderlying || ""] || "Equity"} />
                <div className="relative flex-1 min-w-0 ml-1">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[9px] uppercase tracking-wider font-bold text-tremor-content-subtle pointer-events-none">Qty</span>
                  <input
                    type="number"
                    value={tradeQty}
                    onChange={e => setTradeQty(e.target.value === "" ? "" : Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full bg-tremor-background-muted border border-tremor-border rounded-md h-8 pl-9 pr-2 font-mono text-[14px] text-tremor-content-emphasis outline-none focus:border-tremor-brand/50 transition-colors tabular-nums"
                  />
                </div>
                <div className="flex gap-1">
                  {[1, 10, 50, 100].map(v => (
                    <button
                      key={v}
                      onClick={() => setTradeQty(v)}
                      className={`h-8 px-2.5 rounded-md text-[11px] font-bold font-mono transition-colors cursor-pointer border ${
                        tradeQty === v
                          ? "bg-tremor-brand text-tremor-brand-inverted border-tremor-brand"
                          : "bg-tremor-background-muted text-tremor-content border-tremor-border hover:border-tremor-brand/40 hover:text-tremor-content-emphasis"
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 min-h-[46px] overflow-y-auto mb-0.5">
                {exchangeTab === 0 ? (
                  <div className="grid grid-cols-2 gap-1.5">
                    {(["bullish", "bearish", "lottery", "hedge"] as const).map(type => {
                      const c = contracts.find(x => x.underlying === selectedUnderlying && x.id.endsWith(`_${type}`));
                      const isSel = contractType === type;
                      const name = OPTION_NAMES[type];
                      return (
                        <div
                          key={type}
                          onClick={() => setContractType(type)}
                          className={`px-2.5 py-1 cursor-pointer rounded-md border transition-all flex flex-col gap-0.5 ${isSel ? "" : "border-tremor-border bg-tremor-background-muted/40 hover:bg-white/[0.03] hover:border-tremor-ring"}`}
                          style={isSel ? { borderColor: accentHex, backgroundColor: accentHex + "14", boxShadow: `inset 0 0 0 1px ${accentHex}40` } : undefined}
                        >
                          <div className="flex items-baseline justify-between gap-1">
                            <span className="text-[12px] font-bold tracking-wide text-tremor-content-emphasis whitespace-nowrap">{name.heading}</span>
                            <span className="text-[15px] font-bold font-mono leading-none text-tremor-content-strong tabular-nums">{fmtPx(c?.premium || 0)}</span>
                          </div>
                          <div className="flex items-baseline justify-between gap-1">
                            <span className="text-[9px] uppercase font-bold tracking-wider text-tremor-content-subtle">Strike</span>
                            <span className="text-[11px] font-mono text-tremor-content tabular-nums">{fmtPx(c?.strike || 0)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  (() => {
                    const f = contracts.find(x => x.underlying === selectedUnderlying && x.id.endsWith("_future"));
                    const px = f?.premium || 0;
                    const size = CONTRACT_SIZE[selectedUnderlying || ""] || 1;
                    const notional = px * size;
                    return (
                      <div className="rounded-md border p-2.5 flex flex-col gap-2" style={{ borderColor: accentHex + "80", backgroundColor: accentHex + "0D" }}>
                        <div className="flex items-baseline gap-2.5">
                          <span className="text-[12px] uppercase font-black tracking-[0.15em] whitespace-nowrap" style={{ color: accentHex }}>1M Future</span>
                          <span className="text-[11px] font-bold text-tremor-content font-mono">{selectedUnderlying}</span>
                          <span className="ml-auto text-[20px] font-bold font-mono leading-none tracking-tight text-tremor-content-strong tabular-nums">{fmtPx(px)}</span>
                        </div>
                        <div className="grid grid-cols-4 gap-px bg-tremor-border rounded-md overflow-hidden">
                          {([
                            ["Contract", "1M Future"],
                            ["Contract Size", fmt(size, 0)],
                            ["Notional / Contract", fmtMoney(notional)],
                            ["Asset Class", ASSET_TYPE[selectedUnderlying || ""] || "Equity"],
                          ] as const).map(([k, v]) => (
                            <div key={k} className="bg-tremor-background px-2 py-1.5 flex flex-col gap-0.5 min-w-0">
                              <span className="text-[9px] uppercase font-bold tracking-wider text-tremor-content-subtle whitespace-nowrap">{k}</span>
                              <span className="text-[11px] font-mono text-tremor-content tabular-nums whitespace-nowrap">{v}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5 mb-0.5 shrink-0">
                <div
                  onClick={() => placeOrder(-1)}
                  className={`flex items-center justify-center gap-2.5 py-1 cursor-pointer rounded-md border border-loss/30 bg-loss/[0.08] hover:bg-loss/[0.16] hover:border-loss/50 transition-all ${pulseSell ? "btn-pulse-sell" : ""}`}
                >
                  <span className="text-[10px] uppercase tracking-[0.12em] font-bold text-loss/90">Sell {"·"} Bid</span>
                  <span className="font-mono text-[19px] font-bold text-loss tabular-nums leading-none">{fmtPx(bidAsk.bid)}</span>
                </div>
                <div
                  onClick={() => placeOrder(1)}
                  className={`flex items-center justify-center gap-2.5 py-1 cursor-pointer rounded-md border border-gain/30 bg-gain/[0.08] hover:bg-gain/[0.16] hover:border-gain/50 transition-all ${pulseBuy ? "btn-pulse-buy" : ""}`}
                >
                  <span className="text-[10px] uppercase tracking-[0.12em] font-bold text-gain/90">Buy {"·"} Ask</span>
                  <span className="font-mono text-[19px] font-bold text-gain tabular-nums leading-none">{fmtPx(bidAsk.ask)}</span>
                </div>
              </div>

              <div className="mt-auto shrink-0 border-t border-tremor-border pt-1.5 flex justify-between items-baseline">
                <span className="text-tremor-content-subtle uppercase text-[10px] font-bold tracking-[0.12em]">Notional Value</span>
                <span className="font-mono text-[15px] text-tremor-content-strong tabular-nums">
                  {"£"}{fmt((Number(tradeQty) || 0) * (CONTRACT_SIZE[selectedUnderlying || ""] || 1) * (selectedContract?.premium || 0))}
                </span>
              </div>
            </div>
          </Panel>

          {/* CLIENT DESK */}
          <Panel title="Client Desk" className="flex-[11]" headerExtra={
            (() => {
              const live = deskRows.filter((r: any) => r.rfq?.status === "open").length;
              return (
                <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${live > 0 ? "text-tremor-brand bg-tremor-brand/10 border border-tremor-brand/25" : "text-tremor-content-subtle"}`}>
                  {live} live
                </span>
              );
            })()
          }>
            {clientMsg && (
              <div className="px-3 py-2 text-[11px] text-tremor-brand border-b border-tremor-border bg-tremor-brand/[0.06] shrink-0">{clientMsg}</div>
            )}
            <div className="flex-1 flex min-h-0 overflow-hidden">
              <div className="w-[38%] border-r border-tremor-border overflow-y-auto shrink-0 min-h-0">
                {deskRows.length === 0 ? (
                  <div className="p-3 text-[12px] text-tremor-content-subtle italic">Connecting{"…"}</div>
                ) : (
                  deskRows.map((row: any) => {
                    const unread = isUnread(row.client_id);
                    const isSel = row.client_id === selectedClientId;
                    const live = row.rfq?.status === "open";
                    const sub = row.rfq ? `${row.rfq.quantity} ${shortTicker(String(row.rfq.contract_id).split("_")[0])}` : "idle";
                    return (
                      <button key={row.client_id} onClick={() => setSelectedClientId(row.client_id)}
                        className={`w-full text-left px-2.5 py-2 border-b border-tremor-border/40 transition-colors relative cursor-pointer ${isSel ? "bg-tremor-brand/[0.09]" : unread ? "bg-tremor-brand/[0.05]" : "hover:bg-white/[0.03]"}`}>
                        {isSel && <div className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r bg-tremor-brand"></div>}
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-[12px] truncate flex items-center gap-1.5 text-tremor-content-emphasis min-w-0">
                            {unread && <span className="w-1.5 h-1.5 rounded-full bg-tremor-brand shrink-0 animate-pulse-dot"></span>}
                            <span className="truncate">{row.client_name}</span>
                          </span>
                          <span className="font-mono text-[10px] tabular-nums shrink-0 whitespace-nowrap ml-1.5" style={{ color: live ? GAIN : undefined }}>
                            <span className={live ? "" : "text-tremor-content-subtle/70"}>{statusLabel(row.rfq)}</span>
                          </span>
                        </div>
                        <div className="text-[10px] text-tremor-content-subtle mt-0.5 font-mono">{sub}</div>
                      </button>
                    );
                  })
                )}
              </div>
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                {!selectedRow ? (
                  <div className="p-3 text-[12px] text-tremor-content-subtle italic">Select a client.</div>
                ) : (() => {
                  const row = selectedRow;
                  const rfq = row.rfq;
                  const t = threads[row.client_id] || [];
                  const live = rfq?.status === "open";
                  const tkr = rfq ? shortTicker(String(rfq.contract_id).split("_")[0]) : "";
                  const kind = rfq ? (String(rfq.contract_id).split("_")[1] || "") : "";
                  const ref = rfq ? contracts.find(c => c.id === rfq.contract_id) : undefined;
                  const refMid = ref?.premium ?? 0;
                  const qKey = live ? rfq.rfq_id : `unsol_${row.client_id}`;
                  const defTkr = live ? tkr : "";
                  const defQty = live ? String(rfq.quantity) : "";
                  return (
                    <>
                      <div className="px-3 py-2 border-b border-tremor-border shrink-0 bg-tremor-background-subtle/30">
                        <div className="text-[12px] font-bold text-tremor-content-emphasis">{row.client_name}</div>
                        <div className="text-[11px] text-tremor-content mt-0.5">
                          {rfq ? <>{live ? "wants a market in" : "last asked for"} <span className="font-mono tabular-nums">{rfq.quantity}</span> {tkr} <span className="uppercase">{kind}</span> {"·"} ref mid <span className="font-mono tabular-nums">{fmtPx(refMid)}</span> {"·"} {statusLabel(rfq)}</> : "no active request"}
                        </div>
                      </div>
                      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5 bg-tremor-background-muted/40 min-h-0">
                        {t.length === 0 ? (
                          <div className="text-[11px] text-tremor-content-subtle italic">No messages yet.</div>
                        ) : t.map((m: any, i: number) => (
                          <div key={i} className={`flex ${m.sender === "you" ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[85%] rounded-md px-2 py-1 text-[11px] leading-snug ${m.sender === "you" ? "bg-tremor-brand/15 text-tremor-content-emphasis border border-tremor-brand/20" : "bg-white/[0.05] text-tremor-content border border-tremor-border/60"}`}>
                              <span className="opacity-50 mr-1">{m.sender === "you" ? "You:" : `${row.client_name}:`}</span>{m.text}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="p-2 border-t border-tremor-border shrink-0 flex flex-col gap-1.5">
                        {live && (
                          <div className="flex gap-1 flex-wrap">
                            {["Coming now", "Working it", "Can't help"].map(txt => (
                              <button key={txt} onClick={() => sendClientMsg(rfq.rfq_id, txt)}
                                className="text-[10px] px-2 py-1 rounded-md border border-tremor-border bg-tremor-background-muted text-tremor-content hover:border-tremor-brand/40 hover:text-tremor-content-emphasis transition-colors cursor-pointer">
                                {txt}
                              </button>
                            ))}
                          </div>
                        )}
                        {rfq && (
                          <input type="text" placeholder={live ? "Message client…" : "Say something…"}
                            onKeyDown={e => { if (e.key === "Enter") { sendClientMsg(rfq.rfq_id, (e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = ""; } }}
                            className="bg-tremor-background-muted border border-tremor-border rounded-md h-8 px-2 text-[12px] outline-none placeholder:text-tremor-content-subtle/70 focus:border-tremor-brand/50 transition-colors" />
                        )}
                        <div className="flex gap-2 items-end">
                          <div className="flex flex-col min-w-0">
                            <span className="text-[9px] uppercase tracking-wider font-bold text-tremor-content-subtle mb-0.5">Ticker</span>
                            <input
                              type="text"
                              value={quoteTickers[qKey] ?? defTkr}
                              onChange={e => setQuoteTickers(prev => ({ ...prev, [qKey]: e.target.value }))}
                              className="bg-tremor-background-muted border border-tremor-border rounded-md h-8 px-2 text-[12px] font-mono uppercase outline-none focus:border-tremor-brand/50 w-16 min-w-0 transition-colors"
                            />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-[9px] uppercase tracking-wider font-bold text-tremor-content-subtle mb-0.5">Qty</span>
                            <input
                              type="text"
                              value={quoteQtys[qKey] ?? defQty}
                              onChange={e => setQuoteQtys(prev => ({ ...prev, [qKey]: e.target.value }))}
                              className="bg-tremor-background-muted border border-tremor-border rounded-md h-8 px-2 text-[12px] font-mono outline-none focus:border-tremor-brand/50 w-14 min-w-0 transition-colors tabular-nums"
                            />
                          </div>
                          <div className="flex flex-col flex-1 min-w-0">
                            <span className="text-[9px] uppercase tracking-wider font-bold text-loss/90 mb-0.5">Your Bid</span>
                            <input type="number" placeholder="bid" value={quoteBids[qKey] || ""}
                              onChange={e => setQuoteBids(prev => ({ ...prev, [qKey]: e.target.value }))}
                              className="bg-tremor-background-muted border border-tremor-border rounded-md h-8 px-2 text-[12px] font-mono outline-none focus:border-loss/50 transition-colors tabular-nums w-full" />
                          </div>
                          <div className="flex flex-col flex-1 min-w-0">
                            <span className="text-[9px] uppercase tracking-wider font-bold text-gain/90 mb-0.5">Your Ask</span>
                            <input type="number" placeholder="ask" value={quoteAsks[qKey] || ""}
                              onChange={e => setQuoteAsks(prev => ({ ...prev, [qKey]: e.target.value }))}
                              className="bg-tremor-background-muted border border-tremor-border rounded-md h-8 px-2 text-[12px] font-mono outline-none focus:border-gain/50 transition-colors tabular-nums w-full" />
                          </div>
                          <button
                            onClick={() => live ? sendClientQuote(rfq.rfq_id) : sendUnsolicitedQuote(row.client_id)}
                            className="h-8 px-3 rounded-md text-[11px] font-bold uppercase tracking-wider bg-tremor-brand text-tremor-brand-inverted hover:bg-tremor-brand-emphasis transition-colors shrink-0 cursor-pointer"
                          >
                            Quote
                          </button>
                        </div>
                        {!live && (
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] text-tremor-content-subtle italic">No live request.</span>
                            <button onClick={() => requestMarket(row.client_id)}
                              className="text-[10px] px-2 py-1 rounded-md border border-tremor-border bg-tremor-background-muted text-tremor-content hover:border-tremor-brand/40 hover:text-tremor-content-emphasis transition-colors cursor-pointer">
                              Ask for a market
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </main>
    </div>
  );
}

// --- Sub-components (presentational only) ---

function Panel({ title, headerExtra, className = "", children }: {
  title: string; headerExtra?: React.ReactNode; className?: string; children: React.ReactNode;
}) {
  return (
    <section className={`bg-tremor-background border border-tremor-border rounded-lg flex flex-col overflow-hidden min-h-0 ${className}`}>
      <div className="h-10 flex items-center justify-between pl-3 pr-2 border-b border-tremor-border shrink-0 bg-tremor-background-subtle/40">
        <div className="flex items-center gap-2">
          <span className="w-[3px] h-3.5 rounded-full bg-tremor-brand/80"></span>
          <span className="text-[11px] uppercase font-bold tracking-[0.18em] text-tremor-content">{title}</span>
        </div>
        {headerExtra}
      </div>
      {children}
    </section>
  );
}

function ClassChip({ type }: { type: string }) {
  const hex = ASSET_HEX[type] || "#94A0B8";
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
      style={{ color: hex, backgroundColor: hex + "1A", border: `1px solid ${hex}4D` }}
    >
      {type}
    </span>
  );
}

function Stat({ label, value, delta, emphasis }: { label: string; value: string; delta?: number; emphasis?: boolean }) {
  const pnlColor = delta === undefined ? undefined : delta > 0 ? GAIN : delta < 0 ? LOSS : undefined;
  return (
    <div className="flex flex-col justify-center px-5 gap-1 min-w-0">
      <span className="text-[10px] uppercase font-bold tracking-[0.14em] text-tremor-content-subtle leading-none whitespace-nowrap">{label}</span>
      <span className="flex items-baseline gap-1.5 leading-none">
        <span
          className={`font-mono font-semibold tabular-nums ${emphasis ? "text-[18px]" : "text-[15px]"} ${pnlColor ? "" : "text-tremor-content-emphasis"}`}
          style={pnlColor ? { color: pnlColor } : undefined}
        >
          {value}
        </span>
        {delta !== undefined && delta !== 0 && (
          <span className="text-[11px] font-bold" style={{ color: pnlColor }}>{delta > 0 ? "▴" : "▾"}</span>
        )}
      </span>
    </div>
  );
}
