export const Events = {
  ROLE_CREATED: "RoleCreated",
  ROLE_UPDATED: "RoleUpdated",
  ROLE_DELETED: "RoleDeleted",
  PERMISSION_CREATED: "PermissionCreated",
  PERMISSION_ASSIGNED: "PermissionAssigned",
  PERMISSION_REVOKED: "PermissionRevoked",
  ROLE_ASSIGNED: "RoleAssigned",
  ROLE_REMOVED: "RoleRemoved",
  AUTHORIZATION_EVALUATED: "AuthorizationEvaluated",

  // Organization Events
  ORGANIZATION_CREATED: "OrganizationCreated",
  ORGANIZATION_UPDATED: "OrganizationUpdated",
  ORGANIZATION_DELETED: "OrganizationDeleted",
  MEMBER_INVITED: "MemberInvited",
  INVITATION_ACCEPTED: "InvitationAccepted",
  INVITATION_EXPIRED: "InvitationExpired",
  MEMBER_JOINED: "MemberJoined",
  MEMBER_REMOVED: "MemberRemoved",
  OWNERSHIP_TRANSFERRED: "OwnershipTransferred",

  // Developer Platform Events
  DEVELOPER_REGISTERED: "DeveloperRegistered",
  APPLICATION_CREATED: "ApplicationCreated",
  API_KEY_ROTATED: "ApiKeyRotated",
} as const;
