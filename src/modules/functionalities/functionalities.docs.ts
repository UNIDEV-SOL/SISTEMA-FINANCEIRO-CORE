import { documentPath } from "../../shared/docs/registry";
import { idParamSchema, z } from "../../shared/http/schemas";
import { functionalityCreateSchema, functionalityNodeSchema, functionalityOrderSchema, functionalityUpdateSchema } from "./functionalities.schemas";

const tag = "Administração — menus";

documentPath({
  method: "get",
  path: "/admin/functionalities",
  tag,
  summary: "Árvore completa de menus e funcionalidades",
  description: "Inclui as desactivadas, com `apiPaths` (padrões das rotas protegidas, `*` = um segmento, `**` = o resto) e `protectReads`.",
  response: { schema: z.array(functionalityNodeSchema) },
});

documentPath({
  method: "post",
  path: "/admin/functionalities",
  tag,
  summary: "Cria uma secção ou entrada de menu",
  description: "Secções não têm `path`. Sem `order`, fica no fim da secção.",
  body: functionalityCreateSchema,
  response: { status: 201, schema: functionalityNodeSchema },
});

documentPath({
  method: "put",
  path: "/admin/functionalities/order",
  tag,
  summary: "Reordena e move entradas entre secções",
  description: "Devolve a árvore completa actualizada.",
  body: functionalityOrderSchema,
  response: { schema: z.array(functionalityNodeSchema) },
});

documentPath({
  method: "put",
  path: "/admin/functionalities/{id}",
  tag,
  summary: "Actualiza uma funcionalidade (o código não muda)",
  params: idParamSchema,
  body: functionalityUpdateSchema,
  response: { schema: functionalityNodeSchema },
});

documentPath({
  method: "delete",
  path: "/admin/functionalities/{id}",
  tag,
  summary: "Apaga uma funcionalidade",
  description: "409 se tiver filhos ou estiver atribuída a perfis (nesse caso, desactive-a).",
  params: idParamSchema,
});
