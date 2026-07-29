import { Router } from "express";
import { AuthenticationController } from "../controllers/authentication.controller";

export function createAuthenticationRouter(controller: AuthenticationController): Router {
  const router = Router();

  router.post("/register", controller.register);
  router.post("/login", controller.login);
  router.post("/logout", controller.logout);
  router.post("/refresh", controller.refresh);
  router.post("/forgot-password", controller.forgotPassword);
  router.post("/reset-password", controller.resetPassword);
  router.post("/verify-email", controller.verifyEmail);
  router.post("/mfa/setup-placeholder", controller.setupMfaPlaceholder);

  return router;
}
