import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * NitiNetra — "the eye on policy".
 *
 * The mark is an eye: a saffron upper lid, a green lower lid, and the 24-spoke
 * chakra as its iris. Drawn as SVG rather than shipped as a raster so it stays
 * sharp from a 16px favicon to the login screen, and so the chakra can take the
 * theme's ink in dark mode instead of disappearing into a navy-on-charcoal blur.
 *
 * The flag colours are fixed on purpose — they are the identity — while the
 * chakra and wordmark use `currentColor`, so they follow the surrounding text.
 */

const SAFFRON = "#F08A1C";
const SAFFRON_DEEP = "#E36C0A";
const GREEN = "#4E9A2A";
const GREEN_LIGHT = "#8CC63F";

export function NitiNetraMark({
  size = 32,
  className,
  title = "NitiNetra",
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  const id = React.useId();
  const spokes = Array.from({ length: 24 }, (_, i) => (i * 360) / 24);

  return (
    <svg
      width={size}
      height={size * 0.62}
      viewBox="0 0 100 62"
      className={cn("flex-shrink-0", className)}
      role="img"
      aria-label={title}
    >
      <defs>
        <linearGradient id={`${id}-s`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={SAFFRON_DEEP} />
          <stop offset="100%" stopColor={SAFFRON} />
        </linearGradient>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={GREEN} />
          <stop offset="100%" stopColor={GREEN_LIGHT} />
        </linearGradient>
      </defs>

      {/* Upper lid — a crescent sweeping up and over, tapering to both ends. */}
      <path
        d="M2 40 C 20 10, 62 -2, 98 20 C 64 8, 26 16, 2 40 Z"
        fill={`url(#${id}-s)`}
      />

      {/* Lower lid — the mirrored sweep beneath, lighter and shorter. */}
      <path
        d="M12 36 C 34 56, 70 58, 92 40 C 70 52, 36 50, 12 36 Z"
        fill={`url(#${id}-g)`}
      />

      {/* Iris — the chakra. */}
      <g transform="translate(50 33)" fill="none" stroke="currentColor">
        <circle r="11.5" strokeWidth="2" />
        <circle r="1.8" fill="currentColor" stroke="none" />
        {spokes.map((angle) => (
          <line
            key={angle}
            x1="0"
            y1="0"
            x2="0"
            y2="-10.5"
            strokeWidth="0.9"
            transform={`rotate(${angle})`}
          />
        ))}
      </g>
    </svg>
  );
}

export function NitiNetraWordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-display font-bold tracking-[0.02em] leading-none",
        className
      )}
    >
      NITINETRA
    </span>
  );
}
