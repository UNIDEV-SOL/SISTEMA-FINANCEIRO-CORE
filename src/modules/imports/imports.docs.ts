import { documentPath } from "../../shared/docs/registry";
import { z } from "../../shared/http/schemas";
import { importCommitSchema, importPreviewSchema, importResultSchema, importTextSchema, MAX_IMPORT_ITEMS } from "./imports.schemas";

const tag = "Importação";

documentPath({
  method: "post",
  path: "/transactions/import/preview",
  tag,
  summary: "Lê SMS colados (M-Pesa, e-Mola, BIM) e mostra o que seria importado",
  description:
    "Não grava nada. Cada movimento traz o tipo, a categoria sugerida e o estado: `DUPLICATE` (já importado, mesma referência) ou " +
    "`POSSIBLE_DUPLICATE` (já existe uma transação do mesmo tipo e valor, até um dia de diferença). Depósitos e levantamentos " +
    "no agente são transferências entre a carteira e o dinheiro vivo; as taxas vêm como despesas à parte. Exige a acção IMPORT.",
  body: importTextSchema,
  response: { schema: importPreviewSchema },
});

documentPath({
  method: "post",
  path: "/transactions/import/pdf",
  tag,
  summary: "Lê um comprovativo em PDF (nota de lançamento do BIM)",
  description: "Corpo: o ficheiro, com `Content-Type: application/pdf` (até 5 MB). Resposta igual à pré-visualização dos SMS.",
  body: z.string().openapi({ type: "string", format: "binary" }),
  bodyType: "application/pdf",
  response: { schema: importPreviewSchema },
});

documentPath({
  method: "post",
  path: "/transactions/import",
  tag,
  summary: "Importa os movimentos escolhidos",
  description:
    `Até ${MAX_IMPORT_ITEMS} de cada vez, todos ou nenhum: cada item é validado como uma transação (erros em \`items.N.campo\`). ` +
    "Ficam liquidados. Os que já foram importados (mesmo `importRef`) são ignorados e contados em `skipped`.",
  body: importCommitSchema,
  response: { status: 201, schema: importResultSchema },
});
