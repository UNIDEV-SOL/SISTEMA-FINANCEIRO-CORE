export interface AdminUserResponse {
  id: string;
  name: string;
  email: string;
  active: boolean;
  profile: { id: string; code: string; name: string; superAdmin: boolean };
  currency: string;
  createdAt: string;
  lastLoginAt: string | null;
}
