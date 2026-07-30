export const Permissions = {
  AUTHORIZATION_ROLES_CREATE: "authorization.roles.create",
  AUTHORIZATION_ROLES_READ: "authorization.roles.read",
  AUTHORIZATION_ROLES_UPDATE: "authorization.roles.update",
  AUTHORIZATION_ROLES_DELETE: "authorization.roles.delete",
  AUTHORIZATION_PERMISSIONS_CREATE: "authorization.permissions.create",
  AUTHORIZATION_PERMISSIONS_READ: "authorization.permissions.read",
  AUTHORIZATION_PERMISSIONS_ASSIGN: "authorization.permissions.assign",
  AUTHORIZATION_PERMISSIONS_REVOKE: "authorization.permissions.revoke",

  // Notification Engine Permissions
  NOTIFICATION_READ: "notification.read",
  NOTIFICATION_SEND: "notification.send",
  NOTIFICATION_TEMPLATE_READ: "notification.template.read",
  NOTIFICATION_TEMPLATE_WRITE: "notification.template.write",
} as const;
