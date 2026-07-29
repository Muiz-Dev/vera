import { Router } from "express";
import { IdentityController } from "../controllers/identity.controller";

export function createIdentityRouter(controller: IdentityController): Router {
  const router = Router();

  router.post("/", controller.createIdentity);
  router.get("/:id", controller.getIdentity);
  router.patch("/:id", controller.updateIdentity);
  router.delete("/:id", controller.deleteIdentity);
  router.post("/:id/suspend", controller.suspendIdentity);

  return router;
}
