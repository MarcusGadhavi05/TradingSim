"use client";

import { AreaChart } from "@tremor/react";
import { useMemo } from "react";

type ChartProps = {
  hist: { t: number; px: number }[];
  mode: "line" | "area";
  timeMap: Record<number, string>;
  ticker: string;
};

const fmtPx = (x: number) => {
  const abs = Math.abs(x);
  if (abs < 1) return x.toLocaleString("en-GB", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  if (abs < 10) return x.toLocaleString("en-GB", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  if (abs < 1000) return x.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return x.toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
};

export default function Chart({ hist, mode, timeMap, ticker }: ChartProps) {
  const data = useMemo(() => {
    // Transform history into Tremor-friendly format
    // Ensure the date is as unique as possible to avoid rendering issues
    return hist.map((d, idx) => {
      const timeStr = timeMap[Math.floor(d.t)];
      // If timeStr is missing, we use a placeholder or the index to keep the line moving
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
    <div className="w-full h-full p-4">
      <AreaChart
        className="h-full"
        data={data}
        index="date"
        categories={["price"]}
        colors={["violet"]}
        valueFormatter={fmtPx}
        showLegend={false}
        showGridLines={false}
        showAnimation={false}
        yAxisWidth={50}
        autoMinValue={true}
      />
    </div>
  );
}
