import { OpenAPIRegistry, type RouteConfig } from "@asteasolutions/zod-to-openapi";
import { problemSchema, z } from "../http/schemas";

/**
 * Registo central do OpenAPI. Cada módulo regista as suas rotas em `<módulo>.docs.ts`;
 * o `openapi.ts` importa esses ficheiros e gera o documento.
 */
export const registry = new OpenAPIRegistry();

registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
  description: "Token obtido em `POST /auth/login` ou `POST /auth/register`.",
});

const problem = (description: string) => ({ description, content: { "application/problem+json": { schema: problemSchema } } });

interface PathDoc {
  method: RouteConfig["method"];
  path: string;
  tag: string;
  summary: string;
  description?: string;
  /** Rotas públicas (registo e login). */
  public?: boolean;
  params?: z.ZodObject;
  query?: z.ZodObject;
  body?: z.ZodType;
  /** Sem `response`, a rota devolve 204. */
  response?: { status?: 200 | 201; schema: z.ZodType; description?: string };
}

export function documentPath(doc: PathDoc) {
  const status = doc.response?.status ?? (doc.response ? 200 : 204);
  registry.registerPath({
    method: doc.method,
    path: doc.path,
    tags: [doc.tag],
    summary: doc.summary,
    description: doc.description,
    security: doc.public ? undefined : [{ bearerAuth: [] }],
    request: {
      params: doc.params,
      query: doc.query,
      body: doc.body ? { required: true, content: { "application/json": { schema: doc.body } } } : undefined,
    },
    responses: {
      [status]: doc.response
        ? { description: doc.response.description ?? "Sucesso", content: { "application/json": { schema: doc.response.schema } } }
        : { description: "Sem conteúdo" },
      ...(doc.public ? {} : { 401: problem("Token ausente, inválido ou expirado") }),
      ...(doc.params ? { 404: problem("Recurso não encontrado") } : {}),
      ...(doc.body || doc.query ? { 422: problem("Dados inválidos, com erros por campo") } : {}),
    },
  });
}
