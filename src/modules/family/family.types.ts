import type { FamilyAccess, FamilyLinkStatus } from "../../generated/prisma";

export interface FamilyLinkView {
  id: string;
  access: FamilyAccess;
  status: FamilyLinkStatus;
  createdAt: string;
  respondedAt: string | null;
  person: { id: string; name: string; email: string };
}

export interface FamilyOverview {
  dependents: FamilyLinkView[];
  guardians: FamilyLinkView[];
  invitations: FamilyLinkView[];
}
