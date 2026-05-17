import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FAFAF7",
        ink: "#1A1A1A",
        muted: "#6B6B6B",
        line: "#E5E5E0",
        focus: "#5A8DEE",
        coral: "#E86A4A",
        success: "#6AAA64",
        warning: "#C9B458",
        danger: "#D9534F",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
