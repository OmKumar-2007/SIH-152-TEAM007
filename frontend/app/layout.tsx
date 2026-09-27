import type { Metadata } from "next";
import { Inter, Instrument_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { THEME_SCRIPT } from "@/components/theme-provider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

/**
 * A second face, for headings and the figures that carry the page.
 *
 * One typeface at one weight across an entire product is what makes an
 * interface read as generated: everything is technically legible and nothing
 * has a voice. Instrument Sans has noticeably more character in its capitals
 * and figures than Inter, so a KPI set in it looks chosen rather than
 * defaulted, while Inter keeps doing what it is genuinely best at — small UI
 * text and dense tables.
 */
const display = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "NitiNetra — Policy Intelligence",
  description:
    "AI-driven Social Media Analytics Framework for Public Policy Intelligence",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${display.variable}`}
    >
      <head>
        {/* Runs before first paint so the stored theme is already on <html>.
            Doing this in React would render light, hydrate, then switch — a
            white flash on every load for anyone using dark mode. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="bg-bg text-ink min-h-screen antialiased font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
