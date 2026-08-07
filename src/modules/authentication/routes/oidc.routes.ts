import { Router } from "express";
import { OidcController } from "../controllers/oidc.controller";
import { requireEnvironment } from "../../../core/middleware/environment.middleware";
import { requireAuthentication } from "../../authorization/middleware/authorization.middleware";

export function createOidcRouter(controller: OidcController): Router {
  const router = Router();

  // Every route in this router must read and respect environmentId context
  router.use(requireEnvironment);

  // Discovery: MUST be public
  router.get("/.well-known/openid-configuration", controller.getDiscovery);

  // Certs: Public JWKS key set
  router.get("/oauth/certs", controller.getCerts);

  // Facilitate registering test client configurations
  router.post("/oauth/clients", requireAuthentication, controller.registerClient);

  // Authorize: Session Authenticated
  router.get("/oauth/authorize", requireAuthentication, controller.authorize);

  // Token Exchange: Public POST
  router.post("/oauth/token", controller.token);

  // User Information: Bearer Token Auth
  router.get("/oauth/userinfo", controller.userInfo);

  // Revocation: Public POST
  router.post("/oauth/revoke", controller.revoke);

  return router;
}
