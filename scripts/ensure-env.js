// Creates .env on first install with a strong random EDIT_CODE.
// Never overwrites an existing .env.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// The .env / EDIT_CODE is only for the optional legacy local server. In CI
// (GitHub Actions) there's no server, so skip it entirely.
if (process.env.CI) {
  process.exit(0);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env");

if (existsSync(envPath)) {
  process.exit(0);
}

// URL-safe, easy to paste, ~22 chars of entropy.
const code = randomBytes(16).toString("base64url");
const example = existsSync(join(root, ".env.example"))
  ? readFileSync(join(root, ".env.example"), "utf8")
  : "EDIT_CODE=change-me\nPORT=8787\nPOLL_INTERVAL_MS=180000\nPOLL_ENABLED=1\nWC_API_BASE=https://worldcup26.ir\n";

writeFileSync(envPath, example.replace(/^EDIT_CODE=.*$/m, `EDIT_CODE=${code}`));

console.log("\n  Created .env with a random organiser edit code:\n");
console.log(`      EDIT_CODE = ${code}\n`);
console.log("  Keep it private. You'll type it into the app to unlock editing.\n");
