import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { AppRouter } from "@lowkey/api";

const link = new RPCLink({
  url: () => `${typeof window === "undefined" ? "http://localhost:3000" : window.location.origin}/api/rpc`,
});

/** Fully typed client: inputs and outputs come straight from the server router. */
export const client: RouterClient<AppRouter> = createORPCClient(link);
export const orpc = createTanstackQueryUtils(client);
