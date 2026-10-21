import { queryBoolean, requiredText, z } from "../../shared/http/schemas";

export const currencyCodeSchema = z
  .string({ error: "Indique o código ISO (3 letras)." })
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, { message: "Indique o código ISO (3 letras)." })
  .openapi({ example: "MZN" });

export const currencyCodeParamSchema = z.object({ code: currencyCodeSchema });

const fields = {
  name: requiredText("Indique o nome.", 60),
  symbol: requiredText("Indique o símbolo.", 8),
  decimals: z
    .number({ error: "Entre 0 e 4 casas decimais." })
    .int({ message: "Entre 0 e 4 casas decimais." })
    .min(0, { message: "Entre 0 e 4 casas decimais." })
    .max(4, { message: "Entre 0 e 4 casas decimais." })
    .optional()
    .default(2),
  active: z.boolean({ error: "Valor inválido." }).optional().default(true),
  order: z.number({ error: "Ordem inválida." }).int({ message: "Ordem inválida." }).min(0, { message: "Ordem inválida." }).optional(),
};

export const currencyCreateSchema = z.object({ code: currencyCodeSchema, ...fields }).openapi("CurrencyCreateInput");
export const currencyUpdateSchema = z.object(fields).openapi("CurrencyUpdateInput");

export type CurrencyCreateInput = z.infer<typeof currencyCreateSchema>;
export type CurrencyUpdateInput = z.infer<typeof currencyUpdateSchema>;

export const CURRENCY_SORTS = ["order", "code", "name"] as const;

export const currencyFiltersSchema = z.object({ active: queryBoolean().optional() });

export const currencySchema = z
  .object({
    code: z.string().openapi({ example: "MZN" }),
    name: z.string().openapi({ example: "Metical moçambicano" }),
    symbol: z.string().openapi({ example: "MT" }),
    decimals: z.number().int(),
    active: z.boolean(),
    order: z.number().int(),
  })
  .openapi("Currency");

export const adminCurrencySchema = currencySchema
  .extend({ userCount: z.number().int().openapi({ description: "Utilizadores com esta moeda." }) })
  .openapi("AdminCurrency");
