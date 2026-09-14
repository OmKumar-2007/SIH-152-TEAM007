import type { Config } from "tailwindcss";

/**
 * Colours resolve through CSS variables so a single `data-theme` attribute
 * repaints the whole product. The `rgb(var(--x) / <alpha-value>)` form is what
 * keeps opacity utilities (`bg-brand/10`, `border-danger/30`) working — a hex
 * value stored in a variable cannot produce one.
 */
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: token("bg"),
          alt: token("bg-alt"),
        },
        surface: {
          DEFAULT: token("surface"),
          2: token("surface-2"),
          3: token("surface-3"),
        },
        bdr: {
          DEFAULT: token("bdr"),
          strong: token("bdr-strong"),
        },
        ink: {
          DEFAULT: token("ink"),
          2: token("ink-2"),
          3: token("ink-3"),
        },
        brand: {
          DEFAULT: token("brand"),
          soft: token("brand-soft"),
        },
        accent: token("accent"),
        success: token("success"),
        danger: token("danger"),
        warn: token("warn"),
        warning: token("warn"),
        info: token("info"),
        platform: {
          twitter: "#1D9BF0",
          telegram: "#2AABEE",
          reddit: "#FF4500",
          youtube: "#FF0000",
          instagram: "#E1306C",
          facebook: "#1877F2",
          news: "#94A3B8",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        DEFAULT: "8px",
        xl: "12px",
        "2xl": "16px",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        pop: "var(--shadow-pop)",
      },
      animation: {
        "fade-up": "fade-up 320ms cubic-bezier(0.22,1,0.36,1) both",
        "fade-in": "fade-in 260ms ease both",
        "pulse-ring": "pulse-ring 2.2s ease-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
