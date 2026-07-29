import { Router } from "express";
import { OrganizationController } from "../controllers/organization.controller";

export function createOrganizationRouter(controller: OrganizationController): Router {
  const router = Router();

  // Organization CRUD
  router.post("/organizations", controller.create);
  router.get("/organizations", controller.list);
  router.get("/organizations/:id", controller.get);
  router.patch("/organizations/:id", controller.update);
  router.delete("/organizations/:id", controller.delete);

  // Membership CRUD & Actions
  router.get("/organizations/:id/members", controller.listMembers);
  router.delete("/organizations/:id/members/:developerId", controller.removeMember);
  router.post("/organizations/:id/transfer-ownership", controller.transferOwnership);

  // Invitations
  router.post("/organizations/:id/invitations", controller.inviteMember);
  router.get("/organizations/:id/invitations", controller.listInvitations);
  router.post("/invitations/:token/accept", controller.acceptInvitation);
  router.post("/organizations/:id/invitations/:invitationId/revoke", controller.revokeInvitation);

  // Activities
  router.get("/organizations/:id/activities", controller.listActivities);

  return router;
}
export default createOrganizationRouter;
