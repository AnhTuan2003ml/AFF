import type { FastifyInstance } from "fastify";
import { requireRoles } from "../auth/guards.js";
import { registerAdminDashboardRoutes } from "./admin-dashboard.js";
import { registerAdminOrderRoutes } from "./admin-orders.js";
import { registerAdminUserRoutes } from "./admin-users.js";
import type { AdminConsoleDeps } from "./admin-console-shared.js";

export async function registerAdminConsoleRoutes(
  app: FastifyInstance,
  deps: AdminConsoleDeps,
): Promise<void> {
  app.addHook(
    "preHandler",
    requireRoles(
      "SUPER_ADMIN",
      "ADMIN",
      "FINANCE",
      "RISK",
      "SUPPORT",
      "AUDITOR",
    ),
  );
  await registerAdminDashboardRoutes(app, deps);
  await registerAdminOrderRoutes(app, deps);
  await registerAdminUserRoutes(app, deps);
}
