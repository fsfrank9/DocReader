import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join } from "node:path";

const require = createRequire(import.meta.url);
const packageRoot = dirname(require.resolve("pdfjs-dist/package.json"));
const resources = [
  ["cmaps", "cmaps"],
  ["standard_fonts", "standard_fonts"],
  ["wasm", "wasm"],
  ["iccs", "iccs"],
  ["legacy/web/images", "images"],
];
const contentTypes = {
  ".js": "text/javascript",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".gif": "image/gif",
  ".ttf": "font/ttf",
};

// Keep PDF fonts, CMaps and decoders on the same origin, including offline.
export function pdfAssets() {
  const files = new Map(resources.flatMap(([source, destination]) =>
    readdirSync(join(packageRoot, source)).map((name) => [
      `/pdfjs/${destination}/${name}`,
      join(packageRoot, source, name),
    ]),
  ));

  return {
    name: "leaf-pdf-assets",
    applyToEnvironment: (environment) => environment.name === "client",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = files.get(request.url.split("?")[0]);
        if (!path) return next();
        response.setHeader("Content-Type", contentTypes[extname(path)] || "application/octet-stream");
        response.end(readFileSync(path));
      });
    },
    generateBundle() {
      for (const [url, path] of files) {
        this.emitFile({ type: "asset", fileName: url.slice(1), source: readFileSync(path) });
      }
    },
  };
}
