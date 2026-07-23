// tailwind.config.js
import { createRequire } from "node:module";
import path from "node:path";
import { heroui } from "@heroui/react";

const require = createRequire(import.meta.url);

/** Resolve @heroui/theme regardless of pnpm hoisting (app-local vs monorepo root). */
function herouiThemeDistGlob() {
    try {
        const pkgJson = require.resolve("@heroui/theme/package.json");
        return path.join(path.dirname(pkgJson), "dist/**/*.{js,ts,jsx,tsx}");
    } catch {
        return "./node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}";
    }
}

/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
        herouiThemeDistGlob(),
    ],
    theme: {
        extend: {},
    },
    darkMode: "class",
    plugins: [heroui()],
};
