import { defineConfig } from "cf/config";

export default defineConfig({
  worker: {
    name: "docreader",
    compatibilityDate: "2026-11-21",
    assets: {
      notFoundHandling: "single-page-application",
    },
    workersDev: true,
  },
});
