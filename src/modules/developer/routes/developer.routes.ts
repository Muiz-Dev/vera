import { Router } from "express";
import { DeveloperController } from "../controllers/developer.controller";

export function createDeveloperRouter(controller: DeveloperController): Router {
  const router = Router();

  // Developer Auth
  router.post("/developers/register", controller.register);
  router.post("/developers/login", controller.login);

  // Application CRUD
  router.post("/applications", controller.createApplication);
  router.get("/applications", controller.listApplications);
  router.get("/applications/:id", controller.getApplication);
  router.patch("/applications/:id", controller.updateApplication);
  router.delete("/applications/:id", controller.deleteApplication);

  // API Keys Rotation
  router.post("/environments/:environmentId/keys/rotate", controller.rotateKeys);

  // Environment Settings
  router.get("/environments/:environmentId/settings", controller.getSettings);
  router.patch("/environments/:environmentId/settings", controller.updateSettings);

  // Allowed Origins
  router.post("/environments/:environmentId/origins", controller.addAllowedOrigin);
  router.get("/environments/:environmentId/origins", controller.listAllowedOrigins);
  router.delete("/environments/:environmentId/origins/:id", controller.removeAllowedOrigin);

  return router;
}
export default createDeveloperRouter;
