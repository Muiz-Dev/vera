import { IdentityStatus } from "../../../generated/prisma/client";

export interface IdentityProfileEntity {
  id: string;
  identityId: string;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  displayName: string | null;
  metadata: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface IdentityEntity {
  id: string;
  environmentId: string;
  email: string | null;
  phone: string | null;
  status: IdentityStatus;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  profile: IdentityProfileEntity | null;
}
