import type { FastifyInstance } from "fastify";
import { registerAccountApiRoutes } from "./account.js";
import { registerAuthApiRoutes } from "./auth.js";
import { registerFeatureApiRoutes } from "./features.js";
import type { ApiDeps } from "./deps.js";
import { registerHarvestApiRoutes } from "./harvest.js";
import { registerKolApiRoutes } from "./kol.js";
import { registerMeApiRoutes } from "./me.js";
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
  await registerMeApiRoutes(app, deps);
  await registerKolApiRoutes(app, deps);
  await registerHarvestApiRoutes(app, deps);
  await registerFeatureApiRoutes(app, deps);
}
