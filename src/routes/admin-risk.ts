import type { FastifyInstance } from "fastify";
import { getRiskDashboard } from "../services/fraud-signals.js";
import type { AdminConsoleDeps } from "./admin-console-shared.js";

/** Trang cảnh báo rủi ro/gian lận — chỉ nêu cờ, người vận hành tự xử lý. */
export async function registerAdminRiskRoutes(
  app: FastifyInstance,
  deps: AdminConsoleDeps,
): Promise<void> {
  app.get("/risk", async (_request, reply) => {
    const risk = await getRiskDashboard(deps.db);
    return reply.view("backoffice/risk.njk", {
      pageTitle: "Cảnh báo rủi ro",
      backofficeSection: "risk",
      risk,
    });
  });
}
