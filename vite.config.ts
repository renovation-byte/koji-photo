/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages: https://renovation-byte.github.io/koji-photo/
export default defineConfig({
  base: "/koji-photo/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-180.png"],
      manifest: {
        name: "工事写真台帳",
        short_name: "工事写真",
        description: "現場で撮影したら、その場で工事写真台帳が完成する",
        lang: "ja",
        start_url: "/koji-photo/",
        scope: "/koji-photo/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#f3f5f9",
        theme_color: "#1a2f5e",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: { globPatterns: ["**/*.{js,css,html,png,svg,webmanifest}"] },
    }),
  ],
  test: { environment: "node" },
});
