import type { Request } from "express";
import type { Action } from "../../generated/prisma";

export const ACTIONS: readonly Action[] = ["VIEW", "CREATE", "EDIT", "DELETE", "EXPORT", "IMPORT"];

export const ACTION_VERBS: Record<Action, string> = {
  VIEW: "consultar",
  CREATE: "criar",
  EDIT: "editar",
  DELETE: "apagar",
  EXPORT: "exportar",
  IMPORT: "importar",
};

const EXPORT = /\/(export|download)(\/|$)/;
const IMPORT = /\/(import|upload)(\/|$)/;
// POSTs que só lêem (pesquisa, conversa com o assistente)
const READ_LIKE_POST = /\/(search|chat)$/;
// POSTs que alteram algo que já existe
const EDIT_LIKE_POST = /\/(password|read|read-all)$/;

/** Caminho da API sem o prefixo `/api/v1` nem barra final, ex.: "/transactions/123". */
export function apiPathOf(req: Request): string {
  const path = `${req.baseUrl}${req.path}`.replace(/^\/api\/v1/, "").replace(/\/+$/, "");
  return path || "/";
}

/** Acção exigida por um pedido, a partir do método e do caminho. */
export function actionOf(method: string, path: string): Action {
  switch (method.toUpperCase()) {
    case "GET":
    case "HEAD":
    case "OPTIONS":
      return EXPORT.test(path) ? "EXPORT" : "VIEW";
    case "POST":
      if (IMPORT.test(path)) return "IMPORT";
      if (READ_LIKE_POST.test(path)) return "VIEW";
      return EDIT_LIKE_POST.test(path) ? "EDIT" : "CREATE";
    case "PUT":
    case "PATCH":
      return "EDIT";
    case "DELETE":
      return "DELETE";
    default:
      return "VIEW";
  }
}

/** Leituras não alteram dados (exportar também é leitura). */
export const isReadAction = (action: Action) => action === "VIEW" || action === "EXPORT";
