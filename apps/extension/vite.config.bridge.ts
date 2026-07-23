import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
    build: {
        emptyOutDir: false,
        lib: {
            entry: resolve(__dirname, "src/lib/bridge-isolated.ts"),
            name: "ytmpBridge",
            formats: ["iife"],
            fileName: () => "content-bridge.js",
        },
        minify: false,
        rollupOptions: {
            output: {
                extend: true,
            },
        },
    },
    esbuild: {
        keepNames: true,
        minifyIdentifiers: false,
        minifySyntax: false,
    },
});
