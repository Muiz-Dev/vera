import { Router } from "express";
import { IdentityController } from "../controllers/identity.controller";
import { requireEnvironment } from "../../../core/middleware/environment.middleware";

export function createIdentityRouter(controller: IdentityController): Router {
  const router = Router();

  router.use(requireEnvironment);

  router.post("/", controller.createIdentity);
  router.get("/:id", controller.getIdentity);
  router.patch("/:id", controller.updateIdentity);
  router.delete("/:id", controller.deleteIdentity);
  router.post("/:id/suspend", controller.suspendIdentity);

  return router;
}
