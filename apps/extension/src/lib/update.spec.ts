import { describe, expect, it } from "vitest";
import { isNewerVersion } from "./update";

describe("isNewerVersion", () => {
    it("detects higher patch", () => {
        expect(isNewerVersion("1.7.1", "1.7.0")).toBe(true);
    });

    it("detects higher minor", () => {
        expect(isNewerVersion("1.8.0", "1.7.9")).toBe(true);
    });

    it("returns false when equal", () => {
        expect(isNewerVersion("1.7.0", "1.7.0")).toBe(false);
        expect(isNewerVersion("v1.7.0", "1.7.0")).toBe(false);
    });

    it("returns false when latest is older", () => {
        expect(isNewerVersion("1.6.2", "1.7.0")).toBe(false);
    });
});
