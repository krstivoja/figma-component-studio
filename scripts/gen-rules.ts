import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildRules, renderModule } from "../mcp/rules-source";

// `npm run rules`: regenerates mcp/rules.generated.ts. Fails on a missing file or heading; the old module stays.
const root = resolve(__dirname, "..");
const out = resolve(root, "mcp/rules.generated.ts");
writeFileSync(out, renderModule(buildRules(root)));
console.log(`wrote ${out}`);
