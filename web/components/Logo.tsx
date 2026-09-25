// Shared MAG Trading Simulations lockup - icon + "MAG" + "TRADING SIMULATIONS".
// Used on every page so the brand is always visible. `suffix` appends a
// page-specific label (e.g. "DERIVATIVES DESK") after a divider.
//
// Built from real vector + DOM text (not the raster mag_splash_*.png asset)
// on purpose: it stays crisp and legible at header sizes and has no baked-in
// background, so it always sits cleanly on whatever surface it's placed on.

type LogoSize = "sm" | "md" | "lg";

type LogoProps = {
  size?: LogoSize;
  suffix?: string;
  className?: string;
};

const SIZES: Record<LogoSize, {
  icon: number;
  mag: string;
  tagline: string;
  taglineTrack: string;
  taglineGap: string;
  suffixText: string;
  gap: string;
  dividerH: string;
}> = {
  sm: {
    icon: 30,
    mag: "text-[17px]",
    tagline: "text-[7.5px]",
    taglineTrack: "tracking-[0.2em]",
    taglineGap: "mt-[3px]",
    suffixText: "text-[13px]",
    gap: "gap-2.5",
    dividerH: "h-7",
  },
  md: {
    icon: 42,
    mag: "text-[24px]",
    tagline: "text-[9px]",
    taglineTrack: "tracking-[0.24em]",
    taglineGap: "mt-1",
    suffixText: "text-[16px]",
    gap: "gap-3",
    dividerH: "h-9",
  },
  lg: {
    icon: 76,
    mag: "text-[52px]",
    tagline: "text-[14px]",
    taglineTrack: "tracking-[0.4em]",
    taglineGap: "mt-3",
    suffixText: "text-[26px]",
    gap: "gap-6",
    dividerH: "h-16",
  },
};

export default function Logo({ size = "md", suffix, className = "" }: LogoProps) {
  const s = SIZES[size];
  return (
    <div className={`flex items-center ${s.gap} ${className}`}>
      <svg
        width={s.icon}
        height={s.icon * 0.47}
        viewBox="0 0 30 14"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <polyline
          points="1,12 6,10 10,11 14,7 18,8 22,4 25,2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-tremor-brand"
        />
        <line x1="25" y1="2" x2="21" y2="9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="text-tremor-brand" />
        <line x1="25" y1="2" x2="18" y2="3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="text-tremor-brand" />
      </svg>

      <div className="flex flex-col leading-none">
        <span className={`${s.mag} font-bold tracking-[0.06em] text-tremor-brand leading-none whitespace-nowrap`}>MAG</span>
        <span className={`${s.tagline} ${s.taglineGap} ${s.taglineTrack} font-semibold text-tremor-content-subtle leading-none whitespace-nowrap`}>
          TRADING&nbsp;SIMULATIONS
        </span>
      </div>

      {suffix && (
        <>
          <div className={`w-px ${s.dividerH} bg-tremor-border`} />
          <span className={`${s.suffixText} font-bold tracking-[0.22em] text-tremor-content-strong leading-none whitespace-nowrap`}>
            {suffix}
          </span>
        </>
      )}
    </div>
  );
}
