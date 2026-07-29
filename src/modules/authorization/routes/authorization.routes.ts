import { Router } from "express";
import { AuthorizationController } from "../controllers/authorization.controller";
import {
  requireAuthentication,
  requirePermission,
} from "../middleware/authorization.middleware";
import { Permissions } from "../../../core";

export function createAuthorizationRouter(controller: AuthorizationController): Router {
  const router = Router();

  // Enforce authentication globally for all authorization endpoints
  router.use(requireAuthentication);

  // --- ROLES ROUTES ---
  router.post(
    "/roles",
    requirePermission(Permissions.AUTHORIZATION_ROLES_CREATE),
    controller.createRole
  );
  router.get(
    "/roles",
    requirePermission(Permissions.AUTHORIZATION_ROLES_READ),
    controller.listRoles
  );
  router.get(
    "/roles/:id",
    requirePermission(Permissions.AUTHORIZATION_ROLES_READ),
    controller.getRole
  );
  router.patch(
    "/roles/:id",
    requirePermission(Permissions.AUTHORIZATION_ROLES_UPDATE),
    controller.updateRole
  );
  router.delete(
    "/roles/:id",
    requirePermission(Permissions.AUTHORIZATION_ROLES_DELETE),
    controller.deleteRole
  );

  // --- PERMISSIONS ROUTES ---
  router.post(
    "/permissions",
    requirePermission(Permissions.AUTHORIZATION_PERMISSIONS_CREATE),
    controller.createPermission
  );
  router.get(
    "/permissions",
    requirePermission(Permissions.AUTHORIZATION_PERMISSIONS_READ),
    controller.listPermissions
  );

  // --- ROLE-PERMISSIONS MAP ROUTES ---
  router.post(
    "/role-permissions/:roleId",
    requirePermission(Permissions.AUTHORIZATION_PERMISSIONS_ASSIGN),
    controller.assignPermission
  );
  router.delete(
    "/role-permissions/:roleId/:permissionId",
    requirePermission(Permissions.AUTHORIZATION_PERMISSIONS_REVOKE),
    controller.revokePermission
  );

  // --- IDENTITY-ROLES MAP ROUTES ---
  router.post(
    "/identity-roles/:identityId",
    requirePermission(Permissions.AUTHORIZATION_PERMISSIONS_ASSIGN),
    controller.assignRole
  );
  router.delete(
    "/identity-roles/:identityId/:roleId",
    requirePermission(Permissions.AUTHORIZATION_PERMISSIONS_REVOKE),
    controller.removeRole
  );
  router.get(
    "/identity-roles/:identityId/permissions",
    requirePermission(Permissions.AUTHORIZATION_PERMISSIONS_READ),
    controller.getIdentityPermissions
  );

  return router;
}
