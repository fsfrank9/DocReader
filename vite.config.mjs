import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { VitePWA } from "vite-plugin-pwa";
import { pdfAssets } from "./build/pdf-assets.mjs";

// Cloudflare's Build Output v1 places the client bundle here.
const clientOutput = ".cloudflare/output/v1/workers/default/assets";

export default defineConfig(({ command }) => ({
  build: {
    target: ["es2022", "safari16"],
    outDir: clientOutput,
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
  },
  plugins: [
    react(),
    pdfAssets(),
    ...(command === "build" ? [cloudflare()] : []),
    VitePWA({
      outDir: clientOutput,
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["icons/*.png"],
      manifest: {
        id: "/",
        name: "纸间 · Leaf",
        short_name: "纸间",
        description: "把时间留给阅读。简洁、舒适的文档阅读器。",
        lang: "zh-CN",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "any",
        theme_color: "#faf8f3",
        background_color: "#faf8f3",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: [
          "**/*.{js,mjs,css,html,ico,png,gif,svg,webmanifest,woff,woff2,ttf,wasm,bcmap,pfb,icc}",
          "pdfjs/**/LICENSE*",
        ],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
    }),
  ],
}));
