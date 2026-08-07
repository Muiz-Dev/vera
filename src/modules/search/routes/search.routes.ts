import { Router } from "express";
import { SearchController } from "../controllers/search.controller";
import { requireEnvironment } from "../../../core/middleware/environment.middleware";

export function createSearchRouter(controller: SearchController): Router {
  const router = Router();

  // Enforce environment validation across all Search routes
  router.use(requireEnvironment);

  router.post("/search", controller.search);
  router.post("/search/index", controller.index);
  router.post("/search/bulk", controller.bulk);
  router.post("/search/hybrid", controller.hybrid);
  router.post("/search/suggest", controller.suggest);
  router.post("/search/feedback", controller.feedback);

  router.delete("/search/:documentId", controller.delete);

  router.get("/search/history", controller.history);
  router.get("/search/statistics", controller.statistics);
  router.get("/search/facets", controller.facets);

  return router;
}
export default createSearchRouter;
