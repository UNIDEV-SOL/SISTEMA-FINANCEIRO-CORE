import { isoDateSchema, moneySchema, optionalText, positiveMoneySchema, z } from "../../shared/http/schemas";
import { transactionTypeSchema } from "../transactions/transactions.schemas";

export const MAX_IMPORT_TEXT = 50_000;
export const MAX_IMPORT_ITEMS = 200;
/** Tamanho máximo de um PDF enviado (bytes). */
export const MAX_PDF_BYTES = 5 * 1024 * 1024;

export const importTextSchema = z
  .object({
    text: z
      .string({ error: "Cole as mensagens." })
      .trim()
      .min(1, { message: "Cole as mensagens." })
      .max(MAX_IMPORT_TEXT, { message: `Máximo de ${MAX_IMPORT_TEXT} caracteres de cada vez.` }),
  })
  .openapi("ImportTextInput");

const sourceSchema = z.enum(["MPESA", "EMOLA", "BIM"]).openapi("ImportSource");
const kindSchema = z.enum(["INCOME", "EXPENSE", "DEPOSIT", "WITHDRAWAL", "FEE"]).openapi("ImportKind");

const previewItemSchema = z
  .object({
    source: sourceSchema,
    kind: kindSchema,
    type: transactionTypeSchema,
    reference: z.string().openapi({ example: "MPESA:ABC1DE2FGH3" }),
    amount: z.string().openapi({ example: "1000.00" }),
    date: z.string().openapi({ example: "2026-10-14" }),
    time: z.string().optional().openapi({ example: "21:28" }),
    description: z.string(),
    counterparty: z.string().optional(),
    accountNumber: z.string().optional(),
    balance: z.string().optional(),
    notes: z.string().optional(),
    raw: z.string(),
    status: z.enum(["NEW", "DUPLICATE", "POSSIBLE_DUPLICATE"]),
    match: z.object({ id: z.uuid(), description: z.string(), date: z.string(), amount: z.string() }).optional(),
    categoryId: z.uuid().optional().openapi({ description: "Sugestão: a categoria da última transação igual, ou uma categoria cujo nome aparece na descrição." }),
  })
  .openapi("ImportPreviewItem");

export const importPreviewSchema = z
  .object({
    items: z.array(previewItemSchema),
    unrecognized: z.array(z.string()).openapi({ description: "Mensagens que não foram reconhecidas." }),
    accounts: z
      .object({ MPESA: z.uuid().optional(), EMOLA: z.uuid().optional(), BIM: z.uuid().optional(), CASH: z.uuid().optional() })
      .openapi({ description: "Conta sugerida para cada origem (pelo número da conta, nome ou instituição) e a conta de dinheiro vivo." }),
    newAccounts: z
      .array(
        z.object({
          origin: z.enum(["MPESA", "EMOLA", "BIM", "CASH"]),
          name: z.string(),
          type: z.enum(["BANK", "MOBILE_WALLET", "CASH", "SAVINGS", "INVESTMENT"]),
          institution: z.string().optional(),
          number: z.string().optional(),
          color: z.string(),
        }),
      )
      .openapi({ description: "Contas propostas para as origens sem conta (criam-se com POST /accounts)." }),
    balances: z
      .array(z.object({ source: sourceSchema, balance: z.string(), date: z.string(), time: z.string().optional() }))
      .openapi({ description: "Saldo indicado na mensagem mais recente de cada origem." }),
  })
  .openapi("ImportPreview");

/** Cada movimento escolhido, já com as contas e a categoria; a validação é a das transações. */
export const importItemSchema = z.object({
  importRef: z.string({ error: "Referência inválida." }).trim().min(1).max(200),
  type: transactionTypeSchema,
  description: z.string(),
  amount: positiveMoneySchema("O valor tem de ser maior que zero."),
  date: isoDateSchema(),
  accountId: z.string(),
  destinationAccountId: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  notes: optionalText(500),
  /** O SMS original: fica como comprovativo da transação. */
  message: z.string().trim().max(5000).optional(),
});

export const importCommitSchema = z
  .object({
    items: z
      .array(z.unknown(), { error: "Escolha os movimentos a importar." })
      .min(1, { message: "Escolha pelo menos um movimento." })
      .max(MAX_IMPORT_ITEMS, { message: `Máximo de ${MAX_IMPORT_ITEMS} movimentos de cada vez.` }),
    balances: z
      .array(z.object({ accountId: z.uuid({ message: "Conta inválida." }), balance: moneySchema("Saldo inválido."), date: isoDateSchema() }))
      .max(10)
      .optional()
      .openapi({ description: "Saldos indicados nas mensagens, para comparar com a aplicação depois de importar." }),
  })
  .openapi("ImportCommitInput", { description: "Cada item: importRef, type, description, amount, date, accountId, destinationAccountId, categoryId, notes." });

export const importResultSchema = z
  .object({
    created: z.number().int(),
    skipped: z.number().int().openapi({ description: "Já importados antes (mesma referência)." }),
    differences: z
      .array(z.object({ accountId: z.uuid(), date: z.string(), reported: z.string(), actual: z.string(), difference: z.string() }))
      .openapi({ description: "Contas cujo saldo na aplicação (no fim do dia) difere do indicado na mensagem." }),
    transactions: z
      .record(z.string(), z.uuid())
      .openapi({ description: "Transação criada para cada importRef (para anexar o PDF de onde veio, por exemplo)." }),
  })
  .openapi("ImportResult");
