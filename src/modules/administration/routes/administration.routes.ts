import { Router } from "express";
import { AdministrationController } from "../controllers/administration.controller";

export function createAdministrationRouter(controller: AdministrationController): Router {
  const router = Router();

  // Dashboard statistics
  router.get("/statistics", controller.getStatistics);

  // Paginated resources
  router.get("/developers", controller.listDevelopers);
  router.get("/applications", controller.listApplications);
  router.get("/organizations", controller.listOrganizations);
  router.get("/notifications", controller.listNotifications);

  // Audit Logs
  router.get("/audit-logs/organization-activities", controller.listOrganizationActivities);
  router.get("/audit-logs/notification-logs", controller.listNotificationLogs);

  // Settings
  router.get("/settings/:environmentId", controller.getEnvironmentSettings);
  router.patch("/settings/:environmentId", controller.updateEnvironmentSettings);

  return router;
}
export default createAdministrationRouter;
