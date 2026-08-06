import { Router } from "express";
import { AuthenticationController } from "../controllers/authentication.controller";
import { OAuthController } from "../controllers/oauth.controller";
import { MfaController } from "../controllers/mfa.controller";
import { requireEnvironment } from "../../../core/middleware/environment.middleware";
import { requireAuthentication } from "../../authorization/middleware/authorization.middleware";

export function createAuthenticationRouter(
  controller: AuthenticationController,
  oauthController: OAuthController,
  mfaController: MfaController
): Router {
  const router = Router();

  router.use(requireEnvironment);

  router.post("/register", controller.register);
  router.post("/login", controller.login);
  router.post("/logout", controller.logout);
  router.post("/refresh", controller.refresh);
  router.post("/forgot-password", controller.forgotPassword);
  router.post("/reset-password", controller.resetPassword);
  router.post("/verify-email", controller.verifyEmail);
  router.post("/mfa/setup-placeholder", controller.setupMfaPlaceholder);

  // OAuth & Social Authentication routes
  router.get("/oauth/accounts", requireAuthentication, oauthController.list);
  router.post("/oauth/link", requireAuthentication, oauthController.link);
  router.delete("/oauth/link/:provider", requireAuthentication, oauthController.unlink);

  router.get("/oauth/:provider", oauthController.start);
  router.get("/oauth/:provider/callback", oauthController.callback);
  router.post("/oauth/token", oauthController.tokenExchange);

  // Enterprise MFA Engine routes
  router.post("/mfa/setup", requireAuthentication, mfaController.setup);
  router.post("/mfa/enable", requireAuthentication, mfaController.enable);
  router.post("/mfa/disable", requireAuthentication, mfaController.disable);
  router.post("/mfa/verify", mfaController.verify);
  router.post("/mfa/trusted-devices/revoke", requireAuthentication, mfaController.revokeTrustedDevice);
  router.post("/mfa/backup-codes/regenerate", requireAuthentication, mfaController.regenerateBackupCodes);

  return router;
}
