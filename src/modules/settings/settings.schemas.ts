import { requiredText, z } from "../../shared/http/schemas";

/** Código ISO de 3 letras; a existência e o estado activo são verificados no serviço. */
export const currencySchema = z
  .string({ error: "Moeda não suportada." })
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, { message: "Moeda não suportada." })
  .openapi("CurrencyCode", { example: "MZN" });

export const settingsInputSchema = z
  .object({
    name: requiredText("Indique o seu nome.", 80),
    email: z
      .string({ error: "Email inválido." })
      .trim()
      .toLowerCase()
      .pipe(z.email({ message: "Email inválido." })),
    currency: currencySchema,
  })
  .openapi("Settings");

export type SettingsInput = z.infer<typeof settingsInputSchema>;

export const exportSchema = z
  .object({
    exportedAt: z.string(),
    settings: settingsInputSchema,
    accounts: z.array(z.unknown()),
    categories: z.array(z.unknown()),
    transactions: z.array(z.unknown()),
    budgets: z.array(z.object({ categoryId: z.uuid(), limit: z.string() })),
    goals: z.array(z.unknown()),
    investments: z.array(z.unknown()),
  })
  .openapi("Export");
