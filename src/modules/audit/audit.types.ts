export interface AuditLogResponse {
  id: string;
  actorId: string | null;
  actorName: string | null;
  actingAsId: string | null;
  actingAsName: string | null;
  action: string;
  method: string;
  path: string;
  statusCode: number;
  functionalityCode: string | null;
  ip: string | null;
  userAgent: string | null;
  durationMs: number;
  details: unknown;
  createdAt: string;
}
