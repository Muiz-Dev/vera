export interface PermissionEntity {
  id: string;
  name: string; // immutable string: domain.resource.action
  displayName: string;
  description: string | null;
  isSystem: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
