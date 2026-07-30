import { Router } from "express";
import { NotificationController } from "../controllers/notification.controller";
import { requireAuthentication, requirePermission } from "../../authorization/middleware/authorization.middleware";
import { requireEnvironment } from "../../../core/middleware/environment.middleware";
import { Permissions } from "../../../core/constants/permissions";

export function createNotificationRouter(controller: NotificationController): Router {
  const router = Router();

  // Enforce environment validation and authentication globally
  router.use(requireEnvironment);
  router.use(requireAuthentication);

  // Notifications
  router.get(
    "/notifications",
    requirePermission(Permissions.NOTIFICATION_READ),
    controller.listNotifications
  );
  router.get(
    "/notifications/:id",
    requirePermission(Permissions.NOTIFICATION_READ),
    controller.getNotificationById
  );
  router.post(
    "/notifications/test",
    requirePermission(Permissions.NOTIFICATION_SEND),
    controller.sendTestNotification
  );

  // Notification Templates
  router.get(
    "/notification-templates",
    requirePermission(Permissions.NOTIFICATION_TEMPLATE_READ),
    controller.listTemplates
  );
  router.post(
    "/notification-templates",
    requirePermission(Permissions.NOTIFICATION_TEMPLATE_WRITE),
    controller.createTemplate
  );
  router.patch(
    "/notification-templates/:id",
    requirePermission(Permissions.NOTIFICATION_TEMPLATE_WRITE),
    controller.updateTemplate
  );
  router.delete(
    "/notification-templates/:id",
    requirePermission(Permissions.NOTIFICATION_TEMPLATE_WRITE),
    controller.deleteTemplate
  );

  return router;
}
export default createNotificationRouter;
