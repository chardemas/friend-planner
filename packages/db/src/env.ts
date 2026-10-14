import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Load the repo-root .env (if present) so every package and script shares one config file. */
export function loadRootEnv() {
  const path = fileURLToPath(new URL("../../../.env", import.meta.url));
  if (existsSync(path)) process.loadEnvFile(path);
}
