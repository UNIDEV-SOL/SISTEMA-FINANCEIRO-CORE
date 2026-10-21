import { documentPath } from "../../shared/docs/registry";
import { idParamSchema, z } from "../../shared/http/schemas";
import { archiveFiltersSchema, attachmentParamsSchema, messageAttachmentSchema } from "../attachments/attachments.controller";
import { pageQuerySchema, pageSchema } from "../../shared/http/pagination";
import { TRANSACTION_SORTS, transactionFiltersSchema, transactionInputSchema, transactionListSchema, transactionSchema } from "./transactions.schemas";

const tag = "Transações";

documentPath({
  method: "get",
  path: "/transactions",
  tag,
  summary: "Lista as transações de um mês (paginado), com totais",
  description:
    "Sem `month`, usa o mês corrente. `accountId` encontra também as transferências que entram na conta. " +
    "`search` (ou `q`) procura na descrição e nas notas. Por omissão, as mais recentes primeiro. `totals` cobre todo o filtro, não só a página.",
  query: pageQuerySchema(TRANSACTION_SORTS).extend(transactionFiltersSchema.shape),
  response: { schema: transactionListSchema },
});

documentPath({
  method: "post",
  path: "/transactions",
  tag,
  summary: "Regista uma transação",
  description: "Transferências exigem `destinationAccountId`; receitas e despesas exigem `categoryId` do mesmo tipo. Pendentes não mexem no saldo.",
  body: transactionInputSchema,
  response: { status: 201, schema: transactionSchema },
});

documentPath({
  method: "put",
  path: "/transactions/{id}",
  tag,
  summary: "Actualiza uma transação",
  params: idParamSchema,
  body: transactionInputSchema,
  response: { schema: transactionSchema },
});

documentPath({ method: "delete", path: "/transactions/{id}", tag, summary: "Apaga uma transação", params: idParamSchema });

const attachment = z
  .object({
    id: z.uuid(),
    kind: z.enum(["MESSAGE", "FILE"]),
    name: z.string(),
    mimeType: z.string().optional(),
    size: z.number().int(),
    text: z.string().optional().openapi({ description: "O texto da mensagem (só MESSAGE)." }),
    createdAt: z.string(),
  })
  .openapi("TransactionAttachment");

documentPath({
  method: "get",
  path: "/transactions/{id}/attachments",
  tag,
  summary: "Comprovativos de uma transação (SMS, PDF, fotografias)",
  params: idParamSchema,
  response: { schema: z.array(attachment) },
});

documentPath({
  method: "post",
  path: "/transactions/{id}/attachments",
  tag,
  summary: "Anexa um comprovativo",
  description:
    "JSON `{ text }` guarda o SMS de confirmação. Um PDF ou uma fotografia (JPEG, PNG, WebP) vai no corpo com o Content-Type do ficheiro e o nome em " +
    "`X-File-Name` (encodeURIComponent). Limites nos parâmetros `attachments.maxFileMb` e `attachments.maxPerTransaction`; só em anos abertos.",
  params: idParamSchema,
  body: messageAttachmentSchema,
  response: { status: 201, schema: attachment },
});

documentPath({
  method: "get",
  path: "/transactions/{id}/attachments/{attachmentId}/file",
  tag,
  summary: "Abre um comprovativo (o ficheiro, ou o texto da mensagem)",
  params: attachmentParamsSchema,
  response: { schema: z.string().openapi({ type: "string", format: "binary" }) },
});

documentPath({ method: "delete", path: "/transactions/{id}/attachments/{attachmentId}", tag, summary: "Retira um comprovativo", params: attachmentParamsSchema });

documentPath({
  method: "get",
  path: "/transactions/attachments",
  tag,
  summary: "Arquivo de comprovativos (paginado)",
  description: "Todos os SMS e recibos guardados, os mais recentes primeiro. `search` procura no nome, no texto da mensagem e na descrição da transação; filtro `kind`.",
  query: pageQuerySchema([] as const).extend(archiveFiltersSchema.shape),
  response: { schema: pageSchema(attachment.extend({ transaction: z.object({ id: z.uuid(), type: z.string(), description: z.string(), amount: z.string(), date: z.string(), accountId: z.uuid() }) }), "AttachmentArchivePage") },
});

documentPath({
  method: "post",
  path: "/transactions/{id}/confirm",
  tag,
  summary: "Confirma uma transação prevista (passa a liquidada)",
  description: "Só muda o estado; o resto fica como está. Exige a acção EDIT e um ano aberto.",
  params: idParamSchema,
  response: { schema: transactionSchema },
});
