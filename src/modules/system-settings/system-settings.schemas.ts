import { z } from "../../shared/http/schemas";
import { currencySchema } from "../currencies/currencies.schemas";

export const settingKeyParamSchema = z.object({
  key: z
    .string()
    .regex(/^[a-zA-Z0-9._-]{1,80}$/, { message: "Parâmetro inválido." })
    .openapi({ example: "pagination.defaultSize" }),
});

/** O tipo do valor depende do parâmetro; é validado no serviço. */
export const settingUpdateSchema = z
  .object({ value: z.unknown().openapi({ description: "Número, booleano, texto ou JSON (lista/objecto, ou o mesmo em texto), conforme o `type` do parâmetro.", example: 20 }) })
  .openapi("SystemSettingInput");

const settingTypeSchema = z.enum(["STRING", "NUMBER", "BOOLEAN", "SELECT", "TEXT", "JSON"]).openapi("SettingType");

export const systemSettingSchema = z
  .object({
    key: z.string().openapi({ example: "pagination.defaultSize" }),
    value: z.unknown().openapi({ example: 20 }),
    type: settingTypeSchema,
    group: z.string().openapi({ example: "pagination" }),
    label: z.string(),
    description: z.string().nullable(),
    options: z.array(z.object({ value: z.string(), label: z.string() })).nullable().openapi({ description: "Opções do SELECT (as dinâmicas já vêm calculadas)." }),
    constraints: z
      .object({
        min: z.number().optional(),
        max: z.number().optional(),
        integer: z.boolean().optional(),
        maxLength: z.number().optional(),
        source: z.enum(["currencies", "profiles"]).optional(),
        format: z.enum(["email", "timezone"]).optional(),
        shape: z.enum(["faq"]).optional().openapi({ description: "JSON: `faq` = lista de { question, answer }." }),
        minItems: z.number().int().optional(),
        maxItems: z.number().int().optional(),
      })
      .nullable(),
    public: z.boolean(),
    order: z.number().int(),
    updatedAt: z.string(),
    updatedBy: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  })
  .openapi("SystemSetting");

export const settingGroupSchema = z
  .object({ group: z.string(), label: z.string(), items: z.array(systemSettingSchema) })
  .openapi("SystemSettingGroup");

export const publicConfigSchema = z
  .object({
    settings: z.record(z.string(), z.unknown()).openapi({ example: { "app.name": "Finanças Smart", "pagination.defaultSize": 20 } }),
    currencies: z.array(currencySchema),
    assistant: z.object({ mode: z.enum(["ai", "offline"]) }),
  })
  .openapi("PublicConfig");
