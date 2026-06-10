"use client";

import { AreaChart } from "@tremor/react";
import { useMemo } from "react";

type ChartProps = {
  hist: { t: number; px: number }[];
  mode: "line" | "area";
  timeMap: Record<number, string>;
  ticker: string;
  color?: string;
};

const fmtPx = (x: number) => {
  const abs = Math.abs(x);
  if (abs < 1) return x.toLocaleString("en-GB", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  if (abs < 10) return x.toLocaleString("en-GB", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  if (abs < 1000) return x.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return x.toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
};

export default function Chart({ hist, mode, timeMap, ticker, color = "#7c5cff" }: ChartProps) {
  const data = useMemo(() => {
    return hist.map((d, idx) => {
      const timeStr = timeMap[Math.floor(d.t)];
      return {
        date: timeStr || `T-${hist.length - idx}`,
        price: d.px,
      };
    });
  }, [hist, timeMap]);

  if (hist.length < 2) {
    return (
      <div className="w-full h-full flex items-center justify-center text-tremor-content-subtle italic">
        Awaiting market data…
      </div>
    );
  }

  return (
    <div className="w-full h-full p-4 chart-container" style={{ "--chart-color": color } as any}>
      <style jsx>{`
        .chart-container :global(.recharts-line-path),
        .chart-container :global(.recharts-area-curve) {
          stroke: var(--chart-color) !important;
          stroke-width: 2.5px;
          filter: drop-shadow(0 0 6px var(--chart-color));
        }
        .chart-container :global(.recharts-area-area) {
          fill: url(#chartFill) !important;
        }
        .chart-container :global(.recharts-cartesian-grid line) {
          stroke: rgba(255, 255, 255, 0.05) !important;
        }
        .chart-container :global(.recharts-cartesian-axis-tick-value) {
          fill: rgba(255, 255, 255, 0.35) !important;
          font-size: 9px;
        }
        .chart-container :global(.recharts-label) {
          fill: rgba(255, 255, 255, 0.4) !important;
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
      `}</style>

      <svg width="0" height="0" style={{ position: "absolute" }}>
        <defs>
          <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
      </svg>

      <AreaChart
        className="h-full"
        data={data}
        index="date"
        categories={["price"]}
        colors={["neutral"]}
        valueFormatter={fmtPx}
        showLegend={false}
        showGridLines={true}
        showAnimation={true}
        animationDuration={300}
        yAxisWidth={56}
        autoMinValue={true}
        xAxisLabel="Session Time"
        yAxisLabel="Price"
      />
    </div>
  );
}