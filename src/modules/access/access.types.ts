import type { Action, FamilyAccess } from "../../generated/prisma";
import type { ActingVia } from "../../shared/access/acting-as";

export interface MenuNode {
  code: string;
  label: string;
  path: string | null;
  icon: string | null;
  order: number;
  actions: Action[];
  children: MenuNode[];
}

export interface ActingCandidate {
  id: string;
  name: string;
  email: string;
  via: ActingVia;
  access: FamilyAccess;
}
