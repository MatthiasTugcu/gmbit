// Regenerate src/app/icon.svg from the shared queen-mark geometry. Run after
// editing the mark in src/components/queen-mark.ts:
//
//   node scripts/build-icon.mjs
//
// The drift-guard test (src/components/queen-mark.test.ts) fails if the
// committed favicon falls out of sync with the geometry.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const { queenMarkSvg } = await import("../src/components/queen-mark.ts");

const out = join(here, "..", "src", "app", "icon.svg");
writeFileSync(out, queenMarkSvg());
console.log(`wrote ${out}`);
