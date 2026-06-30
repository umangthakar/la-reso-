import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      // Tighter gutters on mobile, original 1.5rem from sm up (desktop unchanged).
      padding: {
        DEFAULT: "1rem",
        sm: "1.5rem",
      },
      screens: {
        "2xl": "1280px",
      },
    },
    extend: {
      colors: {
        // Le Rasa Luxury Brand Palette
        blush: {
          // Background / Base — Soft Blush Cream
          DEFAULT: "#F9EEEA",
          50: "#FDF8F6",
          100: "#F9EEEA",
          200: "#F2DCD6",
        },
        dustyrose: {
          // Primary Light — Dusty Rose
          DEFAULT: "#D5A4A4",
          light: "#EAD2D2",
          dark: "#C08C8C",
        },
        mauve: {
          // Primary — Mauve Rose
          DEFAULT: "#B38E91",
          light: "#CBABAD",
          dark: "#9C7679",
        },
        berry: {
          // Accent — Elegant Berry Rose
          DEFAULT: "#9C616D",
          light: "#B5808B",
        },
        plum: {
          // Dark Accent — Deep Plum Rose
          DEFAULT: "#743249",
          light: "#8E4862",
        },
        wine: {
          // Buttons / CTA — Rich Wine Pink
          DEFAULT: "#873853",
          light: "#A04A66",
          dark: "#743249",
        },
        darkberry: {
          // Dark Text / Footer — Dark Berry Accent
          DEFAULT: "#612437",
          light: "#8A5563",
        },
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "serif"],
        sans: ["var(--font-nunito)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        clay: "2rem",
      },
      boxShadow: {
        clay: "8px 8px 24px rgba(116, 50, 73, 0.18), -6px -6px 20px rgba(255, 255, 255, 0.75)",
        "clay-sm": "4px 4px 12px rgba(116, 50, 73, 0.15), -3px -3px 10px rgba(255, 255, 255, 0.65)",
        "clay-inset": "inset 4px 4px 10px rgba(116, 50, 73, 0.15), inset -4px -4px 10px rgba(255, 255, 255, 0.65)",
        glow: "0 20px 60px -15px rgba(135, 56, 83, 0.45)",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-16px)" },
        },
        "float-slow": {
          "0%, 100%": { transform: "translateY(0px) rotate(0deg)" },
          "50%": { transform: "translateY(-24px) rotate(6deg)" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        float: "float 6s ease-in-out infinite",
        "float-slow": "float-slow 9s ease-in-out infinite",
        marquee: "marquee 30s linear infinite",
        shimmer: "shimmer 3s linear infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
