#!/usr/bin/env node
/**
 * Fails if any placeholder content is left in src/content/site.ts.
 *
 * Run this before going live. Shipping a laundromat site with a placeholder
 * address or phone number is the single most damaging mistake this project
 * can make, so it gets a hard gate rather than a comment nobody reads.
 *
 *   npm run check:content
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const file = join(here, "..", "src", "content", "site.ts");
const lines = readFileSync(file, "utf8").split("\n");

const found = [];
lines.forEach((line, i) => {
  // Only flag placeholder *values*, not the explanatory comments above them.
  if (/"\s*TODO:/.test(line)) {
    found.push({ line: i + 1, text: line.trim() });
  }
});

if (found.length === 0) {
  console.log("✓ No placeholder content left in site.ts — ready to launch.");
  process.exit(0);
}

console.error(`\n✗ ${found.length} placeholder value(s) still in src/content/site.ts:\n`);
for (const f of found) {
  console.error(`  site.ts:${f.line}  ${f.text}`);
}
console.error("\nReplace these with real values before deploying.\n");
process.exit(1);
