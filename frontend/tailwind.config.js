/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["DM Sans", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        serif: ["Cormorant Garamond", "Georgia", "Cambria", "Times New Roman", "serif"],
      },
      colors: {
        primary: {
          50:  "#fdf5f0",
          100: "#fae8dc",
          200: "#f4ccb0",
          300: "#ebab80",
          400: "#df854e",
          500: "#c05d3e",
          600: "#a84a2f",
          700: "#8c3c27",
          800: "#733225",
          900: "#5f2c22",
          950: "#341410",
        },
        // Warm stone neutrals instead of cold zinc
        zinc: {
          50:  "#faf7f2",
          100: "#f3ede4",
          200: "#e6ddd0",
          300: "#d4c8b8",
          400: "#a89a89",
          500: "#8a7c6c",
          600: "#6b5e50",
          700: "#524639",
          800: "#3a3129",
          900: "#26211b",
          925: "#1f1a15",
          950: "#151210",
        },
      },
      boxShadow: {
        card: "0 1px 3px 0 rgb(90 60 30 / 0.06), 0 0 0 1px rgb(90 60 30 / 0.03)",
        "card-hover": "0 16px 40px -8px rgb(90 60 30 / 0.15), 0 6px 16px -4px rgb(90 60 30 / 0.08), 0 0 0 1px rgb(90 60 30 / 0.04)",
        "glow-primary": "0 0 0 1px rgb(192 93 62 / 0.35), 0 4px 20px -4px rgb(192 93 62 / 0.2)",
        modal: "0 32px 80px -16px rgb(21 18 16 / 0.4), 0 0 0 1px rgb(21 18 16 / 0.06)",
        "inner-sm": "inset 0 1px 2px 0 rgb(90 60 30 / 0.05)",
      },
      backgroundImage: {
        "header-gradient": "linear-gradient(90deg, #c05d3e, #d4803e, #b8884d)",
        "card-dark": "linear-gradient(145deg, #26211b 0%, #1f1a15 100%)",
        "code-surface-light": "linear-gradient(135deg, #faf7f2 0%, #f3ede4 100%)",
        "code-surface-dark": "linear-gradient(135deg, #1a1611 0%, #1f1a15 100%)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in-fast": {
          from: { opacity: "0" },
          to:   { opacity: "1" },
        },
        shimmer: {
          "0%":   { backgroundPosition: "-600px 0" },
          "100%": { backgroundPosition: "600px 0" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.95) translateY(-4px)" },
          to:   { opacity: "1", transform: "scale(1) translateY(0)" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(16px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgb(192 93 62 / 0)" },
          "50%": { boxShadow: "0 0 0 4px rgb(192 93 62 / 0.12)" },
        },
      },
      animation: {
        "fade-in":      "fade-in 0.25s ease-out both",
        "fade-in-fast": "fade-in-fast 0.15s ease-out both",
        "shimmer":      "shimmer 1.6s infinite linear",
        "scale-in":     "scale-in 0.18s ease-out both",
        "slide-up":     "slide-up 0.3s ease-out both",
        "pulse-glow":   "pulse-glow 2s ease-in-out infinite",
      },
      borderRadius: {
        "xl": "0.75rem",
        "2xl": "1rem",
        "3xl": "1.25rem",
      },
    },
  },
  plugins: [],
};
