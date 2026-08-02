import type { FastifyInstance } from "fastify";
import { registerAccountApiRoutes } from "./account.js";
import { registerAuthApiRoutes } from "./auth.js";
import type { ApiDeps } from "./deps.js";
import { registerProductApiRoutes } from "./products.js";

export type { ApiDeps } from "./deps.js";

export async function registerApiRoutes(
  app: FastifyInstance,
  deps: ApiDeps,
): Promise<void> {
  app.get("/csrf", async (request) => ({ csrfToken: request.csrfToken }));

  await registerAuthApiRoutes(app, deps);
  await registerProductApiRoutes(app, deps);
  await registerAccountApiRoutes(app, deps);
}
