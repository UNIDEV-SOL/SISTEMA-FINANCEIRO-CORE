import type { ZodError } from "zod";
import { ValidationException, type FieldError } from "../errors/http-exceptions";

/** Um erro por campo (o primeiro ganha), como o formulário do front espera. */
export function uniqueByField(errors: FieldError[]): FieldError[] {
  const seen = new Set<string>();
  return errors.filter((e) => !seen.has(e.field) && seen.add(e.field));
}

export const zodFieldErrors = (error: ZodError): FieldError[] =>
  uniqueByField(error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })));

/** Junta os erros de várias validações e lança 422 se houver algum. */
export function throwIfInvalid(...lists: FieldError[][]) {
  const errors = uniqueByField(lists.flat());
  if (errors.length) throw new ValidationException(errors);
}
