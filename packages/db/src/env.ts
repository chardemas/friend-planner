import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Load the repo-root .env (if present) so every package and script shares one config file. */
export function loadRootEnv() {
  // Built with path.join rather than `new URL("../../../.env", import.meta.url)`: Next's bundler treats that
  // pattern as an asset import and fails the build when the file is missing, as it is on Vercel.
  const path = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", ".env");
  if (existsSync(path)) process.loadEnvFile(path);
}
