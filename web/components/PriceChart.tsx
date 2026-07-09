"use client";
import dynamic from "next/dynamic";
import { useMemo } from "react";
const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

type Pt = { t: number; px: number };

export default function PriceChart({
  hist, ticker, color, mode = "area", timeMap = {},
}: {
  hist: Pt[]; ticker: string; color: string; mode?: "line" | "area"; timeMap?: Record<number, string>;
}) {
  // x must be UNIQUE per point: ApexCharts' category axis silently drops the series
  // when x values repeat, and a slow tape produces many ticks within the same HH:MM.
  // Use sim-seconds as the category and map to HH:MM only in the label formatter.
  const series = useMemo(
    () => [{ name: ticker, data: hist.map((d) => ({ x: String(Math.floor(d.t)), y: d.px })) }],
    [hist, ticker]
  );

  const pxs = hist.map((d) => d.px);
  const rawLo = Math.min(...pxs), rawHi = Math.max(...pxs);
  const mid = (rawLo + rawHi) / 2;
  // Floor the visible span at 0.1% of price: a calm tape otherwise produces a
  // near-zero range at large magnitude, which degenerates the axis to a blank chart.
  const span = Math.max(rawHi - rawLo, Math.abs(mid) * 0.001, 1e-9);
  const lo = mid - span / 2, hi = mid + span / 2;
  const pad = span * 0.12;
  const a = Math.abs(pxs[pxs.length - 1] ?? 0);
  const magDp = a < 1 ? 4 : a < 10 ? 3 : a < 1000 ? 2 : 1;
  // Enough decimals that axis labels/tooltip stay distinct when zoomed into a tight span
  const dp = Math.max(magDp, Math.min(6, Math.max(0, Math.ceil(-Math.log10(span / 5)))));

  const axisLabelStyle = {
    colors: "#55617A", fontSize: "11px",
    fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
  };

  const options: any = {
    chart: {
      type: mode, height: "100%", background: "transparent", fontFamily: "inherit",
      toolbar: { show: false }, zoom: { enabled: false },
      animations: { enabled: false },
      dropShadow: mode === "line"
        ? { enabled: true, top: 3, left: 0, blur: 6, color, opacity: 0.25 }
        : { enabled: false },
    },
    theme: { mode: "dark" },
    colors: [color],
    stroke: { curve: "straight", width: 2, lineCap: "round" },
    fill: mode === "area"
      ? { type: "gradient", gradient: { shadeIntensity: 1, opacityFrom: 0.22, opacityTo: 0.0, stops: [0, 100] } }
      : { type: "solid", opacity: 1 },
    grid: { borderColor: "#1C2536", strokeDashArray: 4, xaxis: { lines: { show: false } }, padding: { left: 10, right: 14, top: 6, bottom: 0 } },
    dataLabels: { enabled: false },
    markers: { size: 0, hover: { size: 4, strokeWidth: 2 } },
    xaxis: {
      type: "category", tickAmount: 6, tickPlacement: "on",
      labels: {
        style: axisLabelStyle,
        rotate: 0, hideOverlappingLabels: true, showDuplicates: false,
        formatter: (val: string) => timeMap[Number(val)] ?? String(val),
      },
      axisBorder: { show: false }, axisTicks: { show: false }, tooltip: { enabled: false }, crosshairs: { show: true, stroke: { color: "rgba(201,169,106,0.35)", dashArray: 3 } },
    },
    yaxis: {
      min: lo - pad, max: hi + pad, tickAmount: 5,
      labels: { style: axisLabelStyle, formatter: (v: number) => v.toFixed(dp) },
    },
    tooltip: {
      theme: "dark", x: { show: true }, y: { formatter: (v: number) => v.toFixed(dp) }, marker: { show: false },
      style: { fontSize: "12px", fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace" },
    },
    legend: { show: false },
  };

  if (!hist.length) {
    return <div className="h-full flex items-center justify-center text-[12px] text-tremor-content-subtle">Waiting for data...</div>;
  }
  return <div className="h-full w-full"><ReactApexChart options={options} series={series} type={mode} height="100%" /></div>;
}
