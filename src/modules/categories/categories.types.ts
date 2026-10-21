import type { BudgetGroup, CategoryKind } from "../../generated/prisma";

export interface CategoryResponse {
  id: string;
  name: string;
  kind: CategoryKind;
  icon: string;
  color: string;
  /** Só nas despesas. */
  group?: BudgetGroup;
}
