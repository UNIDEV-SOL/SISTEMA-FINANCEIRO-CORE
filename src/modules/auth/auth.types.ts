import type { ActingAs } from "../../shared/access/acting-as";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  /** Código da moeda, ex.: "MZN". */
  currency: string;
  active: boolean;
  profile: { id: string; code: string; name: string; superAdmin: boolean };
  actingAs: ActingAs | null;
}

export interface Session {
  token: string;
  user: AuthUser;
}
