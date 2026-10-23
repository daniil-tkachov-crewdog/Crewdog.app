// config/postcss.config.js
//
// The PostCSS pipeline: Tailwind, then autoprefixer.
//
// Tailwind is given its config path explicitly because this file no longer
// sits at the repository root — Tailwind would otherwise look for
// tailwind.config.ts in the working directory and fall back to its own
// defaults, which compiles successfully and produces a stylesheet missing
// every custom colour, font and animation in the app.

import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  plugins: {
    tailwindcss: { config: path.join(__dirname, "tailwind.config.ts") },
    autoprefixer: {},
  },
};
