import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { queenMarkSvg } from "./queen-mark";

const here = dirname(fileURLToPath(import.meta.url));
const iconPath = join(here, "..", "app", "icon.svg");

describe("queen-mark favicon drift guard", () => {
  it("keeps src/app/icon.svg in sync with the shared geometry", () => {
    const committed = readFileSync(iconPath, "utf8");
    // If this fails, the favicon drifted from the logo geometry. Run
    // `node scripts/build-icon.mjs` to regenerate it.
    expect(committed).toBe(queenMarkSvg());
  });
});
