import type { Action } from "../../generated/prisma";

export interface ProfileResponse {
  id: string;
  code: string;
  name: string;
  description: string | null;
  superAdmin: boolean;
  system: boolean;
  isDefault: boolean;
  userCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PermissionResponse {
  functionalityId: string;
  code: string;
  actions: Action[];
}
