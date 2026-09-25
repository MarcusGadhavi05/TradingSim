"use client";

import { useEffect, useRef, useState } from "react";
import { GeistMono } from "geist/font/mono";

// Hardcoded locally per spec - these tokens do not exist anywhere else in the
// project (checked globals.css), so there is nothing to reuse.
const BG_COLOR = "#130A0B";
const ACCENT_COLOR = "#F2C63D";
const TAGLINE_COLOR = "#8A6A72";

type SplashProps = {
  // True once the desk actually has live data (see mount site in page.tsx).
  ready: boolean;
  // Called once, after the fade-out finishes, so the parent can unmount this.
  onDone: () => void;
  // Minimum time to show the splash even if `ready` flips true almost
  // instantly (e.g. a very fast local connection) - avoids an awkward flash.
  minMs?: number;
  // Fade-out duration once both the floor has elapsed and `ready` is true.
  fadeMs?: number;
};

export default function Splash({ ready, onDone, minMs = 1600, fadeMs = 300 }: SplashProps) {
  const [floorPassed, setFloorPassed] = useState(false);
  const [fading, setFading] = useState(false);
  const doneCalledRef = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setFloorPassed(true), minMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Separate from the timeout-scheduling effect below on purpose: this one
  // only flips `fading` once both conditions are met. If it also scheduled
  // the onDone timeout itself, setting `fading` here would re-render and
  // re-run this same effect (since `fading` would need to be a dependency
  // to guard against re-firing) - the cleanup from that re-run would cancel
  // the timeout before it ever fires. Splitting the state transition from
  // the timer avoids that self-cancellation entirely.
  useEffect(() => {
    if (ready && floorPassed) setFading(true);
  }, [ready, floorPassed]);

  useEffect(() => {
    if (!fading) return;
    const t = setTimeout(() => {
      if (!doneCalledRef.current) {
        doneCalledRef.current = true;
        onDone();
      }
    }, fadeMs);
    return () => clearTimeout(t);
  }, [fading, fadeMs, onDone]);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{
        backgroundColor: BG_COLOR,
        zIndex: 9999,
        opacity: fading ? 0 : 1,
        transition: `opacity ${fadeMs}ms ease-out`,
        pointerEvents: fading ? "none" : "auto",
      }}
    >
      <div className="flex flex-col items-center">
        <svg
          width="220"
          height="60"
          viewBox="0 0 220 60"
          fill="none"
          style={{ marginBottom: 10 }}
          aria-hidden="true"
        >
          <polyline
            points="4,52 22,46 40,49 58,38 76,41 96,30 114,33 134,22 150,25 166,14 182,8"
            fill="none"
            stroke={ACCENT_COLOR}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Arrowhead - two short strokes forming a corner at the line's tip.
              Both wings must splay clearly away from the incoming line's own
              direction, symmetric around its reverse - if a wing sits too
              close to the reverse-of-travel angle it just retraces the line
              itself and the arrowhead reads as missing a side. */}
          <line x1="182" y1="8" x2="174" y2="17" stroke={ACCENT_COLOR} strokeWidth="2.5" strokeLinecap="round" />
          <line x1="182" y1="8" x2="170" y2="7" stroke={ACCENT_COLOR} strokeWidth="2.5" strokeLinecap="round" />
        </svg>

        <div
          className={GeistMono.className}
          style={{
            fontWeight: 700,
            fontSize: 70,
            lineHeight: 1,
            color: ACCENT_COLOR,
          }}
        >
          MAG
        </div>

        <div
          className={GeistMono.className}
          style={{
            fontSize: 15,
            color: TAGLINE_COLOR,
            letterSpacing: "6px",
            marginTop: 46,
          }}
        >
          TRADING SIMULATIONS
        </div>
      </div>
    </div>
  );
}
