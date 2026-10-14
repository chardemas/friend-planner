import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// One .env at the repo root for the whole monorepo.
const rootEnv = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const config: NextConfig = {
  // Workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: ["@lowkey/api", "@lowkey/db", "@lowkey/validators"],
  agentRules: false,
  serverExternalPackages: ["postgres"],
  turbopack: { root: fileURLToPath(new URL("../..", import.meta.url)) },
};

export default config;
