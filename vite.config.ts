import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const base = process.env.GITHUB_PAGES === "true" ? "/capability-canvas/" : "/";

function vendorChunk(id: string): string | undefined {
  const normalizedId = id.replace(/\\/g, "/");
  if (!normalizedId.includes("/node_modules/")) return undefined;

  const packagePath = normalizedId.split("/node_modules/").pop() ?? "";
  if (
    packagePath.startsWith("react/") ||
    packagePath.startsWith("react-dom/") ||
    packagePath.startsWith("scheduler/")
  ) {
    return "react-vendor";
  }

  if (packagePath.startsWith("elkjs/")) return "layout-vendor";

  if (packagePath.startsWith("pptxgenjs/")) return "export-pptx-vendor";
  if (
    packagePath.startsWith("jszip/") ||
    packagePath.startsWith("fflate/") ||
    packagePath.startsWith("cfb/") ||
    packagePath.startsWith("ssf/")
  ) {
    return "export-archive-vendor";
  }

  if (packagePath.startsWith("lucide-react/")) return "icons-vendor";
  if (
    packagePath.startsWith("@headless-tree/") ||
    packagePath.startsWith("zustand/")
  ) {
    return "ui-vendor";
  }

  if (packagePath.startsWith("idb/") || packagePath.startsWith("zod/")) {
    return "data-vendor";
  }

  return "vendor";
}

export default defineConfig({
  base,
  build: {
    rollupOptions: {
      output: {
        manualChunks: vendorChunk,
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.svg",
        "apple-touch-icon.png",
        "pwa-192x192.png",
        "pwa-512x512.png",
        "maskable-icon-512x512.png",
      ],
      manifest: {
        name: "Capability Canvas",
        short_name: "Capability Canvas",
        description: "Local-first hierarchical capability modeling tool.",
        theme_color: "#0f766e",
        background_color: "#f8fafc",
        display: "standalone",
        icons: [
          {
            src: `${base}favicon.svg`,
            sizes: "any",
            type: "image/svg+xml",
          },
          {
            src: `${base}pwa-192x192.png`,
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: `${base}pwa-512x512.png`,
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: `${base}maskable-icon-512x512.png`,
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    globals: true,
    css: true,
    exclude: ["node_modules/**", "dist/**", "tests/e2e/**"],
    testTimeout: 10_000,
  },
});
