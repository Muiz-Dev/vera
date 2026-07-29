export interface RoleEntity {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isSystem: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
