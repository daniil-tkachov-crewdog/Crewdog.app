// config/vite.config.ts
//
// Vite build configuration.
//
// This file does not sit at the repository root, so three things have to be
// stated that Vite would otherwise infer from the config file's location:
// the project root, the @ alias, and where to find the PostCSS config. The
// last one matters most — Vite searches for postcss.config.js upward from
// the project root, would not find it in config/, and would then build with
// no Tailwind at all and no error to say so.

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// The repository root, one level up from this file.
const projectRoot = path.resolve(__dirname, "..");

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // index.html lives at the repository root and is the build's entry
  // document, so the root stays there rather than following this file.
  root: projectRoot,

  server: {
    host: "::",
    port: 8080,
  },

  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),

  resolve: {
    alias: {
      "@": path.resolve(projectRoot, "client"),
    },
  },

  css: {
    // Explicit, for the reason in the header: without this the Tailwind and
    // autoprefixer pipeline silently does not run.
    postcss: path.resolve(__dirname, "postcss.config.js"),
  },

  build: {
    // Relative to `root`, so the server keeps finding dist/ where it expects.
    outDir: "dist",
    emptyOutDir: true,
  },
}));
