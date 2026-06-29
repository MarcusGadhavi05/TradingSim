"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  Card,
  Metric,
  Text,
  Badge,
  BadgeDelta,
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
  Title,
  Subtitle,
  Bold,
  Flex,
  Grid,
  Col,
  NumberInput,
  Divider,
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

const ASSET_HEX: Record<string, string> = {
  "Equity":    "#4DA3FF",
  "Commodity": "#E0B341",
  "FX":        "#2DD4BF",
  "Rates":     "#A78BFA",
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
const fmtMoney = (x: number) => (x < 0 ? "-\u00A3" : "\u00A3") + fmt(Math.abs(x));const fmtPx = (x: number) => {
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
const [simDuration, setSimDuration] = useState(3600);  const [simTime, setSimTime] = useState(0);
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
  const [threads, setThreads] = useState<Record<string, { sender: string; text: string; sim_time: number }[]>>({});
  const selectedUnderlyingRef = useRef<string | null>(null);
  const contractTypeRef = useRef<string>("bullish");
  const exchangeTabRef = useRef<number>(0);
  const tradeQtyRef = useRef<number | "">("");
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
  const [scale, setScale] = useState<number | null>(null);

  // Viewport scale
  useEffect(() => {
    const update = () =>
      setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
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
    const ws = new WebSocket(BACKEND_WS);
    wsRef.current = ws;
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
        const selId = selectedUnderlyingRef.current ? `${selectedUnderlyingRef.current}_${suffix}` : null;
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
        setRunning(false);
      } else if (msg.type === "client_result") {
        setClientMsg(msg.message);
      }
    };
    ws.onclose = () => setRunning(false);
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
      wsRef.current.send(JSON.stringify({ type: "client_quote", rfq_id: rfqId, bid, ask }));
    }
  };

  return (
    <div className="fixed inset-0 bg-tremor-background-muted overflow-hidden flex items-center justify-center">
    <main className="w-[1920px] h-[1080px] flex flex-col bg-tremor-background-muted text-tremor-content-emphasis font-sans text-[12px] select-none overflow-hidden" style={{ transformOrigin: 'center center', transform: `scale(${scale ?? 1})`, flexShrink: 0, visibility: scale === null ? 'hidden' : 'visible' }}>
      {/* WAKING OVERLAY */}
      {/* ... (omitted overlay code for context) ... */}

      {/* MARKET TAPE STRIP */}
      <div className="h-10 bg-tremor-background-subtle border-b border-tremor-border flex items-center overflow-hidden shrink-0">
        <div className="flex animate-marquee whitespace-nowrap">
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
                    className={`flex items-center gap-2 px-4 h-10 cursor-pointer group transition-colors border-r border-tremor-border bg-tremor-background-subtle ${isSel ? "bg-tremor-brand/10 shadow-[inset_0_2px_0_0_var(--color-tremor-brand-DEFAULT)]" : "hover:bg-tremor-content-strong/[0.04]"}`}
                  >
                    <span className={`font-bold text-[11px] ${isSel ? "text-tremor-brand" : "text-tremor-content"}`}>{shortTicker(t)}</span>
                    <span className="font-mono text-[11px]">{fmtPx(px)}</span>
                    <span className="font-mono text-[10px] ml-1" style={{ color: pct >= 0 ? '#10b981' : '#f43f5e' }}>
{pct >= 0 ? "\u2197" : "\u2198"} {Math.abs(pct).toFixed(2)}%                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <style jsx>{`
          @keyframes marquee {
            from { transform: translateX(0); }
            to { transform: translateX(-50%); }
          }
          .animate-marquee {
            display: flex;
            width: max-content;
            animation: marquee 40s linear infinite;
          }
          .animate-marquee:hover {
            animation-play-state: paused;
          }
        `}</style>
      </div>

      {/* TOP STATS BAR */}
      <div className="flex items-center h-12 border-b border-tremor-border px-4 shrink-0 bg-tremor-background-subtle">
        <Flex className="flex-1 items-center gap-6 overflow-hidden" justifyContent="start">
          <Stat label="Contracts Held" value={fmt(sharesOwned, 0)} />
          <Stat 
            label="Realised P&L" 
            value={fmtMoney(portfolio?.closed_pnl ?? 0)} 
            delta={portfolio?.closed_pnl}
          />
          <Stat 
            label="Unrealised P&L" 
            value={fmtMoney(portfolio?.unrealised_pnl ?? 0)} 
            delta={portfolio?.unrealised_pnl}
          />
          <Stat label="Available Cash" value={fmtMoney(portfolio?.cash ?? 100000)} />
          <Stat 
            label="Total P&L" 
            value={fmtMoney(portfolio?.total_pnl ?? 0)} 
            delta={portfolio?.total_pnl}
          />
          <Stat label="Net Exposure" value={fmtMoney(netExposure)} />
        </Flex>

        <div className="flex items-center gap-4 ml-4">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${running ? "bg-tremor-brand shadow-[0_0_8px_var(--color-tremor-brand-DEFAULT)] animate-pulse-dot" : "bg-tremor-content-strong/10"}`}></div>
            <span className="font-mono text-[18px] font-bold tabular-nums tracking-tight">{mm}:{ss}</span>
          </div>
          <Button
            onClick={startSim}
            disabled={running}
            variant="primary"
            size="sm"
            className={running ? "bg-tremor-background-emphasis text-tremor-content-subtle border-none" : ""}
          >
            {running ? "In Progress" : "Start Sim"}
          </Button>
        </div>
      </div>

      {/* MAIN GRID */}
      <div className="flex-1 min-h-0 grid grid-cols-[26%_34%_40%] grid-rows-[9fr_11fr] gap-px bg-tremor-background-emphasis overflow-hidden">
        {/* PANEL A: ASSETS */}
        <Card className="p-0 flex flex-col border-r border-tremor-border rounded-none bg-tremor-background shadow-none overflow-hidden min-h-0">
          <PanelHeader
            title="Assets"
            headerExtra={
              <TabGroup
                index={assetCategories.indexOf(selectedAssetTab)}
                onIndexChange={(i) => setSelectedAssetTab(assetCategories[i])}
              >
                <TabList variant="line" className="p-0.5">
                  {assetCategories.map(cat => (
                    <Tab key={cat} className="px-1.5 py-0.5 text-[8px] font-bold uppercase">
                      {getTabLabel(cat)}
                    </Tab>
                  ))}
                </TabList>
              </TabGroup>
            }
          />
          <div className="flex-1 min-h-0 overflow-y-auto">
            <Table>
              <TableHead className="sticky top-0 bg-tremor-background-subtle z-10">
                <TableRow className="border-b border-tremor-border">
                  {["Ticker", "Ref Price", "% Chg", "Type"].map(col => (
                    <TableHeaderCell 
                      key={col} 
                      onClick={() => setAssetSort({ col, dir: assetSort.col === col ? (assetSort.dir === 1 ? -1 : 1) : 1 })}
                      className="px-2 py-1 text-[9px] uppercase font-bold text-tremor-content-subtle cursor-pointer hover:text-tremor-content transition-colors"
                    >
                      <Flex justifyContent="start" className="gap-1">
                        {col}
                        <span className="text-[8px] opacity-40">â†•</span>
                      </Flex>
                    </TableHeaderCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredAssets.map(a => (
                  <TableRow 
                    key={a.ticker} 
                    onClick={() => setSelectedUnderlying(a.ticker)}
                    className={`group border-b border-tremor-border/50 cursor-pointer hover:bg-tremor-brand/[0.05] transition-colors ${selectedUnderlying === a.ticker ? "bg-tremor-brand/[0.05]" : ""}`}
                  >
                    <TableCell className="px-2 py-1 font-bold relative text-[10px]">
                      {selectedUnderlying === a.ticker && <div className="absolute left-0 top-1 bottom-1 w-0.5 bg-tremor-brand"></div>}
                      {shortTicker(a.ticker)}
                    </TableCell>
                    <TableCell className="px-2 py-1 font-mono text-[10px] text-tremor-content">{fmtPx(a.price)}</TableCell>
                    <TableCell className="px-2 py-1 text-[10px]">
                      <span className="font-mono text-[10px] font-bold" style={{ color: a.chg >= 0 ? "#10b981" : "#f43f5e" }}>
                        {a.chg >= 0 ? "\u2197" : "\u2198"} {Math.abs(a.chg).toFixed(2)}%
                      </span>
                    </TableCell>
                    <TableCell className="px-2 py-1 text-[10px]">
                      {(() => {
                        const hex = ASSET_HEX[a.type] || "#ffffff";
                        return (
                          <span 
                            className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase border"
                            style={{ color: hex, borderColor: hex, backgroundColor: hex + "1F" }}
                          >
                            {a.type}
                          </span>
                        );
                      })()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* PANEL B: NEWS */}
        <Card className="p-0 flex flex-col rounded-none bg-tremor-background shadow-none overflow-hidden min-h-0">
          <PanelHeader 
            title="Market Intelligence" 
            headerExtra={
              <div className="relative">
                <input 
                  type="text" 
                  placeholder="Search news..." 
                  value={newsSearch}
                  onChange={e => setNewsSearch(e.target.value)}
                  className="bg-tremor-background-muted border border-tremor-border rounded h-6 px-2 text-[10px] w-40 outline-none focus:border-tremor-brand/50"
                />
              </div>
            }
          />
          <div className="flex-1 min-h-0 overflow-y-auto">
            {filteredNews.length === 0 ? (
              <div className="p-8 text-center text-tremor-content-subtle italic">No news matching filters.</div>
            ) : (
              <Table>
                <TableHead className="sticky top-0 bg-tremor-background-subtle z-10">
                  <TableRow className="border-b border-tremor-border">
                    <TableHeaderCell className="px-2 py-1 text-[9px] uppercase font-bold text-tremor-content-subtle w-16">Ticker</TableHeaderCell>
                    <TableHeaderCell className="px-2 py-1 text-[9px] uppercase font-bold text-tremor-content-subtle">Headline</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredNews.map((n, i) => (
                    <TableRow key={i} className="group border-b border-tremor-border/50 animate-fade-in hover:bg-tremor-content-strong/[0.02]">
                      <TableCell className="px-2 py-1.5 align-top">
                        <Badge color={
                          n.category === "macro" ? "amber" :
                          n.category === "uk" ? "blue" :
                          n.category === "us" ? "red" : "violet"
                        } size="xs" className="px-1.5 py-0">
                          {CATEGORY_MAP[n.category] || n.category.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-2 py-1.5 align-top group/head relative">
                        <Title className="font-medium text-[11px] leading-snug">{n.headline}</Title>
                        <Text className="text-[9px] text-tremor-content-subtle mt-0.5 font-mono">{n.real_time.slice(0, 16).replace("T", " ")}</Text>
                        <div className="invisible group-hover/head:visible absolute top-full left-0 z-50 bg-tremor-background-emphasis text-tremor-content-emphasis text-[11px] p-2 rounded shadow-xl border border-tremor-brand/20 max-w-xs mt-1">
                          {n.impact_hint}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </Card>

        {/* PANEL C: POSITIONS */}
        <Card className="p-0 flex flex-col rounded-none bg-tremor-background shadow-none overflow-hidden min-h-0">
          <PanelHeader 
            title="Live Portfolio" 
            headerExtra={
              <Button 
                variant="secondary" 
                size="xs"
                onClick={liquidateAll}
                className="text-[10px] font-bold uppercase text-rose-500 hover:text-rose-600 border-none bg-transparent hover:bg-rose-500/10"
              >
                Liquidate All
              </Button>
            }
          />
          <div className="flex-1 min-h-0 overflow-y-auto">
            <Table>
              <TableHead className="sticky top-0 bg-tremor-background-subtle z-10">
                <TableRow className="border-b border-tremor-border">
                  <TableHeaderCell className="px-2 py-1 text-[9px] uppercase font-bold text-tremor-content-subtle">Security</TableHeaderCell>
                  <TableHeaderCell className="px-1.5 py-1 text-[9px] uppercase font-bold text-tremor-content-subtle text-right">Net Pos</TableHeaderCell>
                  <TableHeaderCell className="px-1.5 py-1 text-[9px] uppercase font-bold text-tremor-content-subtle text-right">Avg Price</TableHeaderCell>
                  <TableHeaderCell className="px-1.5 py-1 text-[9px] uppercase font-bold text-tremor-content-subtle text-right">Pos Value</TableHeaderCell>
                  <TableHeaderCell className="px-1.5 py-1 text-[9px] uppercase font-bold text-tremor-content-subtle text-right">U P&L</TableHeaderCell>
                  <TableHeaderCell className="px-1.5 py-1 text-[9px] uppercase font-bold text-tremor-content-subtle text-right">Close</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody className="font-mono">
                {!portfolio || portfolio.positions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-tremor-content-subtle text-[12px]">
                      {Array(6).fill("- : -").join("     ")}
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
                      <TableRow key={p.contract_id} className={`border-b border-tremor-border/50 hover:bg-tremor-content-strong/[0.04] transition-colors ${isClosing ? "opacity-40 grayscale pointer-events-none" : ""}`}>
                        <TableCell className="px-2 py-1 font-sans font-bold text-[10px]">{p.label.split(" (")[0]}</TableCell>
                        <TableCell className="px-1.5 py-1 text-right font-bold">
                          <Text className={`font-bold text-[10px] ${p.quantity >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{p.quantity}</Text>
                        </TableCell>
                        <TableCell className="px-1.5 py-1 text-right text-[10px] text-tremor-content">{fmtPx(p.entry)}</TableCell>
                        <TableCell className="px-1.5 py-1 text-right text-[10px] text-tremor-content">{fmtMoney(posValue)}</TableCell>
                        <TableCell className="px-1.5 py-1 text-right">
                          <Text className={`font-bold text-[10px] ${isPositive ? "text-emerald-500" : "text-rose-500"}`}>{fmtMoney(p.pnl)}</Text>
                        </TableCell>
                        <TableCell className="px-1.5 py-1 text-right">
                          <Button 
                            variant="light" 
                            size="xs" 
                            icon={XIcon}
                            onClick={() => closePosition(p.contract_id, p.quantity)}
                            className="hover:bg-rose-500 hover:text-tremor-background-muted transition-colors scale-90"
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
       

        {/* PANEL D: CLIENT DESK */}
        <Card className="p-0 rounded-none bg-tremor-background shadow-none flex flex-col overflow-hidden min-h-0">
          <PanelHeader title="Client Desk" headerExtra={
            <span className="text-[9px] uppercase font-bold text-tremor-content-subtle">{deskRows.filter((r:any)=>r.rfq?.status==="open").length} live</span>
          } />
          {clientMsg && (
            <div className="px-3 py-1.5 text-[10px] text-tremor-brand border-b border-tremor-border bg-tremor-brand/5">{clientMsg}</div>
          )}
          <div className="flex-1 flex min-h-0 overflow-hidden">
            <div className="w-[40%] border-r border-tremor-border overflow-y-auto shrink-0 min-h-0">
              {deskRows.length === 0 ? (
                <div className="p-3 text-[11px] text-tremor-content-subtle italic">Connecting...</div>
              ) : (
                deskRows.map((row: any) => {
                  const unread = isUnread(row.client_id);
                  const isSel = row.client_id === selectedClientId;
                  const live = row.rfq?.status === "open";
                  const sub = row.rfq ? `${row.rfq.quantity} ${shortTicker(String(row.rfq.contract_id).split("_")[0])}` : "idle";
                  return (
                    <button key={row.client_id} onClick={() => setSelectedClientId(row.client_id)}
                      className={`w-full text-left px-2 py-1 border-b border-tremor-border/40 transition-colors ${isSel ? "bg-tremor-brand/10" : unread ? "bg-emerald-500/20" : "hover:bg-tremor-content-strong/[0.04]"}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[11px] truncate flex items-center gap-1">
                          {unread && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>}
                          {row.client_name}
                        </span>
                        <span className={`font-mono text-[9px] ${live ? "text-emerald-500" : "text-tremor-content-subtle/60"}`}>{statusLabel(row.rfq)}</span>
                      </div>
                      <div className="text-[9px] text-tremor-content-subtle/80 mt-0.5 font-mono">{sub}</div>
                    </button>
                  );
                })
              )}
            </div>
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {!selectedRow ? (
                <div className="p-3 text-[11px] text-tremor-content-subtle italic">Select a client.</div>
              ) : (() => {
                const row = selectedRow;
                const rfq = row.rfq;
                const t = threads[row.client_id] || [];
                const live = rfq?.status === "open";
                const tkr = rfq ? shortTicker(String(rfq.contract_id).split("_")[0]) : "";
                const kind = rfq ? (String(rfq.contract_id).split("_")[1] || "") : "";
                const ref = rfq ? contracts.find(c => c.id === rfq.contract_id) : undefined;
                const refMid = ref?.premium ?? 0;
                return (
                  <>
                    <div className="px-3 py-2 border-b border-tremor-border shrink-0">
                      <div className="text-[11px] font-bold">{row.client_name}</div>
                      <div className="text-[10px] text-tremor-content mt-0.5">
                        {rfq ? <>{live ? "wants a market in" : "last asked for"} <span className="font-mono">{rfq.quantity}</span> {tkr} <span className="uppercase">{kind}</span> {"\u00B7"} ref mid {fmtPx(refMid)} {"\u00B7"} {statusLabel(rfq)}</> : "no active request"}
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1 bg-tremor-background-muted/30 min-h-0">
                      {t.length === 0 ? (
                        <div className="text-[10px] text-tremor-content-subtle italic">No messages yet.</div>
                      ) : t.map((m: any, i: number) => (
                        <div key={i} className={`text-[10px] ${m.sender === "you" ? "text-right text-tremor-brand" : "text-left text-tremor-content"}`}>
                          <span className="opacity-50 mr-1">{m.sender === "you" ? "You:" : `${row.client_name}:`}</span>{m.text}
                        </div>
                      ))}
                    </div>
                    <div className="p-2 border-t border-tremor-border shrink-0 flex flex-col gap-2">
                      {live && (
                        <div className="flex gap-1 flex-wrap">
                          <Button size="xs" variant="secondary" onClick={() => sendClientMsg(rfq.rfq_id, "Coming now")} className="text-[9px]">Coming now</Button>
                          <Button size="xs" variant="secondary" onClick={() => sendClientMsg(rfq.rfq_id, "Working it")} className="text-[9px]">Working it</Button>
                          <Button size="xs" variant="secondary" onClick={() => sendClientMsg(rfq.rfq_id, "Can't help")} className="text-[9px]">Can't help</Button>
                        </div>
                      )}
                      {rfq && (
                        <input type="text" placeholder={live ? "message client..." : "say something..."}
                          onKeyDown={e => { if (e.key === "Enter") { sendClientMsg(rfq.rfq_id, (e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = ""; } }}
                          className="bg-tremor-background-muted border border-tremor-border rounded h-7 px-2 text-[11px] outline-none focus:border-tremor-brand/50" />
                      )}
                      {live ? (
                        <div className="flex gap-2 items-end">
                          <div className="flex flex-col flex-1 min-w-0">
                            <span className="text-[8px] uppercase font-bold text-rose-500">Your Bid</span>
                            <input type="number" placeholder="bid" value={quoteBids[rfq.rfq_id] || ""}
                              onChange={e => setQuoteBids(prev => ({ ...prev, [rfq.rfq_id]: e.target.value }))}
                              className="bg-tremor-background-muted border border-tremor-border rounded h-7 px-2 text-[11px] font-mono outline-none focus:border-rose-500/50" />
                          </div>
                          <div className="flex flex-col flex-1 min-w-0">
                            <span className="text-[8px] uppercase font-bold text-emerald-500">Your Ask</span>
                            <input type="number" placeholder="ask" value={quoteAsks[rfq.rfq_id] || ""}
                              onChange={e => setQuoteAsks(prev => ({ ...prev, [rfq.rfq_id]: e.target.value }))}
                              className="bg-tremor-background-muted border border-tremor-border rounded h-7 px-2 text-[11px] font-mono outline-none focus:border-emerald-500/50" />
                          </div>
                          <Button size="xs" variant="primary" onClick={() => sendClientQuote(rfq.rfq_id)} className="h-7 shrink-0">Quote</Button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[9px] text-tremor-content-subtle italic">No live request.</span>
                          <Button size="xs" variant="secondary" onClick={() => requestMarket(row.client_id)} className="text-[9px]">Ask for a market</Button>
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </Card>

        

        {/* PANEL E: EXCHANGE */}
        <Card className="p-0 flex flex-col rounded-none bg-tremor-background shadow-none overflow-hidden min-h-0">
          <PanelHeader title="Execution Engine" />
          <div className="flex-1 p-3 flex flex-col min-h-0">
            <Flex alignItems="center" justifyContent="between" className="mb-3 animate-fade-in shrink-0">
              <Flex justifyContent="start" className="gap-2 w-auto items-center">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: accentHex }}></span>
                <Title className="text-[16px] font-bold tracking-tight text-tremor-content-emphasis">{selectedUnderlying ? shortTicker(selectedUnderlying) : "Select Asset"}</Title>
                <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded" style={{ color: accentHex, backgroundColor: accentHex + "1F" }}>
                  {ASSET_TYPE[selectedUnderlying || ""] || "Equity"}
                </span>
              </Flex>
              <TabGroup index={exchangeTab} onIndexChange={setExchangeTab}>
                <TabList variant="solid" className="p-0.5">
                  <Tab className="text-[10px] font-bold uppercase py-0.5 px-3">Options</Tab>
                  <Tab className="text-[10px] font-bold uppercase py-0.5 px-3">Futures</Tab>
                </TabList>
              </TabGroup>
            </Flex>

            <Flex className="gap-2 mb-3 shrink-0">
              <div className="relative flex-1">
                <input
                  type="number"
                  value={tradeQty}
                  onChange={e => setTradeQty(e.target.value === "" ? "" : Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full bg-tremor-background-muted border border-tremor-border rounded h-8 px-2 font-mono text-[14px] text-tremor-content-emphasis outline-none focus:border-tremor-brand/30"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-tremor-content-subtle pointer-events-none">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                </div>
              </div>
              <Flex className="gap-1 w-auto">
                {[1, 10, 50, 100].map(v => (
                  <Button
                    key={v}
                    size="xs"
                    variant={tradeQty === v ? "primary" : "secondary"}
                    onClick={() => setTradeQty(v)}
                    className="h-8 px-2 text-[10px]"
                  >
                    {v}
                  </Button>
                ))}
              </Flex>
            </Flex>

            <div className="flex-1 min-h-0 overflow-y-auto mb-3">
              {exchangeTab === 0 ? (
                <Grid numItems={2} className="gap-2">
                  {(["bullish", "bearish", "lottery", "hedge"] as const).map(type => {
                    const c = contracts.find(x => x.underlying === selectedUnderlying && x.id.endsWith(`_${type}`));
                    const isSel = contractType === type;
                    const name = OPTION_NAMES[type];
                    return (
                      <div
                        key={type}
                        onClick={() => setContractType(type)}
                        className={`p-2 cursor-pointer rounded-md border transition-all flex flex-col ${isSel ? "" : "border-tremor-border hover:bg-tremor-content-strong/[0.04]"}`}
                        style={isSel ? { borderColor: accentHex, backgroundColor: accentHex + "14" } : undefined}
                      >
                        <span className="text-[11px] font-bold tracking-wide text-tremor-content-emphasis">{name.heading}</span>
                        <span className="text-[9px] text-tremor-content-subtle mb-2">{name.sub}</span>
                        <div className="flex items-end justify-between mt-auto">
                          <div className="flex flex-col">
                            <span className="text-[8px] uppercase font-bold tracking-wider text-tremor-content-subtle">Strike</span>
                            <span className="text-[10px] font-mono text-tremor-content">{fmtPx(c?.strike || 0)}</span>
                          </div>
                          <div className="flex flex-col items-end">
                            <span className="text-[8px] uppercase font-bold tracking-wider text-tremor-content-subtle">Premium</span>
                            <span className="text-[15px] font-bold font-mono leading-none text-tremor-content-emphasis">{fmtPx(c?.premium || 0)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </Grid>
              ) : (
                (() => {
                  const f = contracts.find(x => x.underlying === selectedUnderlying && x.id.endsWith("_future"));
                  const px = f?.premium || 0;
                  const size = CONTRACT_SIZE[selectedUnderlying || ""] || 1;
                  const notional = px * size;
                  return (
                    <div className="rounded-md border p-3 flex flex-col" style={{ borderColor: accentHex, backgroundColor: accentHex + "0D" }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] uppercase font-black tracking-widest" style={{ color: accentHex }}>1M Future</span>
                        <span className="text-[10px] font-bold text-tremor-content">{selectedUnderlying}</span>
                      </div>
                      <div className="flex flex-col items-end mb-3">
                        <span className="text-[24px] font-bold font-mono leading-none tracking-tight text-tremor-content-emphasis">{fmtPx(px)}</span>
                        <span className="text-[8px] uppercase tracking-widest text-tremor-content-subtle mt-1">Live Futures Price</span>
                      </div>
                      <div className="grid grid-cols-2 gap-px bg-tremor-border rounded overflow-hidden">
                        {([
                          ["Contract", "1M Future"],
                          ["Contract Size", fmt(size, 0)],
                          ["Notional / Contract", fmtMoney(notional)],
                          ["Asset Class", ASSET_TYPE[selectedUnderlying || ""] || "Equity"],
                        ] as const).map(([k, v]) => (
                          <div key={k} className="bg-tremor-background p-1.5 flex flex-col gap-0.5">
                            <span className="text-[8px] uppercase font-bold tracking-wider text-tremor-content-subtle">{k}</span>
                            <span className="text-[10px] font-mono text-tremor-content">{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()
              )}
            </div>

            <Grid numItems={2} className="gap-3 mb-3 shrink-0">
              <div
                onClick={() => placeOrder(-1)}
                className={`flex flex-col items-center justify-center p-2 cursor-pointer rounded-md border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 transition-all ${pulseSell ? "btn-pulse-sell" : ""}`}
              >
                <span className="text-[10px] uppercase font-bold text-rose-500 mb-1">Sell (Bid)</span>
                <span className="font-mono text-[16px] font-bold text-rose-500">{fmtPx(bidAsk.bid)}</span>
              </div>
              <div
                onClick={() => placeOrder(1)}
                className={`flex flex-col items-center justify-center p-2 cursor-pointer rounded-md border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 transition-all ${pulseBuy ? "btn-pulse-buy" : ""}`}
              >
                <span className="text-[10px] uppercase font-bold text-emerald-500 mb-1">Buy (Ask)</span>
                <span className="font-mono text-[16px] font-bold text-emerald-500">{fmtPx(bidAsk.ask)}</span>
              </div>
            </Grid>

            <div className="mt-auto shrink-0 border-t border-tremor-border pt-2 flex justify-between items-baseline">
              <span className="text-tremor-content-subtle uppercase text-[9px] font-bold tracking-wider">Notional Value</span>
              <span className="font-mono text-[14px] text-tremor-content-emphasis">
{"\u00A3"}{fmt((Number(tradeQty) || 0) * (CONTRACT_SIZE[selectedUnderlying || ""] || 1) * (selectedContract?.premium || 0))}             </span>
            </div>
          </div>
        </Card>

        {/* PANEL F: CHART */}
        <Card className="p-0 flex flex-col rounded-none bg-tremor-background relative shadow-none overflow-hidden min-h-0">
          <PanelHeader 
            title="Market Action" 
            headerExtra={
              <Flex className="gap-3 items-center w-auto">
                <TabGroup index={([3, 15, 30, 60, "all"] as const).indexOf(timeframe as any)} onIndexChange={(i) => setTimeframe([3, 15, 30, 60, "all"][i] as any)}>
                  <TabList variant="line" className="p-0.5">
                    {([3, 15, 30, 60, "all"] as const).map(m => (
                      <Tab key={m} className="px-2 py-0.5 text-[9px] font-bold uppercase">{m === "all" ? "All" : `${m}m`}</Tab>
                    ))}
                  </TabList>
                </TabGroup>
                <TabGroup index={chartMode === "line" ? 0 : 1} onIndexChange={(i) => setChartMode(i === 0 ? "line" : "area")}>
                  <TabList variant="line" className="p-0.5">
                    <Tab className="px-2 py-0.5 text-[9px] font-bold uppercase">Line</Tab>
                    <Tab className="px-2 py-0.5 text-[9px] font-bold uppercase">Area</Tab>
                  </TabList>
                </TabGroup>
              </Flex>
            }
          />
          <Badge className="absolute top-10 right-3 z-10" color="tremor-brand">
            {realDate}
          </Badge>
          <div className="flex-1 relative overflow-hidden bg-tremor-background-muted/30 min-h-[80px]">
            <PriceChart 
              hist={selectedHist} 
              mode={chartMode} 
              timeMap={timeMap} 
              ticker={selectedUnderlying || "Price"} 
              color={ASSET_HEX[ASSET_TYPE[selectedUnderlying || ""] || "Equity"]}
            />
          </div>
        </Card>
      </div>
    </main>
    </div>
  );
}

// --- Sub-components ---

function Stat({ label, value, delta }: { label: string; value: string; delta?: number }) {
  const isPnL = label.toLowerCase().includes("p&l");
  const pnlColor = delta !== undefined ? (delta >= 0 ? "text-emerald-500" : "text-rose-500") : "";

  return (
    <Flex className="gap-2 group w-auto shrink-0" justifyContent="start">
      <div className="w-px h-3 bg-tremor-border"></div>
      <Flex flexDirection="col" alignItems="start" className="w-auto">
        <Text className="text-[9px] uppercase font-bold text-tremor-content-subtle leading-none mb-0.5 tracking-wider">{label}</Text>
        <Flex className="gap-2" justifyContent="start">
          <Metric className={`text-[12px] font-bold leading-none ${isPnL ? pnlColor : ""}`}>{value}</Metric>
          {delta !== undefined && delta !== 0 && (
            <BadgeDelta 
              deltaType={delta > 0 ? "increase" : "decrease"} 
              className={`scale-75 origin-left ${delta > 0 ? "bg-emerald-500/20 text-emerald-500" : "bg-rose-500/20 text-rose-500"} border-none`}
            />
          )}
        </Flex>
      </Flex>
    </Flex>
  );
}


function PanelHeader({ title, headerExtra }: { title: string; headerExtra?: React.ReactNode }) {
  return (
    <div className="h-8 flex items-center justify-between px-3 border-b border-tremor-border shrink-0 bg-tremor-background-subtle/50">
      <Text className="text-[10px] uppercase font-black tracking-widest text-tremor-content">{title}</Text>
      {headerExtra}
    </div>
  );
}

