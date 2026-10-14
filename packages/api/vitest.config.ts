import { defineConfig } from "vitest/config";
import { loadRootEnv } from "@lowkey/db/env";

loadRootEnv();

export default defineConfig({ test: {} });
